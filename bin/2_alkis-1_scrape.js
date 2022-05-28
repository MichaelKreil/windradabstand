#!/usr/bin/env node
'use strict'

// Based on the idea of: https://github.com/bundesAPI/deutschland/blob/main/src/deutschland/geo.py

const { fetchCached, Progress } = require('../lib/helper.js');
const config = require('../config.js');
const gunzip = require('util').promisify(require('zlib').gunzip);


const MAXLEVEL = 15
const URL = 'https://adv-smart.de/tiles/smarttiles_de_public_v1/'
const BBOX = [5.8, 47.2, 15.1, 55.1]
const headers = {
	'Referer': 'https://adv-smart.de/map-editor/map',
	'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
}

const todos = [];
for (let z = 0; z <= MAXLEVEL; z++) {
	const tileMin = deg2tile(BBOX[0], BBOX[3], z).map(Math.floor);
	const tileMax = deg2tile(BBOX[2], BBOX[1], z).map(Math.floor);
	for (let x = tileMin[0]; x <= tileMax[0]; x++) {
		for (let y = tileMin[1]; y <= tileMax[1]; y++) {
			todos.push({x,y,z});
		}
	}
}
const showProgress = Progress(todos.length);

todos.forEachParallel(4, async ({x,y,z}, i) => {
	if (i % 100 === 0) showProgress(i);
	
	const url = `${URL}${z}/${x}/${y}.pbf`
	const filename = config.getFilename.alkisCache(`${z}/${x}/${y}.pbf`)

	const buffer = await fetchCached(filename, url, headers);
	
	if (buffer.length === 0) return;

	try {
		await gunzip(buffer);
	} catch (e) {
		throw Error('Error in Buffer. Delete file and try again:', filename);
	}
})

function deg2tile(lon_deg, lat_deg, zoom) {
	let n = 2 ** zoom
	return [
		(lon_deg + 180) / 360 * n,
		(1 - Math.asinh(Math.tan(lat_deg * Math.PI / 180)) / Math.PI) / 2 * n
	]
}
