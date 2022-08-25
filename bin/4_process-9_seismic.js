#!/usr/bin/env node
'use strict'


const fs = require('fs');
const zlib = require('zlib');
const helper = require('../lib/helper.js');
const config = require('../config.js');
const turf = require('@turf/turf');
const { convertGeoJSON2Anything } = require('../lib/geohelper.js');

start()

async function start(opt) {
	const filenameIn = config.getFilename.static('seismessstationen.tsv');
	const ruleTypes = ['seismess'];
	const filenameGeoJSON = config.getFilename.rulesGeoBasis('seismess.geojsonl.gz');
	const filenameFGB = config.getFilename.rulesGeoBasis('seismess.fgb');

	console.log('process seismess');

	if (!fs.existsSync(filenameIn)) throw Error(filenameIn + ' is missing');
	
	ruleTypes.forEach(ruleType => {
		if (!config.ruleTypes.find(t => t.slug === ruleType)) throw Error(`ruleType ${ruleType} is not defined in config.js`)
	})

	let stations = helper.readTSV(filenameIn, 'utf8');
	let result = [];
	for (let station of stations) {
		station.lat = parseFloat(station.lat);
		station.lng = parseFloat(station.lng);
		station.radius = parseFloat(station.radius);

		let feature = turf.buffer(turf.point([station.lng, station.lat]), station.radius / 1000);
		feature.properties = station;
		feature.properties.type = 'seismess';
		feature.bbox = turf.bbox(feature);

		result.push(JSON.stringify(feature)+'\n');
	}
	result = zlib.gzipSync(Buffer.from(result.join('')));
	fs.writeFileSync(filenameGeoJSON, result);
	
	convertGeoJSON2Anything(filenameGeoJSON, filenameFGB);
}
