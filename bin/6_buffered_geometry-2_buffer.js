#!/usr/bin/env node
'use strict'


const { simpleCluster } = require('big-data-tools');

simpleCluster(async runWorker => {
	const config = require('../config.js');
	const { readFileSync } = require('fs');

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
	const { createWriteStream, rmSync, statSync, createReadStream } = require('fs');
	const { spawn } = require('child_process');
	const turf = require('@turf/turf');
	const miss = require('mississippi2');
	const { createGzip, createGunzip } = require('zlib');

	const { bundesland, ruleType, region } = todo;
	const radius = region.radius / 1000;
	const filename1 = region.filenameBase + '.1_buf.geojsonl.gz';
	const filename2 = region.filenameBase + '.2_uni.geojsonl.gz';
	const filename3 = region.filenameBase + '.3_pol.geojsonl.gz';

	console.log(ruleType.slug, region.ags);

	let bbox = turf.bboxPolygon(bundesland.bbox);
	bbox = turf.buffer(bbox, radius, { steps: 18 });
	bbox = turf.bbox(bbox);

	let spawnArgs1 = ['-spat']
		.concat(bbox.map(v => v.toString()))
		.concat(['-sql', 'SELECT geom FROM ' + ruleType.slug]) // ignore all attributes
		.concat(['-f', 'GeoJSONSeq'])
		.concat(['/vsistdout/', ruleType.filenameIn]);
	
	let cp1 = spawn('ogr2ogr', spawnArgs1);
	cp1.stderr.pipe(process.stderr);

	let stream1 = cp1.stdout;
	if (radius > 0) {
		stream1 = stream1.pipe(miss.split());
		stream1 = stream1.pipe(miss.through.obj(function (line, enc, next) {
			if (line.length === 0) return next();
			turf.flattenEach(JSON.parse(line), f => {
				f = JSON.stringify(turf.buffer(f, radius, { steps: 18 })) + '\n';
				this.push(f);
			})
			next();
		}))
	}

	stream1 = stream1.pipe(createGzip())
	stream1 = stream1.pipe(createWriteStream(filename1))

	await new Promise(res => stream1.on('close', res))

	rmSync(filename2, { force: true });
	if (statSync(filename1).size > 30) {

		let spawnArgs2 = [
			//'--debug', 'ON',
			'-skipfailures',
			'-dialect', 'SQLite',
			'-sql', `SELECT ST_Union(geometry) AS geometry FROM "${region.ags}.1_buf.geojsonl"`,
			'-clipdst', bundesland.filename,
			'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
			'-f', 'GeoJSONSeq',
			'-nlt', 'MULTIPOLYGON',
			'/vsigzip/' + filename2, 'GeoJSONSeq:/vsigzip/' + filename1,
		]
		let cp2 = spawn('ogr2ogr', spawnArgs2);
		cp2.stderr.pipe(process.stderr);

		await new Promise(res => cp2.on('close', res))



		let spawnArgs3 = [
			'-cr',
			'.geometry | if .type != "MultiPolygon" then error("wrong type "+.type) else .coordinates[] | {type:"Feature",geometry:{type:"Polygon",coordinates:.}} | @json end'
		]
		let cp3 = spawn('jq', spawnArgs3);
		cp3.stderr.pipe(process.stderr);

		let stream3 = createReadStream(filename2);
		stream3 = stream3.pipe(createGunzip());
		stream3.pipe(cp3.stdin);
		stream3 = cp3.stdout;
		stream3 = stream3.pipe(createGzip());
		stream3 = stream3.pipe(createWriteStream(filename3));

		await new Promise(res => stream3.on('close', res))
	}

	//rmSync(filename1);
	//rmSync(filename2);

	return
})
