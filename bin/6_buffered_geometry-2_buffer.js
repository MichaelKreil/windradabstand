#!/usr/bin/env node
'use strict'


const { simpleCluster } = require('big-data-tools');
const { resolve } = require('path');

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
	const { createWriteStream, rmSync } = require('fs');
	const { spawn } = require('child_process');
	const turf = require('@turf/turf');
	const miss = require('mississippi2');
	const { createGzip } = require('zlib');

	const { bundesland, ruleType, region } = todo;
	const radius = region.radius / 1000;
	const filename1 = region.filenameBase + '.geojsonl.gz';
	const filename2 = region.filenameBase + '.gpkg';

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

	let stream = cp1.stdout;
	if (radius > 0) {
		stream = stream.pipe(miss.split());
		stream = stream.pipe(miss.map(line => {
			if (line.length === 0) return '';
			return JSON.stringify(turf.buffer(JSON.parse(line), radius, { steps: 18 })) + '\n';
		}))
	}

	stream = stream.pipe(createGzip())
	stream = stream.pipe(createWriteStream(filename1))

	await new Promise(res => stream.on('close', res))

	let spawnArgs2 = [
		//'--debug', 'ON',
		'-skipfailures',
		'-dialect', 'SQLite',
		'-sql', `SELECT ST_Union(geometry) AS geometry FROM "${region.ags}.geojsonl"`,
		'-clipdst', bundesland.filename,
		'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
		'-f', 'GPKG',
		'-nlt', 'MULTIPOLYGON',
		'-nln', 'layer',
		filename2, '/vsigzip/' + filename1,
	]
	//console.log(spawnArgs2);
	let cp2 = spawn('ogr2ogr', spawnArgs2);
	cp2.stderr.pipe(process.stderr);
	stream.pipe(cp2.stdin);

	await new Promise(res => cp2.on('close', res))

	rmSync(filename1);

	return
})
