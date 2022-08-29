#!/usr/bin/env node
'use strict'



const { simpleCluster } = require('big-data-tools');
const { resolve, dirname, extname, basename } = require('path');
const { readFileSync, renameSync, createWriteStream, rmSync, existsSync, statSync, createReadStream } = require('fs');
const { createGzip, createGunzip } = require('zlib');
const { spawn } = require('child_process');



simpleCluster(async runWorker => {
	const config = require('../config.js');

	const { ruleTypes, bundeslaender } = JSON.parse(readFileSync(config.getFilename.bufferedGeometry('index.json')));

	let todos = [];
	ruleTypes.forEach(ruleType => {
		ruleType.regions.forEach(region => {
			let bundesland = bundeslaender.find(b => b.ags === region.ags);
			todos.push({ bundesland, ruleType, region })
		})
	})

	await todos.forEachParallel(runWorker);

	console.log('Finished')

	process.exit();

}, async todo => {
	const turf = require('@turf/turf');
	const miss = require('mississippi2');


	const { bundesland, ruleType, region } = todo;
	const radius = region.radius / 1000;
	const filename1 = region.filenameBase + '.1_buf.geojsonl.gz';
	const filename2 = region.filenameBase + '.geojsonl.gz';

	if (existsSync(filename2)) return;

	console.log(ruleType.slug, region.ags);

	if (!existsSync(filename1)) {
		await extractAndBuffer(bundesland.bbox, radius, ruleType.slug, ruleType.filenameIn, filename1);
	}

	if (statSync(filename1).size > 30) {
		if (radius > 0) {
			await unionClipAndFlatten(bundesland.filename, filename1, filename2)
		} else {
			await clip(bundesland.filename, filename1, filename2)
		}
	}

	return

	async function extractAndBuffer(bbox, radius, layerName, filenameIn, filenameOut) {
		let filenameTmp = calcTemporaryFilename(filenameOut);
		if (!filenameOut.endsWith('.geojsonl.gz')) throw Error('file extension must be .geojsonl.gz');

		bbox = turf.bboxPolygon(bbox);
	bbox = turf.buffer(bbox, radius, { steps: 18 });
	bbox = turf.bbox(bbox);

		let spawnArgs = ['-spat']
		.concat(bbox.map(v => v.toString()))
		.concat(['-dialect', 'SQLite'])
			.concat(['-sql', 'SELECT geom as geometry FROM ' + layerName]) // ignore all attributes
		.concat(['-f', 'GeoJSONSeq'])
			.concat(['/vsistdout/', filenameIn]);
	
		let cp = spawn('ogr2ogr', spawnArgs);
		cp.stderr.pipe(process.stderr);
		cp.on('exit', code => {
			if (code > 0) {
				console.log({ todo, spawnArgs });
				throw Error();
			}
		})

		let stream = cp.stdout;
	if (radius > 0) {
			stream = stream.pipe(miss.split());
			stream = stream.pipe(miss.through.obj(function (line, enc, next) {
			if (line.length === 0) return next();
			turf.flattenEach(JSON.parse(line), f => {
				f = JSON.stringify(turf.buffer(f, radius, { steps: 18 })) + '\n';
				this.push(f);
			})
			next();
		}))
	}

		stream = stream.pipe(createGzip())
		stream = stream.pipe(createWriteStream(filenameTmp))

		await new Promise(res => stream.on('close', res))

		renameSync(filenameTmp, filenameOut);
	}

	async function unionClipAndFlatten(bundeslandFilename, filenameIn, filenameOut) {
		if (!filenameOut.endsWith('.geojsonl.gz')) throw Error('file extension must be .geojsonl.gz');

		let layerName = basename(filenameIn, '.gz');
		let filenameTmp2 = calcTemporaryFilename(filenameOut);
		let filenameTmp1 = calcTemporaryFilename(filenameTmp2);

		let spawnArgs1 = [
			//'--debug', 'ON',
			'-skipfailures',
			'-dialect', 'SQLite',
			'-sql', `SELECT ST_Union(ST_MakeValid(geometry)) AS geometry FROM "${layerName}"`,
			'-clipdst', bundeslandFilename,
			'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
			'-f', 'GeoJSONSeq',
			'-nlt', 'MULTIPOLYGON',
			'/vsigzip/' + filenameTmp1, 'GeoJSONSeq:/vsigzip/' + filenameIn,
		]
		let cp1 = spawn('ogr2ogr', spawnArgs1);
		cp1.stderr.pipe(process.stderr);
		cp1.on('exit', code => {
			if (code > 0) {
				console.log({ todo, spawnArgs1 });
				throw Error();
			}
		})

		await new Promise(res => cp1.on('close', res))



		let spawnArgs2 = [
			'-cr',
			'.geometry | if .type != "MultiPolygon" then error("wrong type "+.type) else .coordinates[] | {type:"Feature",geometry:{type:"Polygon",coordinates:.}} | @json end'
		]
		let cp2 = spawn('jq', spawnArgs2);
		cp2.stderr.pipe(process.stderr);
		cp2.on('exit', code => {
			if (code > 0) {
				console.log({ todo, spawnArgs2 });
				throw Error();
			}
		})

		let stream2 = createReadStream(filenameTmp1);
		stream2 = stream2.pipe(createGunzip());
		stream2.pipe(cp2.stdin);
		stream2 = cp2.stdout;
		stream2 = stream2.pipe(createGzip());
		stream2 = stream2.pipe(createWriteStream(filenameTmp2));

		await new Promise(res => stream2.on('close', res))

		rmSync(filenameTmp1);
		renameSync(filenameTmp2, filenameOut);
	}

	async function clip(bundeslandFilename, filenameIn, filenameOut) {
		if (!filenameOut.endsWith('.geojsonl.gz')) throw Error('file extension must be .geojsonl.gz');

		let filenameTmp1 = calcTemporaryFilename(filenameOut);

		let spawnArgs1 = [
			//'--debug', 'ON',
			'-clipdst', bundeslandFilename,
			'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
			'-f', 'GeoJSONSeq',
			'/vsigzip/' + filenameTmp1, 'GeoJSONSeq:/vsigzip/' + filenameIn,
		]
		let cp1 = spawn('ogr2ogr', spawnArgs1);
		cp1.stderr.pipe(process.stderr);
		cp1.on('exit', code => {
			if (code > 0) {
				console.log({ todo, spawnArgs1 });
				throw Error();
	}
		})

		await new Promise(res => cp1.on('close', res))

		renameSync(filenameTmp1, filenameOut);
	}

	function calcTemporaryFilename(filename) {
		let dir = dirname(filename);
		let name = basename(filename);
		let filenameTmp = resolve(dir, 'tmp-' + name);
		if (existsSync(filenameTmp)) rmSync(filenameTmp);
		return filenameTmp;
	}
})


