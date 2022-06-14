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
			//if (type.slug === 'wohngebiet') continue;


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
				
				let filenameOut = config.getFilename.bufferedGeometry([type.slug, windTurbine.level, bundesland.properties.ags].join('-')+'.geojsonl');
				if (fs.existsSync(filenameOut)) {
					console.log('   already exists')
					continue;
				}

				let bbox = bundesland.bbox;
				bbox = turf.bboxPolygon(bbox);
				bbox = turf.buffer(bbox, windTurbine.dist/1000);
				bbox = turf.bbox(bbox);

				let filenameTemp = config.getFilename.bufferedGeometry('temp.geojsonl');
				let fd = fs.openSync(filenameTemp, 'w');
				let featureMerger = new FeatureMerger(function save(features) {
					console.log('\n   save')
					features.forEach(f => f.forEach(r => r.forEach(p => {
						p[0] /= 1e7;
						p[1] /= 1e7;
					})));
					let b = features2Coords([bundesland]);
					let result = [];
					features.forEach(f => polygonClipping.intersection([f], b).forEach(f => result.push(f)))
					result = coords2GeoJSON(result);
					result = turf.flatten(result);
					
					result = result.features.map(f => JSON.stringify(f)+'\n').join('');
					fs.writeSync(fd, result);
				})

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
								p[0] = Math.round(p[0]*1e7);
								p[1] = Math.round(p[1]*1e7);
							}))
							featureMerger.add(f);
						})
					})
					.drain()
					.finished(() => {
						featureMerger.flush();
						fs.closeSync(fd);
						fs.renameSync(filenameTemp, filenameOut);
						res();
					})
				)
			}
		}
	}
})()

function FeatureMerger(cbSave) {
	const featureTree = [[]];
	const featureTreeCount = [0];
	return {
		add,
		flush,
	}
	function add(feature) {
		featureTree[0].push(feature)
		if (featureTree[0].length > 10) merge();
	}

	function flush() {
		cbSave(merge(true))
	}

	function merge(force) {
		let i = 0;
		let lastI = featureTreeCount.length;
		while (true) {
			if (!featureTree[i+1]) {
				featureTree[i+1] = []
				featureTreeCount[i+1] = 0;
			}

			let coordinates = featureTree[i];
			featureTree[i] = [];
			featureTreeCount[i] = 0;

			let result;
			try {
				result = polygonClipping.union(coordinates);
			} catch (e) {
				cleanupCoordinates(coordinates);
				try {
					console.log('   merge in tiny steps …')
					result = splitAndMerge(coordinates);
					function splitAndMerge(c) {
						if (c.length > 2) {
							let i = Math.floor(c.length/2);
							let t = splitAndMerge(c.slice(0,i));
							splitAndMerge(c.slice(i)).forEach(f => t.push(f));
							return t;
						} else if (c.length < 2) {
							return c;
						} else {
							return polygonClipping.union(c);
						}
					}
				} catch (e) {
					console.log('\nPROBLEMS');
					fs.writeFileSync('error.json', JSON.stringify(coordinates, null, '\t'));
					throw e;
				}
			}

			if ((i > 2) && (JSON.stringify(result).length > 1e7)) {
				cbSave(result)
			} else {
				result.forEach(f => featureTree[i+1].push(f));
				featureTreeCount[i+1]++;
			}

			if (force) {
				if (i === lastI) return featureTree[i+1];
			} else {
				if (featureTreeCount[i+1] < 10) return;
			}

			i++;
		}
	}
}

function cleanupCoordinates(features) {
	features.forEach(feature => {
		feature.forEach(ring => {
			ring.forEach(point => {
				point[0] = Math.round(point[0]);
				point[1] = Math.round(point[1]);
			})
		})
	})
}
