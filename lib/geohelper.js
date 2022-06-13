'use strict'

const fs = require('fs');
const turf = require('@turf/turf');
const Havel = require('havel');
const config = require('../config.js');
const { Progress } = require('./helper.js');
const { resolve } = require('path');



const tiny = 1e-6; // tiny distance in degrees, e.g. 1e-6 = 10cm



module.exports = {
	BundeslandFinder,
	WindFinder,
	processAlkis,
}



function BundeslandFinder() {
	let filenameCache = config.getFilename.helper('bundeslandFinder.json');
	let geoFinder = GeoFinder();

	if (!fs.existsSync(filenameCache)) {
		let bundeslaender = fs.readFileSync(config.getFilename.static('bundeslaender.geojson'));
		bundeslaender = JSON.parse(bundeslaender);
		bundeslaender.features.forEach((bundesland, index) => {
			bundesland.properties = Object.fromEntries(
				Object.entries(bundesland.properties).map(e => [e[0].toLowerCase(), e[1]])
			)

			switch (bundesland.properties.AGS) {
				case '01': bundesland.properties.name = 'Schleswig-Holstein'; break;
				case '02': bundesland.properties.name = 'Hamburg'; break;
				case '03': bundesland.properties.name = 'Niedersachsen'; break;
				case '04': bundesland.properties.name = 'Bremen'; break;
				case '05': bundesland.properties.name = 'Nordrhein-Westfalen'; break;
				case '06': bundesland.properties.name = 'Hessen'; break;
				case '07': bundesland.properties.name = 'Rheinland-Pfalz'; break;
				case '08': bundesland.properties.name = 'Baden-Württemberg'; break;
				case '09': bundesland.properties.name = 'Bayern'; break;
				case '10': bundesland.properties.name = 'Saarland'; break;
				case '11': bundesland.properties.name = 'Berlin'; break;
				case '12': bundesland.properties.name = 'Brandenburg'; break;
				case '13': bundesland.properties.name = 'Mecklenburg-Vorpommern'; break;
				case '14': bundesland.properties.name = 'Sachsen'; break;
				case '15': bundesland.properties.name = 'Sachsen-Anhalt'; break;
				case '16': bundesland.properties.name = 'Thüringen'; break;
				default: return
			}
		})
		geoFinder.create(bundeslaender, filenameCache)
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
			w.maxRadius = Math.max(...Object.values(w.radius)) || 0;
			if (!w.maxRadius) return false;
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
		windEntries.forEach(windEntry => {
			let { point } = windEntry.properties;

			if (isPolygon && turf.booleanPointInPolygon(point, feature)) return result.push([windEntry,0])

			let minDist = 1e10;
			for (let lineString of lineStrings) {
				let dist = 1000*turf.pointToLineDistance(point, lineString);
				if (dist > minDist) continue;
				minDist = dist;
				if (windEntry.maxRadius < minDist) return;
			}
			return result.push([windEntry, minDist]);
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
	if (!opt.cbFeature) throw Error('need cbFeature');

	opt.filenameIn  ??= config.getFilename.alkisGeo(opt.slug+'.geojsonl');
	opt.filenameOut ??= config.getFilename.mapFeature(opt.slug+'.geojsonl');

	return new Promise(resolve => {
		let groupDB = new JSONDB(config.folders.mapGroup);

		console.log('load windfinder');

		let windFinder = WindFinder(opt.slug, (hoehe,rad,windEntry) => {
			let result = {};
			for (let type of opt.ruleTypes) {
				let maxDistance = 0;
				for (let rule of config.rules.values()) {
					if (!rule[type]) continue;
					let distance = rule[type](hoehe,rad);
					if (maxDistance < distance) maxDistance = distance;
				}
				result[type] = maxDistance;
			}
			return result;
		});

		console.log('process '+opt.slug);

		let windSummary = [];

		Havel.pipeline()
			.readFile(opt.filenameIn, { showProgress: true })
			.split()
			.map(feature => {
				if (feature.length === 0) return;
				feature = JSON.parse(feature);
				
				if (!opt.cbFeature(feature)) return;

				let type = feature.properties.type;
				if (!type) throw Error('type is missing')

				let windEntries = windFinder(feature);
				windEntries = windEntries.filter(w => w[0].properties.radius[type] >= w[1])

				// ignore features that do not collide with wind turbines
				//if (windEntries.length === 0) return;
				
				if (opt.cbWindEntries && !opt.cbWindEntries(windEntries)) return;

				let groupIndexes = new Set();
				windEntries.forEach(([w,d]) => {
					let index = w.properties.index;
					let minDistance = (windSummary[index] ??= { index, minDistance:{} }).minDistance;
					if ((minDistance[type] === undefined) || (minDistance[type] > d)) minDistance[type] = d;
					groupIndexes.add(w.properties.groupIndex);
				})
				
				windEntries.sort((a,b) => a[1] - b[1]);
				feature.properties.windEntr = windEntries.map(([w,d]) => w.properties._index).join(',');
				feature.properties.windDist = windEntries.map(([w,d]) => Math.round(d)).join(',');

				for (let groupIndex of groupIndexes.values()) {
					let id = opt.slug+'-'+groupIndex;
					groupDB.add(id, feature);
				}

				return JSON.stringify(feature);
			})
			.join()
			.writeFile(opt.filenameOut)
			.finished(() => {
				console.log('save wind summary');
				windSummary = windSummary.filter(w => w);
				fs.writeFileSync(config.getFilename.mapFeature(opt.slug+'.json'), JSON.stringify(windSummary));

				console.log('finished')
				groupDB.close();

				resolve();
			})
	})
}

function JSONDB(folder) {
	const flushEveryUpdate = 1e10;
	const cache = new Map();
	let updateCount = 0;
	return { add, close }
	
	function add(key, entry) {
		let list = cache.get(key);
		if (!list) {
			list = [];
			cache.set(key, list);
		}
		list.push(Buffer.from(JSON.stringify(entry)+'\n'));
		//updateCount++;
		//if (updateCount > flushEveryUpdate) flush();
	}

	function close() {
		flush();
	}

	function flush() {
		for (let [key,entries] of cache.entries()) {
			let filename = resolve(folder, key+'.ndjson');
			fs.writeFileSync(filename, Buffer.concat(entries));
		}
		//cache.clear();
		//updateCount = 0;
	}
}
