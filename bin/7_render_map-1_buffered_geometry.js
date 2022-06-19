#!/usr/bin/env node
'use strict'


const fs = require('fs');
const config = require('../config.js');
const { simpleCluster } = require('big-data-tools');
const { bbox2Tiles, getTileBbox, mercator } = require('../lib/geohelper.js');

const DATABASE_FILENAME = config.getFilename.bufferedGeometry('all.gpkg');
const COMBINED_RENDER_LEVELS = 4;
const TILE_SIZE = 512;

simpleCluster(true, async function (runWorker) {
	const zoomLevel = config.maxMapZoomLevel-(COMBINED_RENDER_LEVELS-1);
	//const BBOX = config.bbox;
	const BBOX = [13.1, 52.3, 13.8, 52.7];

	await processLevel('render', zoomLevel);
	for (let z = zoomLevel-1; z >= 0; z--) await processLevel('merge', z);

	console.log('Finished');

	async function processLevel(action, z) {
		console.log(`process level ${z} using ${action}`);
		let todos = [];
		let tilesBbox = bbox2Tiles(BBOX, z);
		for (let x = tilesBbox[0]; x < tilesBbox[2]; x++) {
			for (let y = tilesBbox[1]; y < tilesBbox[3]; y++) {
				let filename = getTileFilename(x,y,z);
				if (fs.existsSync(filename)) continue;
				todos.push({action, x, y, z, filename})
			}
		}

		await todos.forEachParallel((todo,i) => {
			process.stderr.write('\r'+(100*(i+1)/todos.length).toFixed(1)+'%');
			return runWorker(todo)
		});
	}

}, async function (todo) {
	const Canvas = require('canvas');
	const gdal = require('gdal-next');
	const { ensureFolder } = require('../lib/helper.js');
	const { dirname } = require('path');

	switch (todo.action) {
		case 'render': return renderTile(todo);
		case 'merge': return mergeTile(todo);
		default:
			console.log({todo});
			throw Error();
	}

	function renderTile(todo) {
		const { x,y,z } = todo;
		const bbox = getTileBbox(x,y,z);
		const ZOOM_LEVEL_SCALE = 2 ** z;
		const BIG_SIZE = TILE_SIZE * (2 ** (COMBINED_RENDER_LEVELS-1));

		const dataset = gdal.open(DATABASE_FILENAME);
		const layer = dataset.layers.get(0);
		layer.setSpatialFilter(...bbox);

		const layers = [[],[],[]];
		layer.features.forEach(f => {
			f = {
				properties: f.fields.toObject(),
				geometry: f.getGeometry().toObject(),
			}
			let level = f.properties.level || 0;
			layers[level].push(f);
		})

		const canvasBig = Canvas.createCanvas(BIG_SIZE, BIG_SIZE);
		const ctxBig = canvasBig.getContext('2d');
		ctxBig.clearRect(0,0,BIG_SIZE,BIG_SIZE);

		for (let layer = 2; layer >= 0; layer--) {
			let features = layers[layer];
			ctxBig.fillStyle = config.typicalWindTurbines.find(w => w.level === layer).color;

			features.forEach(feature => {

				ctxBig.beginPath();
				switch (feature.geometry.type) {
					case 'MultiPolygon': drawRec(2, feature.geometry.coordinates); break;
					case 'Polygon': drawRec(1, feature.geometry.coordinates); break;
					default:
						throw Error(feature.geometry.type);
				}
				ctxBig.fill();

				function drawRec(depth, data) {
					if (depth > 0) return data.forEach(e => drawRec(depth-1, e));

					data.forEach((point,i) => {
						let xp = (mercator.x(point[0])*ZOOM_LEVEL_SCALE - x)*BIG_SIZE;
						let yp = (mercator.y(point[1])*ZOOM_LEVEL_SCALE - y)*BIG_SIZE;
						if (i === 0) {
							ctxBig.moveTo(xp,yp);
						} else {
							ctxBig.lineTo(xp,yp);
						}
					})
				}
			})
		}
		//fs.writeFileSync(config.getFilename.tiles(`debug-${x}-${y}.png`), canvasBig.toBuffer());

		const canvasTile = Canvas.createCanvas(TILE_SIZE, TILE_SIZE);
		const ctxTile = canvasTile.getContext('2d');
		for (let level = 0; level < COMBINED_RENDER_LEVELS; level++) {
			let count = 2 ** level;
			let srcSize = (2 ** (COMBINED_RENDER_LEVELS-level-1))*TILE_SIZE;
			for (let dx = 0; dx < count; dx++) {
				for (let dy = 0; dy < count; dy++) {
					let filename = getTileFilename(x*count+dx, y*count+dy, z+level);
					ensureFolder(dirname(filename));
					ctxTile.clearRect(0,0,TILE_SIZE,TILE_SIZE);
					ctxTile.drawImage(
						canvasBig,
						dx*srcSize, dy*srcSize, srcSize, srcSize,
						0,0,TILE_SIZE,TILE_SIZE
					)
					fs.writeFileSync(filename, canvasTile.toBuffer());
				}
			}
		}
	}
})

function getTileFilename(x,y,z) {
	return config.getFilename.tiles(['buffered',z,y,x].join('/')+'.png');
}
