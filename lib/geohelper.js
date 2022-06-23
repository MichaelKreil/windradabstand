'use strict'

const fs = require('fs');
const child_process = require('child_process');
const turf = require('@turf/turf');
const Havel = require('havel');
const polygonClipping = require('polygon-clipping');
const config = require('../config.js');
const { Progress } = require('./helper.js');
const { resolve } = require('path');
const gdal = require('gdal-next');



const tiny = 1e-6; // tiny distance in degrees, e.g. 1e-6 = 10cm



const BUNDESLAENDER = [
	{ ags: 1, name:'Schleswig-Holstein' },
	{ ags: 2, name:'Hamburg' },
	{ ags: 3, name:'Niedersachsen' },
	{ ags: 4, name:'Bremen' },
	{ ags: 5, name:'Nordrhein-Westfalen' },
	{ ags: 6, name:'Hessen' },
	{ ags: 7, name:'Rheinland-Pfalz' },
	{ ags: 8, name:'Baden-Württemberg' },
	{ ags: 9, name:'Bayern' },
	{ ags:10, name:'Saarland' },
	{ ags:11, name:'Berlin' },
	{ ags:12, name:'Brandenburg' },
	{ ags:13, name:'Mecklenburg-Vorpommern' },
	{ ags:14, name:'Sachsen' },
	{ ags:15, name:'Sachsen-Anhalt' },
	{ ags:16, name:'Thüringen' },
]




const mercator = {
	x: v => (v+180)/360,
	y: v => 0.5*(1-Math.log(Math.tan(Math.PI*(1+v/90)/4))/Math.PI),
}

const demercator = {
	x: v => v*360-180,
	y: v => (Math.atan(Math.exp((1-v*2)*Math.PI))*4/Math.PI-1)*90,
}


