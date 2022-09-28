#!/usr/bin/env node
'use strict'


const fs = require('fs');
const config = require('../config.js');
const { simpleCluster } = require('big-data-tools');
const { bbox2Tiles, getTileBbox, mercator, ogrGenerateSQL, bbox4326To3857, bboxGeo2WebPixel, bboxWebPixel2Geo } = require('../lib/geohelper.js');
const { ensureFolder, Progress } = require('../lib/helper.js');
const turf = require('@turf/turf');

const FILENAME_LAYER1 = config.getFilename.bufferedGeometry('wohngebaeude.gpkg');
const FILENAME_LAYER2 = config.getFilename.bufferedGeometry('gebaeude.gpkg');
const COMBINED_RENDER_LEVELS = 4;
const TILE_SIZE = 256;
const ANTI_ALIASING = 4;
const SCALE = (2 ** config.maxMapZoomLevel)*TILE_SIZE;

simpleCluster(true, async function (runWorker) {
	const zoomLevel = config.maxMapZoomLevel - (COMBINED_RENDER_LEVELS - 1);
	const BBOX = config.bbox;

	await processLevel('render', zoomLevel);
	for (let z = zoomLevel - 1; z >= 0; z--) await processLevel('merge', z);

	console.log('Finished');

	async function processLevel(action, z) {
		console.log(`process level ${z} using ${action}`);
		let todos = [];
		let tilesBbox = bbox2Tiles(BBOX, z);
		for (let x = tilesBbox[0]; x < tilesBbox[2]; x++) {
			for (let y = tilesBbox[1]; y < tilesBbox[3]; y++) {
				let filename = getTileFilename(x, y, z);
				if (fs.existsSync(filename)) continue;
				todos.push({ action, x, y, z, filename })
			}
		}

		//todos.sort(() => Math.random() - 0.5);
		todos = todos.slice(1000);

		let progress = new Progress(todos.length);

		await todos.forEachParallel(1, (todo, i) => {
			progress(i);
			return runWorker(todo)
		});

		console.log('');
	}

}, async function (todo) {

	switch (todo.action) {
		case 'render': return await renderTile(todo);
		case 'merge': return await mergeTile(todo);
		default:
			console.log({ todo });
			throw Error();
	}

	async function renderTile(todo) {	
		const { x, y, z } = todo;
		const bboxInnerOrg = getTileBbox(x, y, z);
		const bboxOuterOrg = turf.bbox(turf.buffer(turf.bboxPolygon(bboxInnerOrg), config.maxRadius/1000));
		
		const bboxInnerWeb = bboxGeo2WebPixel(bboxInnerOrg, SCALE);
		const bboxOuterWeb = bboxGeo2WebPixel(bboxOuterOrg, SCALE);

		const imageWidth0  = (bboxOuterWeb[2] - bboxOuterWeb[0])*ANTI_ALIASING;
		const imageHeight0 = (bboxOuterWeb[3] - bboxOuterWeb[1])*ANTI_ALIASING;
		const imageOffsetX = (bboxInnerWeb[0] - bboxOuterWeb[0])*ANTI_ALIASING;
		const imageOffsetY = (bboxInnerWeb[1] - bboxOuterWeb[1])*ANTI_ALIASING;
		const imageWidth1  = (bboxInnerWeb[2] - bboxInnerWeb[0])*ANTI_ALIASING;
		const imageHeight1 = (bboxInnerWeb[3] - bboxInnerWeb[1])*ANTI_ALIASING;

		const bboxInnerGeo = bboxWebPixel2Geo(bboxInnerWeb, SCALE);
		const bboxOuterGeo = bboxWebPixel2Geo(bboxOuterWeb, SCALE);

		const bboxInnerMer = bbox4326To3857(bboxInnerGeo);
		const bboxOuterMer = bbox4326To3857(bboxOuterGeo);

		const sql = ogrGenerateSQL({
			dropProperties:true,
			bbox:bboxOuterGeo
		})

		const command1 = [
			'ogr2ogr',
			`-sql '${sql}'`,
			'-nln layer',
			'tile.geojson',
			'wohngebaeude.gpkg'
		].join(' ')

		const command2 = [
			'gdal_rasterize',
			'-init 255 -burn 0',
			'-l layer',
			'-te', ...bboxOuterMer,
			'-ts', imageWidth0, imageHeight0,
			'-of GTiff -ot Byte -co COMPRESS=DEFLATE',
			'tile.gpkg',
			'tile.tiff'
		].join(' ')

		console.log({
			bboxInnerGeo,
			bboxOuterGeo,
			bboxInnerMer,
			bboxOuterMer,
			bboxInnerWeb,
			bboxOuterWeb,
			imageWidth0,
			imageHeight0,
			imageOffsetX,
			imageOffsetY,
			imageWidth1,
			imageHeight1,
			command1,
			command2,
		});

		throw Error();
		const ZOOM_LEVEL_SCALE = 2 ** z;
		const BIG_SIZE = TILE_SIZE * (2 ** (COMBINED_RENDER_LEVELS - 1));

		const dataset = gdal.open(DATABASE_FILENAME);
		const layer = dataset.layers.get(0);
		layer.setSpatialFilter(...bbox);

		const layers = [[], [], []];
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
		ctxBig.clearRect(0, 0, BIG_SIZE, BIG_SIZE);

		for (let layer = 2; layer >= 0; layer--) {
			let features = layers[layer];

			let typicalWindTurbine = config.typicalWindTurbines.find(w => w.level === layer);
			if (!typicalWindTurbine) continue
			ctxBig.fillStyle = typicalWindTurbine.color;

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
					if (depth > 0) return data.forEach(e => drawRec(depth - 1, e));

					data.forEach((point, i) => {
						let xp = (mercator.x(point[0]) * ZOOM_LEVEL_SCALE - x) * BIG_SIZE;
						let yp = (mercator.y(point[1]) * ZOOM_LEVEL_SCALE - y) * BIG_SIZE;
						if (i === 0) {
							ctxBig.moveTo(xp, yp);
						} else {
							ctxBig.lineTo(xp, yp);
						}
					})
				}
			})
		}
		//fs.writeFileSync(config.getFilename.tiles(`debug-${x}-${y}.png`), canvasBig.toBuffer());

		const canvasTile = Canvas.createCanvas(TILE_SIZE, TILE_SIZE);
		const ctxTile = canvasTile.getContext('2d');
		for (let level = COMBINED_RENDER_LEVELS - 1; level >= 0; level--) {
			let count = 2 ** level;
			let srcSize = (2 ** (COMBINED_RENDER_LEVELS - level - 1)) * TILE_SIZE;
			for (let dx = 0; dx < count; dx++) {
				for (let dy = 0; dy < count; dy++) {
					let filename = getTileFilename(x * count + dx, y * count + dy, z + level);
					ensureFolder(dirname(filename));
					ctxTile.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
					ctxTile.drawImage(
						canvasBig,
						dx * srcSize, dy * srcSize, srcSize, srcSize,
						0, 0, TILE_SIZE, TILE_SIZE
					)
					fs.writeFileSync(filename, canvasTile.toBuffer());
				}
			}
		}
	}

	async function mergeTile(todo) {
		throw Error();
		const { x, y, z } = todo;
		const HALF_SIZE = TILE_SIZE / 2;

		const canvas = Canvas.createCanvas(TILE_SIZE, TILE_SIZE);
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);

		for (let dx = 0; dx < 2; dx++) {
			for (let dy = 0; dy < 2; dy++) {
				let filename = getTileFilename(x * 2 + dx, y * 2 + dy, z + 1);
				if (!fs.existsSync(filename)) continue;
				let img = await Canvas.loadImage(filename);
				ctx.drawImage(
					img,
					0, 0, TILE_SIZE, TILE_SIZE,
					HALF_SIZE * dx, HALF_SIZE * dy, HALF_SIZE, HALF_SIZE,
				)
			}
		}

		let filename = getTileFilename(x, y, z);
		ensureFolder(dirname(filename));
		fs.writeFileSync(filename, canvas.toBuffer());
	}
})

function getTileFilename(x, y, z) {
	return config.getFilename.tiles(['buffered', z, y, x].join('/') + '.png');
}
