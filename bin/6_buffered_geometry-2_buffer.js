#!/usr/bin/env node
'use strict'



const { simpleCluster } = require('big-data-tools');
const { readFileSync, renameSync, rmSync, existsSync, createWriteStream } = require('fs');
const turf = require('@turf/turf');
const miss = require('mississippi2');
const config = require('../config.js');
const { getSpawn, calcTemporaryFilename } = require('../lib/helper.js');
const { ogrWrapFileDriver, ogrLoadGpkgAsGeojsonStream, ogrGenerateSQL, unionAndClipFeaturesDC, convertGzippedGeoJSONSeq2Anything } = require('../lib/geohelper.js');
const { createGzip } = require('zlib');



simpleCluster(async runWorker => {
	const { ruleTypes, bundeslaender } = JSON.parse(readFileSync(config.getFilename.bufferedGeometry('index.json')));

	let todos = [];
	ruleTypes.forEach(ruleType => {
		ruleType.regions.forEach(region => {
			let bundesland = bundeslaender.find(b => b.ags === region.ags);
			todos.push({
				bundesland,
				ruleType,
				region,
				radius: region.radius / 1000,
				filenameIn: ruleType.filenameIn,
				filenameOut: region.filenameBase + '.gpkg',
			})
		})
	})

	todos = todos.filter(t => !existsSync(t.filenameOut));
	
	//todos = todos.filter(t => [2,4,6,11].includes(t.bundesland.ags));

	await todos.forEachParallel(runWorker);

	console.log('finished')

	process.exit();

}, async todo => {

	let name = '\x1b[90m'+todo.ruleType.slug+' '+todo.region.ags+'/'+todo.bundesland.name+'\x1b[0m';

	console.log('process', name);

	let filenameIn = todo.filenameIn + '.gpkg';

	if (todo.radius > 0) {

		let bbox = turf.bboxPolygon(todo.bundesland.bbox);
		bbox = turf.buffer(bbox, todo.radius, { steps: 18 });
		bbox = turf.bbox(bbox);

		let filenameGeoGz = todo.region.filenameBase + '.tmp.geojsonl.gz';
		if (!existsSync(filenameGeoGz)) {
			console.log('   1/3 extract and buffer', name);
			let filenameTmp = calcTemporaryFilename(filenameGeoGz)
			await new Promise(res => {
				ogrLoadGpkgAsGeojsonStream(filenameIn, {
					dropProperties: true,
					bbox,
				})
					.pipe(calcBuffer(todo.radius))
					.pipe(createGzip())
					.pipe(createWriteStream(filenameTmp))
					.once('close', () => res())
			});
			renameSync(filenameTmp, filenameGeoGz);
		}
		
		let filenameTmp = todo.region.filenameBase + '.tmp.gpkg';
		if (!existsSync(filenameTmp)) {
			console.log('   2/3 convert to gpkg', name);
			await convertGzippedGeoJSONSeq2Anything(filenameGeoGz, filenameTmp, { dropProperties: true });
		}

		console.log('   3/3 union', name);
		await unionAndClipFeaturesDC(filenameTmp, todo.bundesland.filename, todo.filenameOut);

		rmSync(filenameTmp);
		rmSync(filenameGeoGz);
	} else {
		let filenameTmp = calcTemporaryFilename(todo.filenameOut);

		console.log('   1/1 extract only', name);
		let cp = getSpawn('ogr2ogr', [
			'-a_srs', 'EPSG:4326',
			'-dialect', 'SQLite',
			'-sql', ogrGenerateSQL({
				dropProperties: true,
				bbox: todo.bundesland.bbox,
			}),
			'-clipdst', todo.bundesland.filename,
			'-nlt', 'MULTIPOLYGON',
			'-nln', 'layer',
			'-lco', 'GEOMETRY_NAME=geometry',
			filenameTmp,
			ogrWrapFileDriver(filenameIn),
		]);

		await new Promise(res => cp.once('close', res))

		renameSync(filenameTmp, todo.filenameOut);
	}

	function calcBuffer(radius) {
		return miss.through.obj(function (line, enc, cb) {
			if (line.length === 0) return cb();
			let f0 = JSON.parse(line);
			turf.flattenEach(f0, f1 => {
				f1 = turf.buffer(f1, radius, { steps: 18 });
				turf.flattenEach(f1, f2 => {
					cleanupFeature(f2);
					try {
						f2 = turf.unkinkPolygon(f2);
					} catch (e) {
						console.dir(f2, { depth: 10 });
						throw e;
					}
					f2.features.forEach(f3 => {
						this.push(JSON.stringify(f3) + '\n');
					})
				})
			})
			cb();
		})

		function cleanupFeature(feature) {
			if (feature.geometry.type !== 'Polygon') throw Error(feature.geometry.type);
			feature.geometry.coordinates = feature.geometry.coordinates.map(ring => {
				let lastp = [];
				return ring.filter(p => {
					p = p.map(v => Math.round(v * 1e8) / 1e8);
					if ((p[0] === lastp[0]) && (p[1] === lastp[1])) return false;
					lastp = p;
					return true;
				})
			})
		}
	}
})