module.exports = {
	bbox2Tiles,
	BundeslandFinder,
	coords2GeoJSON,
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
	const lookupAGS = new Map(BUNDESLAENDER.map(b => [b.ags, Object.assign({features:[]}, b)]))
	const featureCollection = JSON.parse(fs.readFileSync(config.getFilename.static('bundeslaender.geojson')));
	featureCollection.features.forEach(feature => {
		const b = lookupAGS.get(parseInt(feature.properties.AGS, 10));
		if (!b) throw Error();
		b.features.push(feature);
	})
	let bundeslaender = Array.from(lookupAGS.values());
	bundeslaender = bundeslaender.map(b => {
		let feature = union(...(b.features));
		feature.properties.ags  = b.ags;
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
		geoFinder.create(getBundeslaender(), filenameCache)
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

function WindFinder(slug, callbackRadius) {
	let filenameCache = config.getFilename.helper('windFinder_'+slug+'.json');
	let geoFinder = GeoFinder();

	if (!fs.existsSync(filenameCache)) {
		let windData = config.getFilename.wind('wind.json');
		windData = JSON.parse(fs.readFileSync(windData));
		windData = windData.map(w => {
			w.radius = callbackRadius(w.Nabenhoehe, w.Rotordurchmesser/2, w);
			w.maxRadius = Math.max(...Object.values(w.radius));
			if (w.maxRadius < 0) return false;
			w.point = turf.point([w.Laengengrad, w.Breitengrad]);
			return turf.circle([w.Laengengrad, w.Breitengrad], w.maxRadius/1000, { properties:w })
		}).filter(c => c);
		windData = turf.featureCollection(windData);
		geoFinder.create(windData, filenameCache)
	}

	geoFinder.load(filenameCache);

	return feature => {
		let windEntries = geoFinder.lookupBbox(turf.bbox(feature));
		if (windEntries.length === 0) return [];

		let lineStrings, isPolygon;
		switch (feature.geometry.type) {
			case 'Polygon':
			case 'MultiPolygon':
				isPolygon = true;
				lineStrings = turf.flatten(turf.polygonToLine(feature)).features; break;
			case 'LineString':
			case 'MultiLineString':
				lineStrings = turf.flatten(feature).features; break;
			default: throw Error('unknown type '+feature.geometry.type);
		}
		let result = [];
		windEntries.forEach(wind => {
			let { point } = wind.properties;

			if (isPolygon && turf.booleanPointInPolygon(point, feature)) {
				return result.push({wind, distance:0})
			}

			let minDist = 1e10;
			for (let lineString of lineStrings) {
				let dist = 1000*turf.pointToLineDistance(point, lineString);
				if (dist > minDist) continue;
				minDist = dist;
				if (wind.maxRadius < minDist) return;
			}
			return result.push({wind, distance:minDist});
		})
		return result;
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
		let [xc,yc] = turf.center(geoJSON).geometry.coordinates;
		let gridCellSize = turf.area(turf.bboxPolygon([xc,yc,xc+1,yc+1].map(v => v/gridScale)));
		let progress = Progress(turf.area(geoJSON)/gridCellSize);
		let areaSum = 0;

		geoJSON.features.forEach((f,i) => f.properties._index = i);
		
		turf.flatten(geoJSON).features.forEach(polygon => {
			let bbox = turf.bbox(polygon);

			let x0 = Math.floor(bbox[0] * gridScale);
			let y0 = Math.floor(bbox[1] * gridScale);
			let x1 = Math.floor(bbox[2] * gridScale);
			let y1 = Math.floor(bbox[3] * gridScale);

			splitRecursive(polygon, x0,y0,x1,y1);

			function splitRecursive(part, x0,y0,x1,y1) {
				if (!part) return;

				if ((x0 === x1) && (y0 === y1)) {
					// single grid cell
					
					// update progress
					areaSum += turf.area(part);
					progress(areaSum/gridCellSize);

					// check if complete
					let box = turf.bboxPolygon([
						(x0  ) / gridScale,
						(y0  ) / gridScale,
						(x1+1) / gridScale,
						(y1+1) / gridScale,
					])
					
					if (turf.difference(box, part)) {
						// cleanup geometry
						turf.truncate(part, { precision:5, mutate:true })
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

				if (y1-y0 > x1-x0) {
					// split horizontal
					let yc = Math.floor((y0+y1)/2);
					split(x0, y0  , x1, yc);
					split(x0, yc+1, x1, y1);
				} else {
					// split vertical
					let xc = Math.floor((x0+x1)/2);
					split(x0  , y0, xc, y1);
					split(xc+1, y0, x1, y1);
				}

				function split(x0,y0,x1,y1) {
					let box = turf.bboxPolygon([
						(x0  ) / gridScale - tiny,
						(y0  ) / gridScale - tiny,
						(x1+1) / gridScale + tiny,
						(y1+1) / gridScale + tiny,
					])
					splitRecursive(turf.intersect(box, part), x0,y0,x1,y1);
				}
			}
		})

		console.log();

		let data = {
			features: geoJSON.features,
			grid:Array.from(grid.entries()),
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
				grid.get(x+'_'+y)?.forEach(polygon => features.add(polygon.feature))
			}
		}
		return Array.from(features.values());
	}
}

function GeoPecker(filename) {
	const CELLSIZE = 0.01;
	const CELLCOUNT = 30;
	const RADIUS = CELLSIZE*CELLCOUNT/2;

	let file = gdal.open(filename, 'r');
	let layer = file.layers.get(0);
	let bbox = [0,0,0,0];
	let grid, xc, yc;

	return check

	function check(p) {
		if ((p[0] < bbox[0]) || (p[1] < bbox[1]) || (p[0] > bbox[2]) || (p[1] > bbox[3])) createCache(p);
		
		let x = Math.floor((p[0]-xc) / CELLSIZE);
		let y = Math.floor((p[1]-yc) / CELLSIZE);
		let key = x + '_' + y;
		let cell = grid.get(key);
		if (!cell) return false;
		return turf.booleanPointInPolygon(p, cell.p);
	}

	function createCache(p) {
		grid = new Map();
		xc = p[0];
		yc = p[1];

		bbox = [xc - RADIUS, yc - RADIUS, xc + RADIUS, yc + RADIUS];
		layer.setSpatialFilter(...bbox);
		layer.features.forEach(f => {
			f = {
				type:'Feature',
				geometry:f.getGeometry().toObject()
			}
			turf.flatten(f).features.forEach(polygon => {
				let bbox = turf.bbox(polygon);
	
				let x0 = Math.max(-CELLCOUNT, Math.floor((bbox[0]-xc) / CELLSIZE));
				let y0 = Math.max(-CELLCOUNT, Math.floor((bbox[1]-yc) / CELLSIZE));
				let x1 = Math.min( CELLCOUNT, Math.floor((bbox[2]-xc) / CELLSIZE));
				let y1 = Math.min( CELLCOUNT, Math.floor((bbox[3]-yc) / CELLSIZE));

				for (let x = x0; x <= x1; x++) {
					for (let y = y0; y <= y1; y++) {
						let key = x + '_' + y;
						let cell = grid.get(key);
						if (!cell) grid.set(key, cell = {p:[]});
						cell.p.push(polygon);
					}
				}
			})
		})

		for (let cell of grid.values()) {
			cell.p = coords2GeoJSON(polygonClipping.union(features2Coords(cell.p)));
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
	opt.filenameIn ??= config.getFilename.alkisGeo(opt.slug+'.geojsonl');

	return new Promise(resolve => {
		let groupDB = new JSONDB(config.folders.mapGroup);

		console.log('load windfinder');

		let windFinder = WindFinder(opt.slugIn, (hoehe,rad,windEntry) => {
			let result = {};
			for (let type of opt.ruleTypes) {
				let maxDistance = -1;
				for (let rule of config.rules.values()) {
					// only rules from same Bundesland
					if (rule.ags !== windEntry.bundeslandAGS) continue;

					if (!rule[type]) continue;
					let distance = rule[type](hoehe,rad);
					if (distance > maxDistance) maxDistance = distance;
				}
				result[type] = maxDistance;
			}
			return result;
		});

		console.log('process '+opt.slugOut);

		let windSummary = [];
		const filesOut = new Map();

		let pipeline = Havel.pipeline(), n;
		if (opt.filenameIn.endsWith('.geojsonl')) {
			pipeline = pipeline.readFile(opt.filenameIn, { showProgress:true });
		} else {
			n = child_process.spawnSync('ogrinfo', ['-so','-al', opt.filenameIn]);
			n = n.stdout.toString().match(/Feature Count: (\d+)/)[1];
			n = parseInt(n, 10);
			pipeline = pipeline.spawnOut('ogr2ogr', ['-f', 'GeoJSONSeq', '/vsistdout/', opt.filenameIn])
		}
		pipeline
			.split()
			.forEach((feature, index) => {
				if (feature.length === 0) return;

				if (n && (index % 1e4 === 0)) process.stderr.write('\r'+(100*index/n).toFixed(2)+'%');
				feature = JSON.parse(feature);
				
				if (opt.cbFeature && (!opt.cbFeature(feature))) return;

				let type = feature.properties.type;
				if (!type) throw Error('type is missing')

				let windEntries = windFinder(feature);
				windEntries = windEntries.filter(({wind,distance}) => {
					let r = wind.properties.radius[type];
					if (r === undefined) return false;
					if (r === null) return false;
					if (r < 0) return false;
					return (r >= distance);
				})

				// ignore features that do not collide with wind turbines
				//if (windEntries.length === 0) return;
				
				if (opt.cbWindEntries && !opt.cbWindEntries(windEntries)) return;

				let groupIndexes = new Set();
				windEntries.forEach(({wind,distance}) => {
					let index = wind.properties.index;
					let minDistance = (windSummary[index] ??= { index, minDistance:{} }).minDistance;
					if ((minDistance[type] === undefined) || (minDistance[type] > distance)) minDistance[type] = distance;
					groupIndexes.add(wind.properties.groupIndex);
				})
				
				windEntries.sort((a,b) => a[1] - b[1]);
				feature.properties.windEntr = windEntries.map(({wind,distance}) => wind.properties._index).join(',');
				feature.properties.windDist = windEntries.map(({wind,distance}) => Math.round(distance)).join(',');

				for (let groupIndex of groupIndexes.values()) {
					let id = opt.slugOut+'-'+groupIndex;
					groupDB.add(id, feature);
				}
				
				feature.bbox = turf.bbox(feature);

				if (!filesOut.has(type)) {
					let filenameOut = config.getFilename.mapFeature(type+'.geojsonl');
					let file = new NDJSONWrite(filenameOut);
					file.filename = filenameOut;
					file.filenameFGB  = config.getFilename.mapFeature(type+'.fgb');
					file.filenameGPKG = config.getFilename.mapFeature(type+'.gpkg');
					filesOut.set(type, file);
				}
				filesOut.get(type).write(feature);
			})
			.drain()
			.finished(() => {
				for (let file of filesOut.values()) {
					file.close();

					let filenameTmp = config.getFilename.mapFeature('tmp-'+Math.random().toString(36).slice(2)+'.fgb');
					child_process.spawnSync('ogr2ogr', [ '-f','FlatGeoBuf', '-overwrite', '-progress', filenameTmp, 'GeoJSONSeq:'+file.filename ], { stdio:'inherit' })
					fs.renameSync(filenameTmp, file.filenameFGB);
					
					filenameTmp = config.getFilename.mapFeature('tmp-'+Math.random().toString(36).slice(2)+'.gpkg');
					child_process.spawnSync('ogr2ogr', [ '-f','GPKG', '-overwrite', '-progress', filenameTmp, 'GeoJSONSeq:'+file.filename ], { stdio:'inherit' })
					fs.renameSync(filenameTmp, file.filenameGPKG);
				}

				console.log('save wind summary');
				windSummary = windSummary.filter(w => w);
				fs.writeFileSync(config.getFilename.mapFeature(opt.slugOut+'.json'), JSON.stringify(windSummary));

				console.log('finished')
				groupDB.close();

				resolve();
			})
	})

	function NDJSONWrite(filename) {
		const fd = fs.openSync(filename, 'w');
		let buffers = [];
		return { write, close }

		function write(obj) {
			buffers.push(Buffer.from(JSON.stringify(obj)+'\n'));
			if (buffers.length > 1e5) flush();
		}

		function close() {
			flush();
			fs.closeSync(fd);
		}

		function flush() {
			fs.writeSync(fd, Buffer.concat(buffers));
			buffers = [];
		}
	}
}

function JSONDB(folder) {
	const cache = new Map();
	return { add, close }
	
	function add(key, entry) {
		let list = cache.get(key);
		if (!list) {
			list = [];
			cache.set(key, list);
		}
		list.push(Buffer.from(JSON.stringify(entry)+'\n'));
	}

	function close() {
		for (let [key,entries] of cache.entries()) {
			let filename = resolve(folder, key+'.geojsonl');
			fs.writeFileSync(filename, Buffer.concat(entries));
		}
	}
}

function union(...features) {
	return coords2GeoJSON(polygonClipping.union(features2Coords(features)));
}

function intersect(f1, f2) {
	return coords2GeoJSON(polygonClipping.intersection(features2Coords([f1]), features2Coords([f2])));
}

function features2Coords(features) {
	let coords = [];
	for (let feature of features) {
		if (!feature) continue;
		try {
			feature = turf.rewind(feature, {mutate:true})
		} catch (e) {
			console.dir({feature}, {depth:10});
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

function coords2GeoJSON(coords) {
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
			if (turf.booleanClockwise(ring) === (index === 0)) throw Error();
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
		Math.floor(mercator.x(bbox[0])*scale),
		Math.floor(mercator.y(bbox[3])*scale),
		Math.ceil( mercator.x(bbox[2])*scale),
		Math.ceil( mercator.y(bbox[1])*scale),
	]
}

function getTileBbox(x,y,z,b = 0.01) {
	const scale = 2 ** z;
  return [
	  demercator.x((x  -b)/scale),
	  demercator.y((y+1+b)/scale),
	  demercator.x((x+1+b)/scale),
	  demercator.y((y  -b)/scale),
  ]
}
