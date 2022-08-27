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

	await todos.forEachParallel(async todo => {
		await runWorker(todo);
	})
	process.exit();

}, async todo => {
	const { createWriteStream } = require('fs');
	const { spawn } = require('child_process');
	const turf = require('@turf/turf');
	const miss = require('mississippi2');
	const { createGzip } = require('zlib');

	const { bundesland, ruleType, region } = todo;
	const radius = region.radius / 1000;
	const fileGeoJSON = region.filenameBase + '.1_buf.geojsonl.gz';

	console.log(ruleType.slug, region.ags);

	let bbox = turf.bboxPolygon(bundesland.bbox);
	bbox = turf.buffer(bbox, radius, { steps: 18 });
	bbox = turf.bbox(bbox);

	let spawnArgs = ['-spat']
		.concat(bbox.map(v => v.toString()))
		.concat(['-f', 'GeoJSONSeq', '/vsistdout/', ruleType.filenameIn]);

	if (radius <= 0) {
		await new Promise(res => {
			miss.pipeline(
				spawn('ogr2ogr', spawnArgs).stdout,
				createGzip(),
				createWriteStream(fileGeoJSON)
			).on('finish', res)
		})
	} else {
		await new Promise(res => {
			miss.pipeline(
				spawn('ogr2ogr', spawnArgs).stdout,
				miss.split(),
				miss.map(line => {
					if (line.length === 0) return;
					return JSON.stringify(turf.buffer(JSON.parse(line), radius, { steps: 18 }));
				}),
				miss.filter(l => l),
				createGzip(),
				createWriteStream(fileGeoJSON)
			).on('finish', res)
		})

	}
})
