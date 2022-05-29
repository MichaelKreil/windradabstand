#!/usr/bin/env -S node --max-old-space-size=4096
'use strict'

// Based on the idea of: https://github.com/bundesAPI/deutschland/blob/main/src/deutschland/geo.py

const fs = require('fs');
const turf = require('@turf/turf');
const VectorTile = require('@mapbox/vector-tile').VectorTile;
const Protobuf = require('pbf');
const { Progress } = require('../lib/helper.js');
const polygonClipping = require('polygon-clipping');
const config = require('../config.js');
const { createHash } = require('crypto');
const gunzip = require('util').promisify(require('zlib').gunzip);


const MAXLEVEL = 15
const MAXSCALE = 2 ** MAXLEVEL;
const SIZE = 4096*MAXSCALE;
const BBOX = [5.8, 47.2, 15.1, 55.1]

start()

async function start() {
	const LEVELBBOX = [];
	for (let z = 0; z <= MAXLEVEL; z++) {
		const tileMin = deg2tile(BBOX[0], BBOX[3], z).map(Math.floor);
		const tileMax = deg2tile(BBOX[2], BBOX[1], z).map(Math.floor);
		LEVELBBOX[z] = [tileMin[0], tileMin[1], tileMax[0], tileMax[1]]
	}

	const progressMax = (LEVELBBOX[MAXLEVEL][2] - LEVELBBOX[MAXLEVEL][0] + 1)*(LEVELBBOX[MAXLEVEL][3] - LEVELBBOX[MAXLEVEL][1] + 1)
	let progressPos = 0;

	const layerFiles = new LayerFiles();

	const showProgress = Progress(progressMax);

	await mergeTileRec(0,0,0);

	async function mergeTileRec(x0, y0, z0) {
		if (z0 > MAXLEVEL) throw Error();

		if (x0 < LEVELBBOX[z0][0]) return [];
		if (y0 < LEVELBBOX[z0][1]) return [];
		if (LEVELBBOX[z0][2] < x0) return [];
		if (LEVELBBOX[z0][3] < y0) return [];
		
		if (z0 === MAXLEVEL) {
			progressPos++;
			if (progressPos % 10 === 0) showProgress(progressPos);
		}

		const tilePixelSize = 4096 * (2 ** (MAXLEVEL - z0));
		const bboxPixel = [
			 x0      * tilePixelSize,
			 y0      * tilePixelSize,
			(x0 + 1) * tilePixelSize,
			(y0 + 1) * tilePixelSize,
		]

		let features = [];
		if (z0 === MAXLEVEL) {
		const bboxPixelPolygon = turf.bboxPolygon(bboxPixel);

			const buffer = await getTile(x0,y0,z0);
		if (!buffer) return [];
			const tile = new VectorTile(new Protobuf(buffer));
			
			for (let [layerName, layer] of Object.entries(tile.layers)) {

				// Ignoriere
				//if (layerName === 'Hintergrund') continue;
				//if (layerName === 'Vegetationsflaeche') continue;
				//if (layerName === 'Gewaesserflaeche') continue;

				for (let i = 0; i < layer.length; i++) {
					let feature = featureToObject(layer.feature(i));

					if (!feature) continue;
					checkFeature(feature, true);
					if (feature.geometry.coordinates.length === 0) continue;

					let properties = feature.properties;
					properties.layerName = layerName;

					switch (feature.geometry.type) {
						case 'Point':
							let p = feature.geometry.coordinates;
							if (p[0] < bboxPixel[0]) continue;
							if (p[1] < bboxPixel[1]) continue;
							if (p[0] > bboxPixel[2]) continue;
							if (p[1] > bboxPixel[3]) continue;
							feature.properties = Object.assign({}, properties)
							writeResult(feature);
							continue;
						break;
						case 'LineString':
						case 'MultiLineString':
							feature = turf.bboxClip(feature, bboxPixel)
						break;
						case 'Polygon':
						case 'MultiPolygon':
							feature = intersect(feature, bboxPixelPolygon);
						break;
						default: throw Error(feature.geometry.type);
					}

					feature = turf.truncate(feature, {precision:0, coordinates:2, mutate:true});

					turf.flatten(feature).features.forEach(f => {
						f.properties = Object.assign({}, properties)
						if (!checkFeature(f, true)) return;
						features.push(f);
					})
				}
			}
		} else {
			for (let dy = 0; dy <= 1; dy++) {
				for (let dx = 0; dx <= 1; dx++) {
					let x = x0*2+dx;
					let y = y0*2+dy;
					let z = z0+1;
					(await mergeTileRec(x,y,z)).forEach(f => features.push(f));
				}
			}
		}

		const propagateResults = [];

		if (features.length > 0) {
			const lookup = new Map();
			features.forEach(f => {
				f.bbox ??= turf.bbox(f);
				const hash = (f.hash ??= calcFeatureHash(f));
				if (!lookup.has(hash)) lookup.set(hash, []);
				return lookup.get(hash).push(f);
			})
			features = [];
			for (let group of lookup.values()) {
				if (group.length > 1) group = tryMergingFeatures(group);

				group.forEach(feature => {

					if (!feature.properties.layerName) throw Error();
				
					if (z0 === 0) return writeResult(feature);
					if (feature.geometry.type === 'Point') return writeResult(feature);
					
					turf.flatten(feature).features.forEach(part => {
						if (part.geometry.type.endsWith('Polygon') && (turf.area(demercator(part)) < 0.1)) return;
						if (!checkFeature(part, true)) return;

						part.bbox ??= turf.bbox(part);
						part.properties = Object.assign({}, feature.properties);

						if (countPointsInFeature(part) > 1e6) return writeResult(part);

						if (z0 === MAXLEVEL) return propagateResults.push(part);
						if (part.bbox[0] <= bboxPixel[0]) return propagateResults.push(part);
						if (part.bbox[1] <= bboxPixel[1]) return propagateResults.push(part);
						if (part.bbox[2] >= bboxPixel[2]) return propagateResults.push(part);
						if (part.bbox[3] >= bboxPixel[3]) return propagateResults.push(part);
						
						writeResult(part);
					})
				})
			}
		}

		return propagateResults;

		function writeResult(feature) {
			let layerFile = layerFiles.get(feature.properties.layerName);
			feature = demercator(feature);
			delete feature.bbox;
			layerFile.write(JSON.stringify(feature));
		}

		function featureToObject(feature) {
			if (feature.extent !== 4096) throw Error();
			if (z0 !== MAXLEVEL) throw Error();
			let i, j, coordinates = feature.loadGeometry();

			function handleLine(line) {
				for (let i = 0; i < line.length; i++) {
					let p = line[i];
					line[i] = [p.x + bboxPixel[0], p.y + bboxPixel[1]];
				}
			}

			let type;
			switch (feature.type) {
				case 1:
					for (i = 0; i < coordinates.length; i++) coordinates[i] = coordinates[i][0];
					handleLine(coordinates);
					type = 'Point';
					break;

				case 2:
					for (i = 0; i < coordinates.length; i++) handleLine(coordinates[i]);
					type = 'LineString';
					break;

				case 3:
					coordinates = classifyRings(coordinates);
					for (i = 0; i < coordinates.length; i++) {
						for (j = 0; j < coordinates[i].length; j++) handleLine(coordinates[i][j]);
					}
					type = 'Polygon';
					break;
				default: throw Error();
			}

			if (coordinates.length === 1) {
				coordinates = coordinates[0];
			} else {
				type = 'Multi' + type;
			}

			return {
				type: 'Feature',
				geometry: { type, coordinates },
				properties: feature.properties,
			}

			// classifies an array of rings into polygons with outer rings and holes

			function classifyRings(rings) {
				let len = rings.length;

				if (len <= 1) return [rings];

				let polygons = [],
					polygon,
					ccw;

				for (let i = 0; i < len; i++) {
					let area = signedArea(rings[i]);
					if (area === 0) continue;

					if (ccw === undefined) ccw = area < 0;

					if (ccw === area < 0) {
						if (polygon) polygons.push(polygon);
						polygon = [rings[i]];

					} else {
						polygon.push(rings[i]);
					}
				}
				if (polygon) polygons.push(polygon);

				return polygons;
			}

			function signedArea(ring) {
				let sum = 0;
				for (let i = 0, len = ring.length, j = len - 1, p1, p2; i < len; j = i++) {
					p1 = ring[i];
					p2 = ring[j];
					sum += (p2.x - p1.x) * (p1.y + p2.y);
				}
				return sum;
			}
		}

		async function getTile(x,y,z) {
			const filename = config.getFilename.alkisCache(`${z}/${x}/${y}.pbf`)
			if (!fs.existsSync(filename)) return;

			let buffer = fs.readFileSync(filename);
			if (buffer.length === 0) return;

			try {
				return await gunzip(buffer);
			} catch (e) {
				throw Error('Error in Buffer. Delete file and try again:', filename);
			}
		}
	}

	function LayerFiles() {
		let map = new Map();
		return { get, close }
		function get(name) {
			if (map.has(name)) return map.get(name);
			let filename = config.getFilename.alkisGeo(name.toLowerCase().replace(/\s/g, '_') + '.geojsonl');
			let file = fs.openSync(filename, 'w')
			let obj = {
				write: line => fs.writeSync(file, line + '\n'),
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
			(1 - Math.asinh(Math.tan(lat_deg * Math.PI / 180)) / Math.PI) / 2 * n
		]
	}
}

function demercator(feature) {
	feature = Object.assign({}, feature);
	feature.geometry = Object.assign({}, feature.geometry);
	feature.properties = Object.assign({}, feature.properties);
	let geo = feature.geometry;
	switch (geo.type) {
		case 'Point':           geo.coordinates = demercatorRec(geo.coordinates, 1); break;
		case 'LineString':      geo.coordinates = demercatorRec(geo.coordinates, 2); break;
		case 'MultiLineString': geo.coordinates = demercatorRec(geo.coordinates, 3); break;
		case 'Polygon':         geo.coordinates = demercatorRec(geo.coordinates, 3); break;
		case 'MultiPolygon':    geo.coordinates = demercatorRec(geo.coordinates, 4); break;
		default: throw Error(geo.type);
	}
	feature = turf.rewind(feature, {mutate:true});
	return feature;

	function demercatorRec(coordinates, depth) {
		if (depth > 1) return coordinates.map(l => demercatorRec(l, depth - 1));
		return [
			360 * coordinates[0] / SIZE - 180,
			360 / Math.PI * Math.atan(Math.exp((1 - coordinates[1] * 2 / SIZE) * Math.PI)) - 90,
		]
	}
}

function tryMergingFeatures(features) {
	
	for (let i = 0; i < features.length; i++) {
		for (let j = i+1; j < features.length; j++) {
			let f1 = features[i];
			let f2 = features[j];

			if (f1.geometry.type !== f2.geometry.type) throw Error(`${f1.geometry.type} !== ${f2.geometry.type}`);

			if (f1.bbox[0] > f2.bbox[2]) continue;
			if (f1.bbox[1] > f2.bbox[3]) continue;
			if (f1.bbox[2] < f2.bbox[0]) continue;
			if (f1.bbox[3] < f2.bbox[1]) continue;

			let feature;
			try {
				switch (f1.geometry.type) {
					case 'LineString':
						feature = mergeLineStringFeatures([f1, f2]);
					break;
					case 'Polygon':
						feature = mergePolygonFeatures(f1, f2);
					break;
					default: throw Error(f1.geometry.type);
				}

				if (!feature) continue;

				feature.properties = f1.properties;
				feature.bbox = turf.bbox(feature);
				
				if (!checkFeature(feature, true)) throw Error();

			} catch (e) {
				logFeatures({f1, f2, feature});
				throw e;
			}

			features[i] = feature;
			features.splice(j,1);
			j--;
		}
	}

	return features;

	function mergeLineStringFeatures(features) {
		let pointLookup = new Map();

		features.forEach(feature => {
			if (feature.geometry.type !== 'LineString') throw Error(feature.geometry.type+' is not supported');
			let points = feature.geometry.coordinates.map(coord => {
				let key = coord.join(',');
				if (!pointLookup.has(key)) pointLookup.set(key, {coord, neighbours:new Set()})
				return pointLookup.get(key)
			})
			for (let i = 1; i < points.length; i++) {
				let p1 = points[i-1];
				let p2 = points[i];
				p1.neighbours.add(p2);
				p2.neighbours.add(p1);
			}
		})

		let pointList = Array.from(pointLookup.values());
		let impPoints = pointList.filter(p => p.neighbours.size !== 2);
		let endPoints;
		while (true) {
			endPoints = impPoints.filter(p => p.neighbours.size === 1);
			if (endPoints.length <= 2) break;

			pointList.forEach((p, i) => p.group = i);
			while (true) {
				let stable = true;
				pointList.forEach(p => {
					p.neighbours.forEach(p2 => {
						if (p2.group >= p.group) return;
						p.group = p2.group;
						stable = false;
					})
				})
				if (stable) break;
			}

			let minDistance = 1e10, minPair;
			for (let i1 = 0; i1 < endPoints.length; i1++) {
				for (let i2 = i1+1; i2 < endPoints.length; i2++) {
					let p1 = endPoints[i1];
					let p2 = endPoints[i2];
					if (p1.group === p2.group) continue;
					let distance = calcDistance(p1.coord, p2.coord);
					if (distance >= minDistance) continue;
					minDistance = distance;
					minPair = [p1,p2]
				}
			}
			if (minDistance > 3) break;

			minPair[0].neighbours.add(minPair[1]);
			minPair[1].neighbours.add(minPair[0]);

			function calcDistance(c1, c2) {
				let dx = c1[0] - c2[0];
				let dy = c1[1] - c2[1];
				return Math.sqrt(dx*dx + dy*dy);
			}
		}
		if (endPoints.length > 2) return false;
		if (endPoints.length === 0) return zip(pointList[0]);
		return zip(endPoints[0]);

		function zip(p1) {
			let points = [];
			while (true) {
				points.push(p1.coord);
				if (p1.neighbours.size === 0) break;
				let p2 = p1.neighbours.values().next().value;
				p1.neighbours.delete(p2);
				p2.neighbours.delete(p1);
				p1 = p2;
			}

			let leftOvers = Array.from(pointLookup.values()).filter(p => p.neighbours.size > 0 );
			if (leftOvers.length > 0) return false;

			return turf.lineString(points);
		}
	}

	function mergePolygonFeatures(f1, f2) {
		try {
			if (!turf.booleanIntersects(f1, f2)) return false;
			let f = union(f1, f2);
			if (f.geometry.type === 'MultiPolygon') return false;
			return f;
		} catch (e) {
			logFeatures({f1,f2})
			throw e;
		}
	}
}

function checkFeature(feature, repair) {
	let coord = feature.geometry.coordinates;
	let result;

	if (!feature.properties) throw Error('no properties');

	try {
		switch (feature.geometry.type) {
			case 'Point':
				return checkPoint(coord);
			case 'LineString':      result = checkPath(coord); break;
			case 'MultiLineString': result = checkMultiOf(coord, checkPath); break;
			case 'Polygon':         result = checkPolygon(coord); break;
			case 'MultiPolygon':    result = checkMultiOf(coord, checkPolygon); break;
			default:
				throw Error(feature.geometry.type);
		}
		turf.rewind(feature, {mutate:true})
		return result;
	} catch (e) {
		console.dir(feature, {depth:10});
		feature = demercator(feature);
		console.log(JSON.stringify(feature));
		throw e;
	}

	function checkPoint(data) {
		if (!Array.isArray(data)) throw Error('Point must an array');
		if (data.length !== 2) throw Error('Point must be an array of 2 elements, like: [x,y]');
		if (!Number.isFinite(data[0])) throw Error('Point[0] must be a finite number')
		if (!Number.isFinite(data[1])) throw Error('Point[1] must be a finite number')
		return true;
	}

	function checkArray(data, minLength) {
		if (!Array.isArray(data)) throw Error('must be an array');
		if (minLength && (data.length < minLength)) throw Error('must be an array, min length: '+minLength);
		return true;
	}
	function checkPath(data) {
		if (repair) {
			checkArray(data);
			for (let i = 0; i < data.length; i++) checkPoint(data[i])
			
			for (let i = 1; i < data.length; i++) {
				if (!isSamePoint(data[i-1], data[i])) continue;
				data.splice(i-1, 1);
				i--;
			}

			if ((data.length === 3) && isSamePoint(data[0], data[2])) return false;

			return data.length >= 2;
		} else {
			checkArray(data, 2);
			for (let i = 0; i < data.length; i++) checkPoint(data[i])
			for (let i = 1; i < data.length; i++) {
				if (isSamePoint(data[i-1], data[i])) {
					throw Error('Path must not include duplicated points: '+JSON.stringify(data[i]));
				}
			}
			return true;
		}
	}

	function checkRing(data) {
		checkArray(data, 4);
		if (!checkPath(data)) return false;

		if (repair) {
			if (isSamePoint(data[0], data[data.length-1])) data.pop();
			for (let i0 = 0; i0 < data.length; i0++) {
				let i1 = (i0+1) % data.length;
				let i2 = (i1+1) % data.length;

				let p0 = data[i0];
				let p1 = data[i1];
				let p2 = data[i2];
				let d01 = Math.sqrt(Math.pow(p0[0]-p1[0],2) + Math.pow(p0[1]-p1[1],2));
				let d12 = Math.sqrt(Math.pow(p1[0]-p2[0],2) + Math.pow(p1[1]-p2[1],2));

				let area = Math.abs(p0[0]*(p1[1]-p2[1]) + p1[0]*(p2[1]-p0[1]) + p2[0]*(p0[1]-p1[1]));
				let angle = (
					(p0[0]-p1[0]) * (p1[0]-p2[0]) +
					(p0[1]-p1[1]) * (p1[1]-p2[1])
				) / (d01 * d12 + 1e-20);
				let v = area*(angle+1);
				if (v > 0.2) continue;
				data.splice(i1,1);
				i0 = Math.max(0, i0-2);
			}
			data.push(data[0]);
		}
		if (!isSamePoint(data[0], data[data.length-1])) throw Error('first and last point of a ring must be identical');
		
		return data.length >= 4;
	}

	function checkPolygon(data) {
		if (repair) {
			checkArray(data);
			if (data.length === 0) return false;
			if (!checkRing(data[0])) return false;
			for (let i = 1; i < data.length; i++) {
				if (checkRing(data[i])) continue;
				data.splice(i,1);
				i--;
			}
			return true;
		} else {
			checkArray(data, 1)
			for (let i = 0; i < data.length; i++) {
				checkRing(data[i]);
				if (turf.booleanClockwise(data[i]) === (i === 0)) throw Error();
			}
			return true;
		}
	}

	function checkMultiOf(data, cbCheck) {
		if (repair) {
			checkArray(data);

			for (let i = 0; i < data.length; i++) {
				if (cbCheck(data[i])) continue;
				data.splice(i,1);
				i--;
			}
			if (data.length < 1) return false;
			if (data.length === 1) {
				feature.geometry.type = feature.geometry.type.slice(5);
				feature.geometry.coordinates = data[0];
			}

			return true;
		} else {
			checkArray(data, 2);
			for (let i = 0; i < data.length; i++) cbCheck(data[i]);
			return true;
		}
	}

	function isSamePoint(p1, p2) {
		if (Math.abs(p1[0] - p2[0]) > 1e-10) return false;
		if (Math.abs(p1[1] - p2[1]) > 1e-10) return false;
		return true;
	}
}

function logFeatures(obj) {
	for (let key in obj) {
		console.log('###', key);
		let f = obj[key];
		if (!f) continue;

		console.dir(f, {depth:10});
		f = demercator(f);
		console.log({
			area: turf.area(f),
		})
		console.log(JSON.stringify(f));
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
		feature = turf.rewind(feature, {mutate:true})
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

function countPointsInFeature(feature) {
	switch (feature.geometry.type) {
		case 'Point':           return count(feature.geometry.coordinates, 0);
		case 'LineString':      return count(feature.geometry.coordinates, 1);
		case 'MultiLineString': return count(feature.geometry.coordinates, 2);
		case 'Polygon':         return count(feature.geometry.coordinates, 2);
		case 'MultiPolygon':    return count(feature.geometry.coordinates, 3);
		default: throw Error(feature.geometry.type);
	}

	function count(coordinates, depth) {
		if (depth === 0) return coordinates.length;
		return coordinates.reduce((s,c) => s+count(c,depth-1), 0);
	}
}

function calcFeatureHash(feature) {
	let entries = Object.entries(feature.properties);
	entries = entries.filter(e => !e[0].startsWith('_'))
	entries.sort((a,b) => a[0] < b[0] ? -1 : 1);
	entries = entries.map(e => e.join(':'));
	entries.push(feature.properties.layerName);

	const hash = createHash('sha256');
	hash.update(entries.join(','));
	return hash.digest('base64');
}
