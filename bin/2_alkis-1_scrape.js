#!/usr/bin/node
'use strict'

// Based on and many thanks to: https://github.com/bundesAPI/deutschland/blob/main/src/deutschland/geo.py

const fs = require('fs');
const turf = require('@turf/turf');
const VectorTile = require('@mapbox/vector-tile').VectorTile;
const Protobuf = require('pbf');
const { fetchCached, Progress } = require('../lib/helper.js');
const config = require('../config.js');
const { createHash } = require('crypto');
const gunzip = require('util').promisify(require('zlib').gunzip);


const LEVEL = 15
const MAXSCALE = 2 ** LEVEL;
const SIZE = 4096*MAXSCALE;
const URL = 'https://adv-smart.de/tiles/smarttiles_de_public_v1/'
const BBOX = [5.8, 47.2, 15.1, 55.1]

let debuggerCounter = 0;
let debuggerBreaker = false;
let debuggerTraceIds = new Set([57472]);




start()

async function start() {

	const headers = {
		'Referer': 'https://adv-smart.de/map-editor/map',
		'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36',
	}

	const layerFiles = new LayerFiles();

	const bboxGermany = deg2tile(BBOX[0], BBOX[3], 0).concat(deg2tile(BBOX[2], BBOX[1], 0));
	const tileCount = (Math.floor(bboxGermany[2]*MAXSCALE) - Math.floor(bboxGermany[0]*MAXSCALE))
	                * (Math.floor(bboxGermany[3]*MAXSCALE) - Math.floor(bboxGermany[1]*MAXSCALE));
	const showProgress = Progress(tileCount);

	let tileIndex = 0;

	await downloadTileRec(0, 0, 0);

	async function downloadTileRec(x0, y0, z0) {
		if (debuggerBreaker) return;

		const scale = 2 ** z0;
		if (bboxGermany[0] * scale > x0 + 1) return;
		if (bboxGermany[1] * scale > y0 + 1) return;
		if (bboxGermany[2] * scale < x0    ) return;
		if (bboxGermany[3] * scale < y0    ) return;

		const tilePixelSize = 4096 * (2 ** (LEVEL - z0));
		const bboxPixel = [
			 x0      * tilePixelSize,
			 y0      * tilePixelSize,
			(x0 + 1) * tilePixelSize,
			(y0 + 1) * tilePixelSize,
		]
		
		const bboxPixelMargin = [
			bboxPixel[0] - 0.1,
			bboxPixel[1] - 0.1,
			bboxPixel[2] + 0.1,
			bboxPixel[3] + 0.1,
		]
		const bboxPixelMarginPolygon = turf.bboxPolygon(bboxPixelMargin);

		const propagateResults = [];
		if (z0 < LEVEL) {
			let features = [];
			for (let dy = 0; dy <= 1; dy++) {
				for (let dx = 0; dx <= 1; dx++) {
					(await downloadTileRec(x0*2+dx, y0*2+dy, z0+1))?.forEach(f => features.push(f));
				}
			}
			if (features.length > 0) {
				const lookup = new Map();
				features.forEach(f => {
					const hash = (f.hash ??= getHash(f));
					if (!lookup.has(hash)) lookup.set(hash, []);
					return lookup.get(hash).push(f);
				})
				features = [];
				for (let group of lookup.values()) {
					if (group.length <= 1) continue;
					tryMergingFeatures(group).forEach(f => addResult(f));
				}
			}

			function getHash(f) {
				let entries = Object.entries(f.properties);
				entries = entries.filter(e => !e[0].startsWith('_'))
				entries.sort((a,b) => a[0] < b[0] ? -1 : 1);
				entries = entries.map(e => e.join(':'));
				entries.push(f.properties.layerName);

				const hash = createHash('sha256');
				hash.update(entries.join(','));
				return hash.digest('base64');
			}
		} else {
			if (tileIndex % 100 === 0) showProgress(tileIndex);
			tileIndex++;

			const url = `${URL}${z0}/${x0}/${y0}.pbf`
			const filename = config.getFilename.alkisCache(`${x0}/${y0}.pbf`)
			let buffer = await fetchCached(filename, url, headers);
			if (buffer.length === 0) return;

			try {
				buffer = await gunzip(buffer);
			} catch (e) {
				throw Error('Error in Buffer. Delete file and try again:', filename);
			}

			const tile = new VectorTile(new Protobuf(buffer));
			for (let [layerName, layer] of Object.entries(tile.layers)) {

				for (let i = 0; i < layer.length; i++) {
					let feature = featureToObject(layer.feature(i));

					if (!feature) continue;
					if (feature.geometry.coordinates.length === 0) continue;
					if (!checkFeature(feature, true)) continue;

					let properties = feature.properties;
					let isPolygon = false;
					switch (feature.geometry.type) {
						case 'Point':
							let p = feature.geometry.coordinates;
							if (p[0] < bboxPixelMargin[0]) continue;
							if (p[1] < bboxPixelMargin[1]) continue;
							if (p[0] > bboxPixelMargin[2]) continue;
							if (p[1] > bboxPixelMargin[3]) continue;
						break;
						case 'LineString':
						case 'MultiLineString':
							feature = turf.bboxClip(feature, bboxPixelMargin)
						break;
						case 'Polygon':
						case 'MultiPolygon':
							isPolygon = true;
							feature = turf.intersect(feature, bboxPixelMarginPolygon);
						break;
						default: throw Error(feature.geometry.type);
					}
					if (!feature) continue;
					if (isEmptyFeature(feature)) continue;
					if (!checkFeature(feature, true)) continue;

					feature.properties = properties;
					feature.properties.layerName = layerName;

					addResult(feature);
				}
			}
		}

		if (debuggerBreaker) return;

		if (z0 === 9) {
			console.log(x0,y0);
			if ((x0 === 267) && (y0 === 162)) debuggerBreaker = true;
		}

		if (z0 < 10) console.log(`leftovers: ${propagateResults.length}\tx0:${x0}\ty0:${y0}\tzoom:${z0}`)

		if (debuggerBreaker) {
			propagateResults.forEach(f => demercator(f));
			fs.writeFileSync('../data/2_alkis/leftovers.geojson', JSON.stringify(turf.featureCollection(propagateResults)));
			console.log('WRITE');
			return
		}


		return propagateResults;

		function addResult(feature) {

			if (z0 === 0) return writeResult(feature);
			if (feature.geometry.type === 'Point') return writeResult(feature);

			turf.flatten(feature).features.forEach(part => {
				if (part.geometry.type.endsWith('Polygon') && (turf.area(demercator(part, true)) < 0.1)) return;
				part.bbox ??= turf.bbox(part);
				part.properties = Object.assign({}, feature.properties);

				if (countPoints(part) > 1e4) return writeResult(part);
			
				if (part.bbox[0] <= bboxPixel[0]) return propagateResults.push(part);
				if (part.bbox[1] <= bboxPixel[1]) return propagateResults.push(part);
				if (part.bbox[2] >= bboxPixel[2]) return propagateResults.push(part);
				if (part.bbox[3] >= bboxPixel[3]) return propagateResults.push(part);

				writeResult(part);
			})

			function writeResult(feature) {
				let layerFile = layerFiles.get(feature.properties.layerName);
				demercator(feature);
				delete feature.bbox;
				layerFile.write(JSON.stringify(feature));
			}

			function countPoints(feature) {
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
		}

		function featureToObject(feature) {
			if (feature.extent !== 4096) throw Error();
			if (z0 !== LEVEL) throw Error();
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
			feature.properties.featureType = feature.type;

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

function demercator(feature, copy) {
	if (copy) {
		feature = Object.assign({}, feature);
		feature.geometry = Object.assign({}, feature.geometry);
		feature.properties = Object.assign({}, feature.properties);
	}
	let geo = feature.geometry;
	switch (geo.type) {
		case 'Point':           geo.coordinates = demercatorRec(geo.coordinates, 1); break;
		case 'LineString':      geo.coordinates = demercatorRec(geo.coordinates, 2); break;
		case 'MultiLineString': geo.coordinates = demercatorRec(geo.coordinates, 3); break;
		case 'Polygon':         geo.coordinates = demercatorRec(geo.coordinates, 3); break;
		case 'MultiPolygon':    geo.coordinates = demercatorRec(geo.coordinates, 4); break;
		default: throw Error(geo.type);
	}
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
			if (f1.bbox[0] > f2.bbox[2]) continue;
			if (f1.bbox[1] > f2.bbox[3]) continue;
			if (f1.bbox[2] < f2.bbox[0]) continue;
			if (f1.bbox[3] < f2.bbox[1]) continue;

			let feature;
			switch (f1.properties.featureType) {
				case 2: feature = mergeLineStringFeatures(f1, f2); break;
				case 3: feature = mergePolygonFeatures(   f1, f2); break;
				default: throw Error();
			}

			if (!feature) continue;

			feature.properties = f1.properties;
			feature.bbox = turf.bbox(feature);
			feature.properties._counter = ++debuggerCounter; 

			if (debuggerTraceIds.has(feature.properties._counter)) {
				logFeatures({f1,f2,feature});
				throw Error();
			}

			//console.log('mergedFeature', mergedFeature);
			checkFeature(feature);

			features[i] = feature;
			features.splice(j,1);
			j--;
		}
	}

	return features;

	function mergeLineStringFeatures(f1, f2) {
		if (f1.geometry.type !== 'LineString') throw Error(f1.geometry.type+' is not supported');
		if (f2.geometry.type !== 'LineString') throw Error(f2.geometry.type+' is not supported');
		
		let newLineString
		try {
			newLineString = mergeLineStrings(f1.geometry.coordinates, f2.geometry.coordinates)
		} catch (e) {
			console.dir({'f1.geometry.coordinates':f1.geometry.coordinates});
			console.dir({'f2.geometry.coordinates':f2.geometry.coordinates});
			throw e;
		}

		if (!newLineString) return

		if (newLineString.length < 2) throw Error();
		
		f1.geometry.coordinates = newLineString;

		if (!checkFeature(f1, true)) return false;

		try {
			f1 = turf.simplify(f1, { tolerance:0.5, mutate:false })
		} catch (e) {
			console.dir({f1}, {depth:6});
			throw e;
		}

		checkFeature(f1);

		//console.dir({result:f1}, {depth:6})
		
		return f1;

		function mergeLineStrings(pathA, pathB) {
			let ea = pathA.length-1;
			let eb = pathB.length-1;
			let d00 = distanceSeg2Seg(pathA[   1], pathA[ 0], pathB[ 0], pathB[   1]);
			let d01 = distanceSeg2Seg(pathA[   1], pathA[ 0], pathB[eb], pathB[eb-1]);
			let d10 = distanceSeg2Seg(pathA[ea-1], pathA[ea], pathB[ 0], pathB[   1]);
			let d11 = distanceSeg2Seg(pathA[ea-1], pathA[ea], pathB[eb], pathB[eb-1]);

			let minDistance = Math.min(d00.d, d01.d, d10.d, d11.d);
			if (Number.isNaN(minDistance)) {
				console.dir({pathA,pathB})
				console.dir({d00,d01,d10,d11})
				throw Error();
			}
			if (minDistance > 1) {
				//console.log('minDistance', minDistance);
				return;
			}

			switch (minDistance) {
				case d00.d: return concatPaths(pathA.slice().reverse(), pathB, d00);
				case d01.d: return concatPaths(pathB, pathA, d01);
				case d10.d: return concatPaths(pathA, pathB, d10);
				case d11.d: return concatPaths(pathA, pathB.slice().reverse(), d11);
			}
			
			console.log({minDistance});
			console.log({d00,d01,d10,d11})
			throw Error();

			function concatPaths(path1, path2, d) {
				let path = path1.slice(0,-1);
				path.push([
					(d.p1[0]+d.p2[0])/2,
					(d.p1[1]+d.p2[1])/2,
				])
				return path.concat(path2.slice(1));
			}

			function distanceSeg2Seg(seg1a, seg1b, seg2a, seg2b) {
				let seg1Len = [ seg1b[0]-seg1a[0], seg1b[1]-seg1a[1] ];
				let seg2Len = [ seg2b[0]-seg2a[0], seg2b[1]-seg2a[1] ];
				let w = [ seg1a[0]-seg2a[0], seg1a[1]-seg2a[1] ];
				let a = seg1Len[0]*seg1Len[0] + seg1Len[1]*seg1Len[1];
				let b = seg1Len[0]*seg2Len[0] + seg1Len[1]*seg2Len[1];
				let c = seg2Len[0]*seg2Len[0] + seg2Len[1]*seg2Len[1];
				let d = seg1Len[0]*w[0] + seg1Len[1]*w[1];
				let e = seg2Len[0]*w[0] + seg2Len[1]*w[1];
				let D = a * c - b * b;
				let sN;
				let sD = D;
				let tN;
				let tD = D;
				if (D < 1e-6) {
					sN = 0;
					sD = 1;
					tN = e;
					tD = c;
				} else {
					sN = (b * e - c * d);
					tN = (a * e - b * d);
					if (sN < 0) {
						sN = 0;
						tN = e;
						tD = c;
					} else if (sN > sD) {
						sN = sD;
						tN = e + b;
						tD = c;
					}
				}
				if (tN < 0) {
					tN = 0;
					if (-d < 0) {
						sN = 0;
					} else if (-d > a) {
						sN = sD;
					} else {
						sN = -d;
						sD = a;
					}
				} else if (tN > tD) {
					tN = tD;
					if (b-d < 0) {
						sN = 0;
					} else if (b-d > a) {
						sN = sD;
					} else {
						sN = b-d;
						sD = a;
					}
				}
				let s1Scale = (Math.abs(sN) < 1e-6 ? 0 : sN / sD);
				let s2Scale = (Math.abs(tN) < 1e-6 ? 0 : tN / tD);
				if (s1Scale < 0.5) s1Scale = 0.5;
				if (s2Scale > 0.5) s2Scale = 0.5;
				let p1 = [ seg1a[0] + seg1Len[0]*s1Scale, seg1a[1] + seg1Len[1]*s1Scale ];
				let p2 = [ seg2a[0] + seg2Len[0]*s2Scale, seg2a[1] + seg2Len[1]*s2Scale ];
				let dx = p1[0] - p2[0];
				let dy = p1[1] - p2[1];
				return { d: Math.sqrt( dx*dx + dy*dy ), p1, p2, s1Scale, s2Scale };
			}
		}
	}

	function mergePolygonFeatures(f1, f2) {
		if (debuggerTraceIds.has(f1.properties._counter) || debuggerTraceIds.has(f2.properties._counter)) {
			console.dir({f1,f2}, {depth:8})
			console.dir({
				booleanIntersects:turf.booleanIntersects(f1, f2),
				intersect:turf.intersect(f1, f2),
			})
			throw Error();
		}
		try {
			if (!turf.booleanIntersects(f1, f2)) return;
			//if (!turf.intersect(f1, f2)) return;
		} catch (e) {
			console.dir({f1,f2}, {depth:8})
			throw e;
		}
		let f = turf.union(f1, f2);

		if (!f) {
			console.log('can not merge');
			console.log(JSON.stringify(f1));
			console.log(JSON.stringify(f2));
			return;
		}

		if (f.geometry.type === 'MultiPolygon') {
			console.log('booleanIntersects', turf.booleanIntersects(f1, f2));
			console.log('intersect', turf.intersect(f1, f2));
			logFeatures({f1,f2,f});
			throw Error(f.geometry.type);
		}
		
		if (f.geometry.type !== 'Polygon') throw Error(f.geometry.type);

		checkFeature(f, true);

		turf.simplify(f, { tolerance:0.5, mutate:true });
		
		checkFeature(f);

		return f;
	}
}

function checkFeature(feature, repair) {
	let coord = feature.geometry.coordinates;

	try {
		switch (feature.geometry.type) {
			case 'Point':
				return checkPoint(coord);
			case 'LineString':
				checkKink();
				return checkPath(coord);
			case 'MultiLineString':
				checkKink();
				return checkMultiOf(coord, checkPath);
			case 'Polygon':
				checkKink();
				return checkPolygon(coord);
			case 'MultiPolygon':
				checkKink();
				return checkMultiOf(coord, checkPolygon);
			default:
				throw Error(feature.geometry.type);
		}
	} catch (e) {
		console.dir(feature, {depth:10});
		demercator(feature);
		console.log(JSON.stringify(feature));
		throw e;
	}

	function checkKink() {
		if (turf.kinks(feature).features.length === 0) return true;
		if (!repair) throw Error('contains kinks');
		if (!feature.geometry.type.endsWith('Polygon')) throw Error('i can only handle polygons');
		
		let features = turf.unkinkPolygon(feature).features;
		let newFeature;
		if (features.length === 1) {
			newFeature = features[0];
		} else {
			newFeature = features.map(f => f.geometry.coordinates);
		}

		Object.assign(feature, newFeature);
		return true;
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
					throw Error('Path must not include duplicated points')
				}
			}
			return true;
		}
	}
	function checkRing(data) {
		checkArray(data, 4);
		if (!checkPath(data)) return false;
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
			for (let i = 0; i < data.length; i++) checkRing(data[i]);
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

function isEmptyFeature(feature) {
	switch (feature.geometry.type) {
		case 'Point':
			return (feature.geometry.coordinates.length < 2);
		break;
		case 'LineString':
		case 'MultiLineString':
		case 'Polygon':
		case 'MultiPolygon':
			return (feature.geometry.coordinates.length === 0);
		break;
		default:
			throw Error(feature.geometry.type);
	}
	return false;
}

function logFeatures(obj) {
	for (let key in obj) {
		console.log('###', key);
		let f = obj[key];
		console.dir(f, {depth:10});
		demercator(f);
		console.log({
			area: turf.area(f),
		})
		console.log(JSON.stringify(f));
	}
}
