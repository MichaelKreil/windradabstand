#!/usr/bin/env node
'use strict'


const fs = require('fs');
const config = require('../config.js');
const { simpleCluster } = require('big-data-tools');
const { bbox2Tiles, getTileBbox, ogrGenerateSQL, mergeFiles } = require('../lib/geohelper.js');
const { Progress } = require('../lib/helper.js');
const turf = require('@turf/turf');
const child_process = require('child_process');
const { resolve } = require('path');

const FILENAME_DYNAMIC = config.getFilename.rulesGeoBasis('wohngebaeude.gpkg');
const FILENAME_FIXED   = config.getFilename.sdf('fixed.gpkg');
const COMBINED_RENDER_LEVELS = 3;
const TILE_SIZE = config.tileSize;

simpleCluster(async function (runWorker) {
	await wrapSpawn('cargo', [
		'build',
		'--release',
		'--bins',
		'--manifest-path', resolve(__dirname, '../rust/Cargo.toml')
	]);

	await prepareGeometry();

	const zoomLevel = config.maxMapZoomLevel - COMBINED_RENDER_LEVELS;
	const BBOX = config.bbox;

	await processLevel('render', zoomLevel);
	for (let z = zoomLevel - 1; z >= 0; z--) await processLevel('merge', z);

	let pngFolder = resolve(config.folders.sdf, 'png');
	let tilesTar = resolve(config.folders.tiles, 'tiles.tar');
	
	console.log('1/2 optipng')
	await wrapExec(`cd "${pngFolder}"; find . -mindepth 2 -maxdepth 2 -type d | shuf | parallel --progress --bar "optipng -quiet {}/*.png"`);
	
	console.log('2/2 tar')
	await wrapExec(`rm "${tilesTar}"; cd "${pngFolder}"; tar -cf "${tilesTar}" *`);

	console.log('Finished');

	async function processLevel(action, z) {
		console.log(`process level ${z} using: ${action}`);
		let todos = [];
		let tilesBbox = bbox2Tiles(BBOX, z);
		let center = [(tilesBbox[0] + tilesBbox[2]) / 2, (tilesBbox[1] + tilesBbox[3]) / 2];
		for (let y = tilesBbox[1]; y < tilesBbox[3]; y++) {
			for (let x = tilesBbox[0]; x < tilesBbox[2]; x++) {
				let filename = getTileFilename(x, y, z);
				if (fs.existsSync(filename)) continue;
				let order = Math.pow(x - center[0], 2) + Math.pow(y - center[1], 2);
				todos.push({ action, x, y, z, filename, order })
			}
		}

		todos.sort((a,b) => a.order - b.order);

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

		const filenameGeoJSONDyn = config.getFilename.sdfGeoJSON(`${todo.z}-${todo.y}-${todo.x}-dyn.geojson`);
		const filenameGeoJSONFix = config.getFilename.sdfGeoJSON(`${todo.z}-${todo.y}-${todo.x}-fix.geojson`);

		if (fs.existsSync(filenameGeoJSONDyn)) fs.rmSync(filenameGeoJSONDyn);
		if (fs.existsSync(filenameGeoJSONFix)) fs.rmSync(filenameGeoJSONFix);

		await wrapSpawn('ogr2ogr', [
			'-skipfailures',
			'-sql', ogrGenerateSQL({ dropProperties:true, bbox: bboxOuter }),
			'-clipdst', ...bboxOuter,
			'-explodecollections',
			'-nln', 'layer',
			'-nlt', 'MultiPolygon',
			filenameGeoJSONDyn,
			FILENAME_DYNAMIC
		])
		
		await wrapSpawn('ogr2ogr', [
			'-sql', ogrGenerateSQL({ dropProperties:true, bbox: bboxInner }),
			'-clipdst', ...bboxInner,
			'-explodecollections',
			'-nln', 'layer',
			'-nlt', 'MultiPolygon',
			filenameGeoJSONFix,
			FILENAME_FIXED
		])
		
		await wrapSpawn(resolve(__dirname, '../rust/target/release/calc_sdf'), [
			JSON.stringify({
				filename_geo_dyn: filenameGeoJSONDyn,
				filename_geo_fix: filenameGeoJSONFix,
				folder_png: resolve(config.folders.sdf, 'png'),
				folder_bin: resolve(config.folders.sdf, 'sdf'),
				min_distance: config.minRadius,
				max_distance: config.maxRadius,
				zoom: todo.z,
				x0: todo.x,
				y0: todo.y,
				n: 2 ** COMBINED_RENDER_LEVELS,
				size: TILE_SIZE,
			})
		])
		
		fs.rmSync(filenameGeoJSONDyn);
		fs.rmSync(filenameGeoJSONFix);
	}

	function mergeTile(todo) {
		return wrapSpawn(resolve(__dirname, '../rust/target/release/merge'), [
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

async function wrapSpawn(cmd, args) {
	return new Promise((resolve, reject) => {
		let cp = child_process.spawn(cmd, args);
		cp.stdout.pipe(process.stdout);
		cp.stderr.pipe(process.stderr);
		cp.on('error', error => {
			console.error(cmd);
			console.error(args);
			console.error({error});
			reject();
		})
		cp.on('exit', (code, signal) => {
			if (code === 0) return resolve();
			console.error(cmd);
			console.error(args);
			console.error({code, signal});
			reject();
		})
	})
}

async function wrapExec(cmd) {
	try {
		child_process.execSync(cmd, { stdio: 'inherit' });
	} catch (e) {
		console.log(e);
		if (e.stdout) console.log('stdout', e.stdout.toString());
		if (e.stderr) console.log('stderr', e.stderr.toString());
		throw e;
	}
}

async function prepareGeometry() {
	if (fs.existsSync(FILENAME_FIXED)) return;

	const { ruleTypes } = JSON.parse(fs.readFileSync(config.getFilename.bufferedGeometry('index.json')));

	let filenamesFixed = [];

	ruleTypes.forEach(ruleType => {
		if (ruleType.slug === 'wohngebaeude') return;
		ruleType.regions.forEach(region => {
			let filename = region.filenameBase + '.gpkg';
			if (!fs.existsSync(filename)) return;
			filenamesFixed.push(filename)
		})
	})

	console.log('merge files to generate fixed geometries');
	
	await mergeFiles(filenamesFixed, FILENAME_FIXED);
}
