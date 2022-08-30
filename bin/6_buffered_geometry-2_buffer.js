#!/usr/bin/env node
'use strict'



const { simpleCluster } = require('big-data-tools');
const { resolve, dirname, basename } = require('path');
const { readFileSync, renameSync, createWriteStream, rmSync, existsSync, statSync, createReadStream } = require('fs');
const { createGzip, createGunzip } = require('zlib');
const { spawn } = require('child_process');
const turf = require('@turf/turf');
const miss = require('mississippi2');
const config = require('../config.js');



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
				filename1: region.filenameBase + '.1_buf.geojsonl.gz',
				filename2: region.filenameBase + '.geojsonl.gz',
			})
		})
	})

	todos = todos.filter(t => !existsSync(t.filename2));

	console.log('start buffer');

	await todos.forEachParallel(runWorker);

	console.log('start union');

	await todos.forEachParallel(1, async todo => {
		if (existsSync(todo.filename2)) return;

		console.log('union', todo.ruleType.slug, todo.region.ags);
		if (statSync(todo.filename1).size > 30) {
			if (todo.radius > 0) {
				await unionClipAndFlatten(todo.bundesland.filename, todo.filename1, todo.filename2)
			} else {
				await clip(todo.bundesland.filename, todo.filename1, todo.filename2)
			}
			rmSync(todo.filename1);
		}
	});

	console.log('finished')

	process.exit();

}, async todo => {

	const { bundesland, ruleType, region } = todo;

	if (existsSync(todo.filename1)) return;
	console.log('buffer', ruleType.slug, region.ags);

	await extractAndBuffer(bundesland.bbox, todo.radius, ruleType.slug, ruleType.filenameIn, todo.filename1);

	return
})

function calcTemporaryFilename(filename) {
	let dir = dirname(filename);
	let name = basename(filename);
	let filenameTmp = resolve(dir, 'tmp-' + name);
	if (existsSync(filenameTmp)) rmSync(filenameTmp);
	return filenameTmp;
}

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
			console.log({ spawnArgs });
			throw Error();
		}
	})

	let stream = cp.stdout;
	if (radius > 0) {
		stream = stream.pipe(miss.split());
		stream = stream.pipe(miss.through.obj(function (line, enc, next) {
			if (line.length === 0) return next();
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
		'-sql', `SELECT ST_Union(geometry) AS geometry FROM "${layerName}"`,
		'-clipdst', bundeslandFilename,
		'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
		'-f', 'GeoJSONSeq',
		'-nlt', 'MULTIPOLYGON',
		'/vsigzip/' + filenameTmp1, 'GeoJSONSeq:/vsigzip/' + filenameIn,
	]
	//console.log({ spawnArgs1, layerName, bundeslandFilename, filenameIn, filenameTmp1 });
	let cp1 = spawn('ogr2ogr', spawnArgs1);
	cp1.stderr.pipe(process.stderr);
	cp1.on('exit', code => {
		if (code > 0) {
			console.log({ spawnArgs1 });
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
			console.log({ spawnArgs2 });
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

	renameSync(filenameTmp2, filenameOut);
	rmSync(filenameTmp1);
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