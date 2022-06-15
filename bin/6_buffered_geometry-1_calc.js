#!/usr/bin/env node
'use strict'

const { simpleCluster } = require('big-data-tools');

simpleCluster(async function (runWorker) {
	const fs = require('fs');
	const child_process = require('child_process');
	const turf = require('@turf/turf');
	const config = require('../config.js');
	const { getBundeslaender } = require('../lib/geohelper.js');

	deleteTemporaryFiles()

	let todoGenerate = [];
	let todoMerge = new Map();

	for (let bundesland of getBundeslaender()) {
		let rules = config.rules.get(bundesland.properties.ags);
		for (let ruleType of config.ruleTypes) {
			let func = rules[ruleType.slug];
			if (!func) continue;

			let filenameIn = config.getFilename.mapFeature(ruleType.slug+'.fgb');
			if (!fs.existsSync(filenameIn)) {
				console.log('File '+filenameIn+' is missing');
				process.exit();
			}
			let workEffort = fs.statSync(filenameIn).size * turf.area(bundesland);

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

			for (let windTurbine of windTurbines) {

				let name = [ruleType.slug, windTurbine.level, bundesland.properties.ags].join('-');
				let filenameOut = config.getFilename.bufferedGeometry(name+'.geojsonl');
				let layerName = [ruleType.slug, windTurbine.level].join('-');
				let filenameTmp = config.getFilename.bufferedGeometry('tmp-'+Math.random().toString(36).slice(2)+'.geojsonl');

				let todo = {
					bundesland,
					ruleType,
					windTurbine,
					filenameIn,
					filenameOut,
					filenameTmp,
					workEffort,
				}

				if (!fs.existsSync(filenameOut)) todoGenerate.push(todo);

				if (!todoMerge.has(layerName)) todoMerge.set(layerName, { layerName, workEffort:0, files:[] })
				todoMerge.get(layerName).workEffort += workEffort;
				todoMerge.get(layerName).files.push(name);
			}
		}
	}

	todoGenerate.sort((a,b) => b.workEffort - a.workEffort);
	
	await todoGenerate.forEachParallel(runWorker)

	deleteTemporaryFiles();

	todoMerge = Array.from(todoMerge.values());
	todoMerge.sort((a,b) => b.workEffort - a.workEffort);

	await todoMerge.forEachParallel(async entry => {
		let filename = config.getFilename.bufferedGeometry(entry.layerName);
		let vrt = `<OGRVRTDataSource>\n\t<OGRVRTUnionLayer name="${entry.layerName}">\n`;
		entry.files.forEach((f,i) => {
			vrt += `\t\t<OGRVRTLayer name="${f}"><SrcDataSource>${f}.geojsonl</SrcDataSource></OGRVRTLayer>\n`
		});
		vrt += `\t</OGRVRTUnionLayer>\n</OGRVRTDataSource>`;
		fs.writeFileSync(filename+'.vrt', vrt);

		await new Promise(res => {
			child_process.spawn('ogr2ogr', ['-progress', filename+'.fgb', filename+'.vrt'])
				.on('close', res);
		})
	})
	
	console.log('finished');



	function deleteTemporaryFiles() {
		fs.readdirSync(config.folders.bufferedGeometry).forEach(f => {
			if (/^tmp-/.test(f)) fs.rmSync(config.getFilename.bufferedGeometry(f));
		})
	}
}, async item => {
	const { bundesland, ruleType, windTurbine, filenameIn, filenameOut, filenameTmp } = item;

	console.log('processing '+[bundesland.properties.name, ruleType.slug, 'level '+windTurbine.level].join(' - '));
	
	const fs = require('fs');
	const child_process = require('child_process');
	const Havel = require('havel');
	const turf = require('@turf/turf');
	const polygonClipping = require('polygon-clipping');
	const { doBboxOverlap, features2Coords, coords2GeoJSON } = require('../lib/geohelper.js');

	function spawnOut(cmd, args) {
		const process = child_process.spawn(cmd, args, { highWaterMark: 1024 * 1024 });
		return { readable: process.stdout }
	}
	Havel.registerNodeFactoryStream('spawnOut', spawnOut);

	let bbox = bundesland.bbox;
	bbox = turf.bboxPolygon(bbox);
	bbox = turf.buffer(bbox, windTurbine.dist/1000);
	bbox = turf.bbox(bbox);

	let fd = fs.openSync(filenameTmp, 'w');
	let featureMerger = new FeatureMerger(function save(features) {
		console.log('   save')
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

	let spawnArgs = ['-spat'].concat(bbox.map(v => v.toString())).concat(['-f', 'GeoJSONSeq', '/vsistdout/', filenameIn]);
	let i = 0;
	await new Promise(res => Havel.pipeline()
		.spawnOut('ogr2ogr', spawnArgs)
		.split()
		.forEach(feature => {
			if (feature.length === 0) return;
			feature = JSON.parse(feature);
			feature.bbox = turf.bbox(feature);

			i++;
			if (i % 20000 === 0) console.log('   ',i);

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
			fs.renameSync(filenameTmp, filenameOut);
			res();
		})
	)

	function FeatureMerger(cbSave) {
		let featureTree, featureTreeCount
		init();
		return { add, flush }

		function init() {
			featureTree = [[]];
			featureTreeCount = [0];
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
						console.log('PROBLEMS');
						fs.writeFileSync('error.json', JSON.stringify(coordinates, null, '\t'));
						throw e;
					}
				}

				result.forEach(f => featureTree[i+1].push(f));
				featureTreeCount[i+1]++;

				if (force) {
					if (i === lastI) {
						let result = featureTree[i+1];
						init()
						return result;
					}
				} else {
					if (i >= 2) {
						let size = 0;
						featureTree[i+1].forEach(f => f.forEach(r => size += r.length));
						if (size > 1e4) {
							flush();
							return;
						}
					}
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
})
