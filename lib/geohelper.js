'use strict'

const fs = require('fs');
const child_process = require('child_process');
const turf = require('@turf/turf');
const Havel = require('havel');
const polygonClipping = require('polygon-clipping');
const config = require('../config.js');
const { Progress } = require('./helper.js');
const { basename, extname } = require('path');
const gdal = require('gdal-next');
const zlib = require('zlib');



const tiny = 1e-6; // tiny distance in degrees, e.g. 1e-6 = 10cm



const BUNDESLAENDER = [
	{ ags: 1, name: 'Schleswig-Holstein' },
	{ ags: 2, name: 'Hamburg' },
	{ ags: 3, name: 'Niedersachsen' },
	{ ags: 4, name: 'Bremen' },
	{ ags: 5, name: 'Nordrhein-Westfalen' },
	{ ags: 6, name: 'Hessen' },
	{ ags: 7, name: 'Rheinland-Pfalz' },
	{ ags: 8, name: 'Baden-Württemberg' },
	{ ags: 9, name: 'Bayern' },
	{ ags: 10, name: 'Saarland' },
	{ ags: 11, name: 'Berlin' },
	{ ags: 12, name: 'Brandenburg' },
	{ ags: 13, name: 'Mecklenburg-Vorpommern' },
	{ ags: 14, name: 'Sachsen' },
	{ ags: 15, name: 'Sachsen-Anhalt' },
	{ ags: 16, name: 'Thüringen' },
]




const mercator = {
	x: v => (v + 180) / 360,
	y: v => 0.5 * (1 - Math.log(Math.tan(Math.PI * (1 + v / 90) / 4)) / Math.PI),
}

const demercator = {
	x: v => v * 360 - 180,
	y: v => (Math.atan(Math.exp((1 - v * 2) * Math.PI)) * 4 / Math.PI - 1) * 90,
}


module.exports = {
	bbox2Tiles,
	BundeslandFinder,
	convertGeoJSON2Anything,
	coords2Feature,
	demercator,
	doBboxOverlap,
	features2Coords,
	GeoPecker,
	getBundeslaender,
	getTileBbox,
	intersect,
	mercator,
	processAlkis,
	union,
}



function spawnOut(cmd, args) {
	const process = child_process.spawn(cmd, args, { highWaterMark: 1024 * 1024 });
	return { readable: process.stdout }
}
Havel.registerNodeFactoryStream('spawnOut', spawnOut);

function getBundeslaender() {
	// Bundesländer mit BBoxes
	const lookupAGS = new Map(BUNDESLAENDER.map(b => [b.ags, Object.assign({ features: [] }, b)]))
	const featureCollection = JSON.parse(fs.readFileSync(config.getFilename.static('bundeslaender.geojson')));
	featureCollection.features.forEach(feature => {
		// Nur Landflächen
		if (feature.properties.GF !== 4) return;

		const b = lookupAGS.get(parseInt(feature.properties.AGS, 10));
		if (!b) throw Error();
		b.features.push(feature);
	})
	let bundeslaender = Array.from(lookupAGS.values());
	bundeslaender = bundeslaender.map(b => {
		let feature = union(...(b.features));
		feature.properties.ags = b.ags;
		feature.properties.name = b.name;
		feature.bbox = turf.bbox(feature);
		return feature;
	})
	return bundeslaender;
}

function BundeslandFinder() {
	let filenameCache = config.getFilename.helper('bundeslandFinder.json');
	let geoFinder = GeoFinder();

	if (!fs.existsSync(filenameCache)) {
		geoFinder.create(turf.featureCollection(getBundeslaender()), filenameCache)
	}

	geoFinder.load(filenameCache);

	return (lng, lat) => {
		let result = geoFinder.lookupCoordinates(lng, lat);

		if (result.length === 1) return result[0];
		if (result.length === 0) return false;

		console.log();
		console.log(lng, lat);
		console.log(result);
		result.forEach(p => console.log(JSON.stringify(p)));
		throw Error('polygons overlapping?');
	}
}

