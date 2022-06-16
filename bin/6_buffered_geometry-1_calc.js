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
		entry.files.forEach(f => {
			let full = config.getFilename.bufferedGeometry(f+'.geojsonl');
			if (!fs.existsSync(full)) throw Error('file is missing: '+full);
			if (fs.statSync(full).size === 0) return;
			vrt += `\t\t<OGRVRTLayer name="${f}"><SrcDataSource>${full}</SrcDataSource></OGRVRTLayer>\n`
		});
		vrt += `\t</OGRVRTUnionLayer>\n</OGRVRTDataSource>`;
		fs.writeFileSync(filename+'.vrt', vrt);

		console.log('generate',entry.layerName+'.gpkg')
		await new Promise(res => {
			let cp = child_process.spawn('ogr2ogr', ['-progress', filename+'.gpkg', filename+'.vrt'])
			cp.on('close', res);
			cp.stderr.pipe(process.stderr);
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
	const Havel = require('havel');
	const turf = require('@turf/turf');
	const polygonClipping = require('polygon-clipping');
	const { doBboxOverlap, features2Coords, coords2GeoJSON } = require('../lib/geohelper.js');

	let bbox = bundesland.bbox;
	bbox = turf.bboxPolygon(bbox);
	bbox = turf.buffer(bbox, windTurbine.dist/1000);
	bbox = turf.bbox(bbox);

	let fd = fs.openSync(filenameTmp, 'w');
	let featureMerger = new FeatureMerger(function save(features) {
		//console.log('   save')
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
		.forEach(line => {
			if (line.length === 0) return;
			let feature = JSON.parse(line);
			i++;
			if (i % 20000 === 0) console.log('   ',i);

			//console.log('OBJECTID', feature.properties.OBJECTID, line.length);

			turf.flatten(feature).features.forEach(feature => {
				feature.bbox = turf.bbox(feature);

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
		const MAX_VERTICES = 1e4;
		let featureTree, featureTreeCount, featureTreeSize, maxIndex, verticesCount;
		//setInterval(log, 10000);
		init();
		return { add, flush }

		function init() {
			featureTree = [];
			featureTreeSize = [];
			featureTreeCount = [];
			maxIndex = 0;
			verticesCount = 0;
			//triggerFlush = false;
			for (let i = 0; i < 10; i++) {
				featureTree[i] = [];
				featureTreeSize[i] = 0;
				featureTreeCount[i] = 0;
			}
		}

		function add(feature) {
			featureTree[0].push(feature);

			let size = countPoints(feature);
			featureTreeSize[0] += size;

			verticesCount += size;
			//console.log('add', verticesCount);
			if (verticesCount > MAX_VERTICES) return flush();

			if (featureTree[0].length > 10) merge();
		}

		function flush() {
			cbSave(merge(true))
		}

		function merge(force) {
			let i = 0;
			while (true) {
				let coordinates = featureTree[i];
				featureTree[i] = [];
				featureTreeSize[i] = 0;
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

				i++;

				result.forEach(f => {
					featureTreeSize[i] += countPoints(f);
					featureTree[i].push(f);
				});
				featureTreeCount[i]++;
				if (i > maxIndex) maxIndex = i;

				if (force) {
					if ((i === maxIndex) && (featureTreeCount[i] === 1)) {
						let result = featureTree[i];
						init();
						return result;
					}
				} else {
					verticesCount = 0;
					featureTreeSize.forEach(s => verticesCount += s);
					//console.log('merge', verticesCount, featureTree[i].length);
					if (verticesCount > MAX_VERTICES) return flush();
					if (featureTree[i].length > 20) return flush();
					if (featureTreeCount[i] < 10) return;
				}
			}
		}

		function countPoints(f) {
			let size = 0;
			f.forEach(r => size += r.length);
			return size;
		}

		function log() {
			console.log('tree:')
			featureTree.forEach(m => {
				console.log('   '+m.map(f => {
					let size = 0;
					f.forEach(r => size += r.length);
					return size;
				}).join(','))
			})
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
