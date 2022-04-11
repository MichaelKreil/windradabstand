'use strict'

// Based on and many thanks to: https://github.com/bundesAPI/deutschland/blob/main/src/deutschland/geo.py

const fs = require('fs');
const { resolve } = require('path');
const VectorTile = require('@mapbox/vector-tile').VectorTile;
const Protobuf = require('pbf');
const zlib = require('zlib');
const { fetchCached } = require('../lib/helper.js');
const config = require('../config.js');


const LEVEL = 15
const URL = 'https://adv-smart.de/tiles/smarttiles_de_public_v1/'
const MVT_EXTENT = 4096
//const BBOX = [5.9, 47.3, 15.1, 55.0]
const BBOX = [13.0, 52.3, 13.8, 52.7]



start()

async function start() {

	let bboxMin = deg2tile(BBOX[0], BBOX[3], LEVEL).map(Math.floor)
	let bboxMax = deg2tile(BBOX[2], BBOX[1], LEVEL).map(Math.ceil)

	const headers = {
		'Referer': 'https://adv-smart.de/map-editor/map',
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
	}

	const layerFiles = (function () {
		let map = new Map();
		return { get, close }
		function get(name) {
			if (map.has(name)) return map.get(name);
			let filename = resolve(config.folders.geo, name.toLowerCase().replace(/\s/g,'_')+'.geojsonseq');
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
	})();

	for (let x = bboxMin[0]; x <= bboxMax[0]; x++) {
		process.stdout.write('\r'+(100*(x-bboxMin[0])/(bboxMax[0]-bboxMin[0])).toFixed(1)+'%');
		for (let y = bboxMin[1]; y <= bboxMax[1]; y++) {
			let url = `${URL}${LEVEL}/${x}/${y}.pbf`
			let filename = resolve(config.folders.cache, `${LEVEL}-${x}-${y}.pbf`)
			let buffer = await fetchCached(filename, url, headers);
			buffer = zlib.gunzipSync(buffer);
			let tile = new VectorTile(new Protobuf(buffer));

			for (let [layerName, layer] of Object.entries(tile.layers)) {
				let layerFile = layerFiles.get(layerName)
				for (let i = 0; i < layer.length; i++) {
					let feature = layer.feature(i);
					layerFile.write(JSON.stringify(feature.toGeoJSON(x,y,LEVEL)));
				}
			}
		}
	}

	layerFiles.close();
	
	function deg2tile(lon_deg, lat_deg, zoom) {
		let lat_rad = lat_deg*Math.PI/180;
		let n = 2 ** zoom
		return [
			(lon_deg + 180) / 360 * n,
			(1 - Math.asinh(Math.tan(lat_rad)) / Math.PI) / 2 * n
		]
	}
}