function GeoFinder() {
	let gridScale = 100; // 100 = 1km
	let grid;

	return {
		create,
		load,
		lookupCoordinates,
		lookupBbox,
	}

	function create(geoJSON, filename) {
		let grid = new Map();
		let [xc, yc] = turf.center(geoJSON).geometry.coordinates;
		let gridCellSize = turf.area(turf.bboxPolygon([xc, yc, xc + 1, yc + 1].map(v => v / gridScale)));
		let progress = Progress(turf.area(geoJSON) / gridCellSize);
		let areaSum = 0;

		geoJSON.features.forEach((f, i) => f.properties._index = i);

		turf.flatten(geoJSON).features.forEach(polygon => {
			let bbox = turf.bbox(polygon);

			let x0 = Math.floor(bbox[0] * gridScale);
			let y0 = Math.floor(bbox[1] * gridScale);
			let x1 = Math.floor(bbox[2] * gridScale);
			let y1 = Math.floor(bbox[3] * gridScale);

			splitRecursive(polygon, x0, y0, x1, y1);

			function splitRecursive(part, x0, y0, x1, y1) {
				if (!part) return;

				if ((x0 === x1) && (y0 === y1)) {
					// single grid cell

					// update progress
					areaSum += turf.area(part);
					progress(areaSum / gridCellSize);

					// check if complete
					let box = turf.bboxPolygon([
						(x0) / gridScale,
						(y0) / gridScale,
						(x1 + 1) / gridScale,
						(y1 + 1) / gridScale,
					])

					if (turf.difference(box, part)) {
						// cleanup geometry
						turf.truncate(part, { precision: 5, mutate: true })
					} else {
						// part covers whole cell
						part.full = true;
					}

					// cleanup data
					part.index = polygon.properties._index;
					delete part.properties;

					let key = x0 + '_' + y0;
					if (!grid.has(key)) grid.set(key, []);
					grid.get(key).push(part);

					return
				}

				if (y1 - y0 > x1 - x0) {
					// split horizontal
					let yc = Math.floor((y0 + y1) / 2);
					split(x0, y0, x1, yc);
					split(x0, yc + 1, x1, y1);
				} else {
					// split vertical
					let xc = Math.floor((x0 + x1) / 2);
					split(x0, y0, xc, y1);
					split(xc + 1, y0, x1, y1);
				}

				function split(x0, y0, x1, y1) {
					let box = turf.bboxPolygon([
						(x0) / gridScale - tiny,
						(y0) / gridScale - tiny,
						(x1 + 1) / gridScale + tiny,
						(y1 + 1) / gridScale + tiny,
					])
					splitRecursive(turf.intersect(box, part), x0, y0, x1, y1);
				}
			}
		})

		console.log();

		let data = {
			features: geoJSON.features,
			grid: Array.from(grid.entries()),
		}

		fs.writeFileSync(filename, JSON.stringify(data));
	}

	function load(filename) {
		let data = JSON.parse(fs.readFileSync(filename));
		data.grid.forEach(entries => {
			entries[1].forEach(entry => {
				entry.feature = data.features[entry.index];
			})
		})
		grid = new Map(data.grid);
	}

	function lookupCoordinates(lng, lat) {
		let point = [lng, lat]
		let x = Math.floor(lng * gridScale);
		let y = Math.floor(lat * gridScale);
		let key = x + '_' + y;
		if (!grid.has(key)) return [];
		return grid.get(key).filter(polygon =>
			polygon.full || turf.booleanPointInPolygon(point, polygon)
		).map(polygon => polygon.feature)
	}

	function lookupBbox(bbox) {
		let x0 = Math.floor(bbox[0] * gridScale);
		let y0 = Math.floor(bbox[1] * gridScale);
		let x1 = Math.floor(bbox[2] * gridScale);
		let y1 = Math.floor(bbox[3] * gridScale);

		let features = new Set();
		for (let y = y0; y <= y1; y++) {
			for (let x = x0; x <= x1; x++) {
				grid.get(x + '_' + y)?.forEach(polygon => features.add(polygon.feature))
			}
		}
		return Array.from(features.values());
	}
}

