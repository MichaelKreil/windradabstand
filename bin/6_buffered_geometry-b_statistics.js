#!/usr/bin/env node
'use strict'

const config = require('../config.js');
const { simpleCluster } = require('big-data-tools');
const turf = require('@turf/turf');

let bigBufferFilename = config.getFilename.bufferedGeometry('all.gpkg');

simpleCluster(async function (runWorker) {
	const { getBundeslaender } = require('../lib/geohelper.js');
	
	let bundeslaender = getBundeslaender();

	//bundeslaender = bundeslaender.slice(4);

	let results = [];
	
	await bundeslaender.forEachParallel(async bundesland => {
		let result = await runWorker(bundesland);
		results.push(result);
	})

	let keys = new Set();
	results.forEach(e => Object.keys(e).forEach(k => keys.add(k)));
	keys = Array.from(keys.values());
	console.log(keys.join('\t'));
	results.forEach(e => console.log(keys.map(k => e[k]).join('\t')));

}, async bundesland => {
	const Havel = require('havel');
	const polygonClipping = require('polygon-clipping');
	const { coords2Feature, features2Coords } = require('../lib/geohelper.js');
	const { writeFileSync, fstat, existsSync, readFileSync } = require('fs');

	console.log(bundesland.properties.name);

	let areaAll, areaLeft, areaBanned;
	if (existsSync(getFilename('banned'))) {
		areaAll = JSON.parse(readFileSync(getFilename('all'))).features[0].properties.area;
		areaLeft = JSON.parse(readFileSync(getFilename('left'))).features[0].properties.area;
		areaBanned = JSON.parse(readFileSync(getFilename('banned'))).features[0].properties.area;
	} else {
		areaAll = turf.area(bundesland) / 1e6;
		bundesland.properties.area = areaAll;
		save('all', bundesland);

		let bbox = turf.bbox(bundesland);
		let geometryLeft = scaleUp(features2Coords([bundesland]));
		let spawnArgs = ['-spat'].concat(bbox.map(v => v.toString())).concat(['-f', 'GeoJSONSeq', '/vsistdout/', bigBufferFilename]);
		await new Promise(res => {
			let todos = [], todoSize = 0;
			Havel.pipeline()
				.spawnOut('ogr2ogr', spawnArgs)
				.split()
				.forEach((line, i) => {
					if (i % 1000 === 0) console.log('   ', i, bundesland.properties.name);
					if (line.length === 0) return;
					todoSize += line.length;
					let feature = JSON.parse(line);
					todos.push(feature);
					if (todoSize > 1 * 1024 * 1024) handle();
				})
				.drain()
				.finished(() => {
					handle();
					res();
				})
		
			function handle() {
				geometryLeft = diff(geometryLeft, scaleUp(features2Coords(todos)))
				todos = [];
				todoSize = 0;
			}
		})

		let featureLeft = coords2Feature(scaleDown(geometryLeft));
		areaLeft = turf.area(featureLeft) / 1e6;
		featureLeft.properties.area = areaLeft;
		save('left', featureLeft);

		let geometryBanned = diff(scaleUp(features2Coords([bundesland])), geometryLeft);
		let featureBanned = coords2Feature(scaleDown(geometryBanned));
		areaBanned = turf.area(featureBanned) / 1e6;
		featureBanned.properties.area = areaBanned;
		save('banned', featureBanned);
	}
	
	let result = {
		name: bundesland.properties.name,
		areaAll,
		areaBanned,
		areaBannedCheck: areaAll - areaLeft,
		areaLeft,
		areaPercent: (100 * areaLeft / areaAll).toFixed(2) + '%',
	}
	console.log(result);

	return result;

	function save(type, feature) {
		writeFileSync(getFilename(type), JSON.stringify(turf.featureCollection([feature])));
	}

	function getFilename(type) {
		return config.getFilename.bufferedGeometry(type + '-' + bundesland.properties.ags + '.geojson');
	}

	function scaleUp(features) {
		return features.map(feature => feature.map(ring => ring.map(point => ([
			Math.round(point[0] * 1e7),
			Math.round(point[1] * 1e7)
		]))))
	}

	function scaleDown(features) {
		return features.map(feature => feature.map(ring => ring.map(point => ([
			point[0] / 1e7,
			point[1] / 1e7
		]))))
	}

	function diff(a,b) {
		let backup = a;
		b = cleanupCoordinates(b);
		try {
			a = polygonClipping.difference(a, b);
			a = cleanupCoordinates(a);
			return a;
		} catch (e) {
			a = backup;
			if (b.length >= 2) {
				let i = Math.floor(b.length / 2);
				a = diff(a, b.slice(0, i));
				a = diff(a, b.slice(i));
				return a;
			} else {
				console.log(b);
				throw Error('es funktioniert nicht')
			}
		}

		function cleanupCoordinates(features) {
			return features.map(feature => {
				return feature.map(ring => {
					ring.forEach(point => {
						point[0] = Math.round(point[0]*1e3)/1e3;
						point[1] = Math.round(point[1]*1e3)/1e3;
					})
					let p0 = [];
					return ring.filter(point => {
						if ((point[0] === p0[0]) && (point[1] === p0[1])) return false;
						p0 = point;
						return true;
					})
				})
			})
		}
	}
})


