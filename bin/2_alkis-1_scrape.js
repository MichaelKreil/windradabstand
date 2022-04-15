#!/usr/bin/node
'use strict'

// Based on and many thanks to: https://github.com/bundesAPI/deutschland/blob/main/src/deutschland/geo.py

const fs = require('fs');
const VectorTile = require('@mapbox/vector-tile').VectorTile;
const Protobuf = require('pbf');
const { fetchCached, Progress } = require('../lib/helper.js');
const config = require('../config.js');
const gunzip = require('util').promisify(require('zlib').gunzip);


const LEVEL = 15
const URL = 'https://adv-smart.de/tiles/smarttiles_de_public_v1/'
const BBOX = [5.8, 47.2, 15.1, 55.1]



start()

async function start() {

	let bboxMin = deg2tile(BBOX[0], BBOX[3], LEVEL).map(Math.floor)
	let bboxMax = deg2tile(BBOX[2], BBOX[1], LEVEL).map(Math.ceil)

	const headers = {
		'Referer': 'https://adv-smart.de/map-editor/map',
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
	}

	const layerFiles = new LayerFiles()

	let coordinates = [];
	for (let x = bboxMin[0]; x <= bboxMax[0]; x++) {
		fs.mkdirSync(config.getFilename.alkisCache(''+x), { recursive:true });
		for (let y = bboxMin[1]; y <= bboxMax[1]; y++) coordinates.push([x,y]);
	}
	coordinates.sort(bitReversal);
	
	let showProgress = Progress(coordinates.length);
	await coordinates.forEachParallel(4, async ([x,y], i) => {
	//for (let [i,[x,y]] of coordinates.entries()) {
		if (i % 100 === 0) showProgress(i);

		let url = `${URL}${LEVEL}/${x}/${y}.pbf`
		let filename = config.getFilename.alkisCache(`${x}/${y}.pbf`)
		
		let buffer = await fetchCached(filename, url, headers);	
		
		if (buffer.length === 0) return;

		try {
			buffer = await gunzip(buffer);
		} catch (e) {
			console.log('Error in Buffer. Delete file and try again:', filename);
			throw e;
		}

		let tile = new VectorTile(new Protobuf(buffer));

		for (let [layerName, layer] of Object.entries(tile.layers)) {
			let layerFile = layerFiles.get(layerName)
			for (let i = 0; i < layer.length; i++) {
				let feature = layer.feature(i);
				layerFile.write(JSON.stringify(feature.toGeoJSON(x,y,LEVEL)));
			}
		}
	})

	layerFiles.close();



	function LayerFiles() {
		let map = new Map();
		return { get, close }
		function get(name) {
			if (map.has(name)) return map.get(name);
			let filename = config.getFilename.alkisGeo(name.toLowerCase().replace(/\s/g,'_')+'.geojsonseq');
			let file = fs.openSync(filename, 'w')
			let obj = {
				write: line => fs.writeSync(file, line+'\n'),
				close: () => fs.closeSync(file),
			}
			map.set(name, obj);
			return obj;
		}
		function close() {
			for (let file of map.values()) file.close();
		}
	}
	
	function deg2tile(lon_deg, lat_deg, zoom) {
		let n = 2 ** zoom
		return [
			(lon_deg + 180) / 360 * n,
			(1 - Math.asinh(Math.tan(lat_deg*Math.PI/180)) / Math.PI) / 2 * n
		]
	}
	
	function tile2deg(xtile, ytile, zoom) {
		let n = 2 ** zoom;
		return [
			xtile / n * 360 - 180,
			180/Math.PI*Math.atan(Math.sinh(Math.PI * (1 - 2 * ytile / n)))
		]
	}

	function bitReversal(c1,c2) {
		let d;
		for (let i = 1; i < 2 ** 20; i *= 2) {
			d = (c1[0] & i) - (c2[0] & i);
			if (d) return d;
			d = (c1[1] & i) - (c2[1] & i);
			if (d) return d;
		}
		return 0;
	}
}