function GeoPecker(filename) {
	const CELLSIZE = 0.01;
	const CELLCOUNT = 30;
	const RADIUS = CELLSIZE * CELLCOUNT / 2;

	let file = gdal.open(filename, 'r');
	let layer = file.layers.get(0);
	let bbox = [0, 0, 0, 0];
	let grid, xc, yc;

	return check

	function check(point) {
		if (
			(point[0] < bbox[0]) ||
			(point[1] < bbox[1]) ||
			(point[0] > bbox[2]) ||
			(point[1] > bbox[3])
		) createCache(point);

		let x = Math.floor((point[0] - xc) / CELLSIZE);
		let y = Math.floor((point[1] - yc) / CELLSIZE);
		let key = x + '_' + y;
		let cell = grid.get(key);
		if (!cell) return false;

		return cell.p.some(poly => turf.booleanPointInPolygon(point, poly));
	}

	function createCache(p) {
		grid = new Map();
		xc = p[0];
		yc = p[1];

		bbox = [xc - RADIUS, yc - RADIUS, xc + RADIUS, yc + RADIUS];
		layer.setSpatialFilter(...bbox);
		layer.features.forEach(f => {
			f = {
				type: 'Feature',
				geometry: f.getGeometry().toObject()
			}
			turf.flatten(f).features.forEach(polygon => {
				let bbox = turf.bbox(polygon);

				let x0 = Math.max(-CELLCOUNT, Math.floor((bbox[0] - xc) / CELLSIZE));
				let y0 = Math.max(-CELLCOUNT, Math.floor((bbox[1] - yc) / CELLSIZE));
				let x1 = Math.min(CELLCOUNT, Math.floor((bbox[2] - xc) / CELLSIZE));
				let y1 = Math.min(CELLCOUNT, Math.floor((bbox[3] - yc) / CELLSIZE));

				for (let x = x0; x <= x1; x++) {
					for (let y = y0; y <= y1; y++) {
						let key = x + '_' + y;
						let cell = grid.get(key);
						if (!cell) grid.set(key, cell = { p: [] });
						cell.p.push(polygon);
					}
				}
			})
		})

		for (let cell of grid.values()) {
			try {
				cell.p = [coords2Feature(polygonClipping.union(features2Coords(cell.p)))];
			} catch (e) {
				// ignore
			}
		}
	}
}

/**
 * Verarbeitet einen ALKIS-Layer
 * @async
 * @param {string} slug - Name des Layers
 * @param {Array<String>} ruleTypes - Array von Regel-Typen, die berücksichtigt werden sollen
 * @param {Function} cbFeature - Callback, der ein Feature übergibt, das z.B. gesäubert werden kann. Falls false zurückgegeben wird, wird das Feature aussortiert.
 * @param {Function} [cbWindEntries] - optionaler Callback, der die Liste der gefundenen windEntries übergibt. Falls false zurückgegeben wird, wird das Feature aussortiert.
 */

function processAlkis(opt) {
	if (!opt) throw Error('need options');
	if (!opt.slug) throw Error('need slug');
	if (!opt.ruleTypes) throw Error('need ruleTypes');

	opt.slugIn ??= opt.slug;
	opt.slugOut ??= opt.slug;
	opt.filenameIn ??= config.getFilename.alkisGeo(opt.slug + '.fgb');

	if (!opt.cbFeature) throw Error('cbFeature is missing');

	if (!fs.existsSync(opt.filenameIn)) {
		console.log(opt);
		throw Error(opt.filenameIn+' is missing');
	}

	opt.ruleTypes.forEach(ruleType => {
		if (!config.ruleTypes.find(t => t.slug === ruleType)) {
			throw Error(`ruleType ${ruleType} is not defined in config.js`)
		}
	})
	let ruleTypes = new Set(opt.ruleTypes);

	return new Promise(resolve => {
		console.log('process ' + opt.slugOut);

		//let windSummary = [];
		const filesOut = new Map();

		let pipeline = Havel.pipeline(), n;

		if (opt.filenameIn.endsWith('.geojsonl')) {
			pipeline = pipeline.readFile(opt.filenameIn, { showProgress: true });
		} else if (opt.filenameIn.endsWith('.geojsonl.gz')) {
			pipeline = pipeline.readFile(opt.filenameIn, { showProgress: true }).decompressGzip();
		} else if (opt.filenameIn.endsWith('.fgb')) {
			n = child_process.spawnSync('ogrinfo', ['-so', '-al', opt.filenameIn]);
			n = n.stdout.toString().match(/Feature Count: (\d+)/)[1];
			n = parseInt(n, 10);
			pipeline = pipeline.spawnOut('ogr2ogr', ['-f', 'GeoJSONSeq', '/vsistdout/', opt.filenameIn])
		} else {
			throw Error('unknown file format');
		}

		let progress = new Progress(n);
		pipeline
			.split()
			.forEach(async (feature, index) => {
				if (feature.length === 0) return;

				if (index % 1e3 === 0) progress(index);
				feature = JSON.parse(feature);

				let types = opt.cbFeature(feature);
				if (!types) return;

				feature.bbox = turf.bbox(feature);

				if (!Array.isArray(types)) types = [types];

				for (let type of types) {
					if (!ruleTypes.has(type)) {
						throw Error(`ruleType ${type} is not defined in processAlkis`)
					}

					feature.properties.type = type;

					if (!filesOut.has(type)) {
						let filename = config.getFilename.mapFeature(type + '.geojsonl.gz');
						let file = new NDJSONGzipWrite(filename);
						file.filenameGeoJSONSeq = filename;
						file.filenameOut = config.getFilename.mapFeature(type);
						file.name = type;
						filesOut.set(type, file);
					}
					await filesOut.get(type).write(feature);
				}
			})
			.drain()
			.finished(async () => {
				console.log();
				for (let file of filesOut.values()) {
					await file.close();

					convertGeoJSON2Anything(file.filenameGeoJSONSeq, file.filenameOut+'.fgb');
					if (opt.generateGPKG) {
						convertGeoJSON2Anything(file.filenameGeoJSONSeq, file.filenameOut + '.gpkg');
					}
				}

				console.log('finished')

				resolve();
			})
	})

	function NDJSONGzipWrite(filename) {
		const streamFile = fs.createWriteStream(filename);
		const streamGzip = zlib.createGzip({ level: 3 });
		streamGzip.pipe(streamFile);

		return { write, close }

		function write(obj) {
			return new Promise(res => {
				let buffer = Buffer.from(JSON.stringify(obj) + '\n');
				if (streamGzip.write(buffer)) return res();
				streamGzip.once('drain', res);
			})
		}

		function close() {
			return new Promise(res => {
				streamFile.once('close', res);
				streamGzip.end();
			})
		}
	}
}


