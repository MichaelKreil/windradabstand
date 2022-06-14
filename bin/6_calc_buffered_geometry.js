#!/usr/bin/env node
'use strict'



const fs = require('fs');
const Havel = require('havel');
const turf = require('@turf/turf');
const config = require('../config.js');
const polygonClipping = require('polygon-clipping');
const { doBboxOverlap, getBundeslaender, features2Coords, coords2GeoJSON } = require('../lib/geohelper.js');



(async () => {
	for (let bundesland of getBundeslaender()) {
		let rules = config.rules.get(bundesland.properties.ags);
		for (let type of config.ruleTypes) {
			let func = rules[type.slug];
			if (!func) continue;

			if (type.slug === 'wohngebaeude') continue;
			if (type.slug === 'wohngebiet') continue;


			// Wir berechnen die Geometrien für alle 3 typischen Windturbinen,
			// aber müssen das nur tun, wenn sich unterschiedliche Abstände ergeben.
			let windTurbines = new Map();
			config.typicalWindTurbines.forEach(windTurbine => {
				let { level } = windTurbine;
				let dist = func(windTurbine.Nabenhoehe, windTurbine.Rotordurchmesser/2);
				if (windTurbines.has(dist) && (windTurbines.get(dist).level < level)) return;
				windTurbines.set(dist, {level, dist});
			})
			windTurbines = Array.from(windTurbines.values());

			let filenameIn = config.getFilename.mapFeature(type.slug+'.geojsonl');

			for (let windTurbine of windTurbines) {
				console.log('processing '+[bundesland.properties.name, type.slug, 'level '+windTurbine.level].join(' - '));
				
				let filenameOut = config.getFilename.bufferedGeometry([type.slug, windTurbine.level, bundesland.properties.ags].join('-')+'.geojson');
				if (fs.existsSync(filenameOut)) {
					console.log('   already exists')
					continue;
				}

				let bbox = bundesland.bbox;
				bbox = turf.bboxPolygon(bbox);
				bbox = turf.buffer(bbox, windTurbine.dist/1000);
				bbox = turf.bbox(bbox);

				const featureTree = [[]];
				const featureTreeCount = [0];
				await new Promise(res => Havel.pipeline()
					.readFile(filenameIn, { showProgress: true })
					.spawn('jq', ['-c', `. | select (.bbox[0] < ${bbox[2]}) | select (.bbox[1] < ${bbox[3]}) | select (.bbox[2] > ${bbox[0]}) | select (.bbox[3] > ${bbox[1]})`])
					.split()
					.forEach(feature => {
						if (feature.length === 0) return;
						feature = JSON.parse(feature);

						if (!doBboxOverlap(bbox, feature.bbox)) return;
						feature = turf.buffer(feature, windTurbine.dist/1000);
						features2Coords([feature]).forEach(f => {
							f.forEach(r => r.forEach(p => {
								p[0] = Math.round(p[0]*1e6);
								p[1] = Math.round(p[1]*1e6);
							}))
							featureTree[0].push(f)
						});
						if (featureTree[0].length > 10) merge();
					})
					.drain()
					.finished(() => {
						let features = merge(true);
						features.forEach(f => f.forEach(r => r.forEach(p => {
							p[0] /= 1e6;
							p[1] /= 1e6;
						})));
						features = polygonClipping.intersection(features, features2Coords([bundesland]));
						features = coords2GeoJSON(features);
						features = turf.flatten(features);
						features = JSON.stringify(features);
						fs.writeFileSync(filenameOut, features);
						res();
					})
				)

				function merge(force) {
					let i = 0;
					let lastI = featureTreeCount.length;
					while (true) {
						if (!featureTree[i+1]) {
							featureTree[i+1] = []
							featureTreeCount[i+1] = 0;
						}

						let result;
						try {
							result = polygonClipping.union(featureTree[i]);
						} catch (e) {
							// ok, irgendwas hat nicht funktioniert
							// also wigglen an allen Koordinaten und schauen, ob es dann funktioniert
							console.log('\n   problems …');
							let c = featureTree[i];
							fs.writeFileSync('test.json', JSON.stringify(c, null, '\t'));
							//result = polygonClipping.union(c);
							throw e;
						}
						result.forEach(f => featureTree[i+1].push(f));

						featureTree[i] = [];
						featureTreeCount[i] = 0;
						featureTreeCount[i+1]++;
						if (force) {
							if (i === lastI) return featureTree[i+1];
						} else {
							if (featureTreeCount[i+1] < 10) return;
						}
						i++;
					}
				}
			}
		}
	}
})()
