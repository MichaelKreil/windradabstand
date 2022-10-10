#!/usr/bin/env node
'use strict'


const fs = require('fs');
const config = require('../config.js');
const { simpleCluster } = require('big-data-tools');
const { bbox2Tiles, getTileBbox, mercator, ogrGenerateSQL, bbox4326To3857, bboxGeo2WebPixel, bboxWebPixel2Geo } = require('../lib/geohelper.js');
const { ensureFolder, Progress } = require('../lib/helper.js');
const turf = require('@turf/turf');
const { spawnSync } = require('child_process');
const { resolve } = require('path');

const FILENAME_LAYER1 = config.getFilename.rulesGeoBasis('wohngebaeude.gpkg');
const FILENAME_LAYER2 = config.getFilename.rulesGeoBasis('gebaeude.gpkg');
const COMBINED_RENDER_LEVELS = 3;
const TILE_SIZE = config.tileSize;

simpleCluster(async function (runWorker) {
	wrapSpawn('cargo', [
		'build',
		'--release',
		'--bins',
		'--manifest-path', resolve(__dirname, '../rust/Cargo.toml')
	]);

	const zoomLevel = config.maxMapZoomLevel - COMBINED_RENDER_LEVELS;
	const BBOX = config.bbox;

	await processLevel('render', zoomLevel);
	for (let z = zoomLevel - 1; z >= 0; z--) await processLevel('merge', z);

	console.log('Finished');

	async function processLevel(action, z) {
		console.log(`process level ${z} using: ${action}`);
		let todos = [];
		let tilesBbox = bbox2Tiles(BBOX, z);
		for (let y = tilesBbox[1]; y < tilesBbox[3]; y++) {
			for (let x = tilesBbox[0]; x < tilesBbox[2]; x++) {
				let filename = getTileFilename(x, y, z);
				if (fs.existsSync(filename)) continue;
				todos.push({ action, x, y, z, filename })
			}
		}

		todos.sort(() => Math.random() - 0.5);

		let progress = new Progress(todos.length);

		await todos.forEachParallel((todo, i) => {
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
			throw Error();
	}

	async function renderTile(todo) {	
		
		const bboxInner = getTileBbox(todo.x, todo.y, todo.z);
		const bboxOuter = turf.bbox(turf.buffer(turf.bboxPolygon(bboxInner), config.maxRadius/1000));

		const sql = ogrGenerateSQL({
			dropProperties:true,
			bbox:bboxOuter
		})

		let filenameGeoJSON = config.getFilename.sdfGeoJSON(`${todo.z}-${todo.y}-${todo.x}.geojson`);

		wrapSpawn('ogr2ogr', [
			'-sql', sql,
			filenameGeoJSON,
			FILENAME_LAYER1
		])

		wrapSpawn(resolve(__dirname, '../rust/target/release/calc_sdf'), [
			JSON.stringify({
				filename_geo: filenameGeoJSON,
				folder_png: resolve(config.folders.sdf, 'png'),
				folder_bin: resolve(config.folders.sdf, 'sdf'),
				zoom: todo.z,
				x0: todo.x,
				y0: todo.y,
				n: 2 ** COMBINED_RENDER_LEVELS,
				size: TILE_SIZE,
			})
		])

		fs.unlinkSync(filenameGeoJSON);
	}

	async function mergeTile(todo) {
		wrapSpawn(resolve(__dirname, '../rust/target/release/merge'), [
			JSON.stringify({
				folder_png: resolve(config.folders.sdf, 'png'),
				folder_bin: resolve(config.folders.sdf, 'sdf'),
				size: TILE_SIZE,
				zoom: todo.z,
				x0: todo.x,
				y0: todo.y
			})
		])
	}
})

function getTileFilename(x, y, z) {
	return config.getFilename.sdf(['png', z, y, x].join('/') + '.png');
}

function wrapSpawn(cmd, args) {
	let result = spawnSync(cmd, args);
	if (result.error) throw Error(result.error);
	if (result.status === 0) return;
	
	console.error(cmd);
	console.error(args);
	console.error(result.stdout.toString());
	console.error(result.stderr.toString());
	throw Error();
}