function convertGeoJSON2Anything(fullnameIn, fullnameOut) {
	const filenameOut = basename(fullnameOut);
	const extensionOut = extname(fullnameOut);
	const fullnameTmp = config.getFilename.mapFeature('tmp-' + Math.random().toString(36).slice(2) + extensionOut);
	
	process.stdout.write(`generate ${filenameOut}: `)
	child_process.spawnSync('ogr2ogr', [
		'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
		'--config', 'CPL_LOG', '/dev/null',
		'-progress',
		'-overwrite',
		fullnameTmp,
		'GeoJSONSeq:/vsigzip/' + fullnameIn
	], { stdio: 'inherit' })
	fs.renameSync(fullnameTmp, fullnameOut);
}

function union(...features) {
	return coords2Feature(polygonClipping.union(features2Coords(features)));
}

function intersect(f1, f2) {
	return coords2Feature(polygonClipping.intersection(features2Coords([f1]), features2Coords([f2])));
}

function features2Coords(features) {
	let coords = [];
	for (let feature of features) {
		if (!feature) continue;
		try {
			feature = turf.rewind(feature, { mutate: true })
		} catch (e) {
			console.dir({ feature }, { depth: 10 });
			throw e;
		}
		switch (feature.geometry.type) {
			case 'Polygon': coords.push(feature.geometry.coordinates); continue
			case 'MultiPolygon': coords = coords.concat(feature.geometry.coordinates); continue
		}
		throw Error(feature.geometry.type);
	}
	return coords;
}

function coords2Feature(coords) {
	let outside = [];
	let inside = [];

	coords.forEach(polygon =>
		polygon.forEach(ring =>
			(turf.booleanClockwise(ring) ? inside : outside).push(ring)
		)
	)

	if (outside.length === 1) {
		return turf.polygon(outside.concat(inside));
	} else if (inside.length === 0) {
		return turf.multiPolygon(outside.map(p => [p]));
	} else {
		coords.forEach(polygon => polygon.forEach((ring, index) => {
			if (turf.booleanClockwise(ring) === (index === 0)) ring.reverse();
		}))
		return turf.multiPolygon(coords);
	}
}

function doBboxOverlap(bbox1, bbox2) {
	if (bbox1[0] > bbox2[2]) return false;
	if (bbox1[1] > bbox2[3]) return false;
	if (bbox1[2] < bbox2[0]) return false;
	if (bbox1[3] < bbox2[1]) return false;
	return true;
}

function bbox2Tiles(bbox, z) {
	const scale = 2 ** z;
	return [
		Math.floor(mercator.x(bbox[0]) * scale),
		Math.floor(mercator.y(bbox[3]) * scale),
		Math.ceil(mercator.x(bbox[2]) * scale),
		Math.ceil(mercator.y(bbox[1]) * scale),
	]
}

function getTileBbox(x, y, z, b = 0.01) {
	const scale = 2 ** z;
	return [
		demercator.x((x - b) / scale),
		demercator.y((y + 1 + b) / scale),
		demercator.x((x + 1 + b) / scale),
		demercator.y((y - b) / scale),
	]
}
