#!/usr/bin/env node
'use strict'

const fs = require('fs');
const turf = require('@turf/turf');
const { fetchCached } = require('../lib/helper.js');
const { coords2Feature } = require('../lib/geohelper.js');
const polygonClipping = require('polygon-clipping');
const config = require('../config.js');

const BBOX = [8.6, 47.0, 14.2, 50.8];
const PIXELSIZE = 4096;
const MAXPREVIEWSIZE = 100; // in kilometers

/*
	- Datenquelle wird gescraped: https://risby.bayern.de/RisGate/servlet/Regionalplanung
	- leider nur als WMS verfügbar, mit Images von dünn-gestreiften Flächen 🤦
	- daher werden die Images als SVG runtergeladen, wo die gestreiften Flächen
	  als schräge Linien definiert sind, die mit einem clipping path beschnitten werden
	- d.h. es gibt zwar keinen Download der Geo-Vektordaten,
	  aber dafür SVG-Vektordaten der Flächen als Clipping-Path. 🤦x2
*/

start()

async function start() {
	await downloadLayer('R15TRW_XF', 'bayer_wind_vorrang');
	await downloadLayer('R15TBW_XF', 'bayer_wind_vorbehalt');
}

async function downloadLayer(layerId, slug) {
	console.log('download index', slug)

	const cx = (BBOX[0] + BBOX[2]) / 2;
	const cy = (BBOX[1] + BBOX[3]) / 2;
	const xCount = Math.ceil(turf.distance([BBOX[0], cy], [BBOX[2], cy]) / MAXPREVIEWSIZE);
	const yCount = Math.ceil(turf.distance([cx, BBOX[1]], [cx, BBOX[3]]) / MAXPREVIEWSIZE);
	const bboxStepX = (BBOX[2] - BBOX[0]) / xCount;
	const bboxStepY = (BBOX[3] - BBOX[1]) / yCount;
	const bboxSize = 0.5 * Math.max(bboxStepX, bboxStepY);

	let features = new Map();
	for (let xi = 0; xi < xCount; xi++) {
		for (let yi = 0; yi < yCount; yi++) {
			let cx = BBOX[0] + (xi + 0.5) * bboxStepX;
			let cy = BBOX[1] + (yi + 0.5) * bboxStepY;
			(await getPolygons(cx, cy, bboxSize, layerId)).forEach(feature => {
				features.set(feature.c.join(','), feature);
			});
		}
	}

	console.log('check features')
	features = Array.from(features.values());

	// check if any polygon is duplicated
	for (let i = 0; i < features.length; i++) {
		for (let j = i + 1; j < features.length; j++) {
			let f1 = features[i];
			let f2 = features[j];
			let d = turf.distance(f1.c, f2.c);
			if (d < 0.1) {
				console.log(f1.c);
				console.log(f2.c);

				console.log(JSON.stringify(f1));
				console.log(JSON.stringify(f2));
				console.log(d);
				throw Error('duplicated polygon');
			}
		}
	}

	console.log('download single features')
	// increase resolution
	for (let i = 0; i < features.length; i++) {
		process.stderr.write('\rimprove features: ' + (100 * i / (features.length + 1)).toFixed(1) + '%');
		let f = features[i];
		let polygons = await getPolygons(f.c[0], f.c[1], Math.max(0.05, f.r), layerId);
		//console.dir({f,polygons}, {depth:4});
		polygons = polygons.filter(p => f.c.every((v, i) => Math.abs(v - p.c[i]) < 0.0003));
		if (polygons.length !== 1) throw Error();
		features[i] = polygons[0];
	}

	fs.writeFileSync(
		config.getFilename.andereGebiete(slug + '.geojson'),
		JSON.stringify(turf.featureCollection(features))
	)

	console.log('\nFinished');
}

async function getPolygons(cx, cy, r, layerId) {
	const bboxInner = [cx - 1.01 * r, cy - 1.01 * r, cx + 1.01 * r, cy + 1.01 * r];
	const bboxOuter = [cx - 1.50 * r, cy - 1.50 * r, cx + 1.50 * r, cy + 1.50 * r].map(v => Math.round(v * 1000) / 1000);

	const url = 'https://risby.bayern.de/RisGate/servlet/Regionalplanung?' + [
		'REQUEST=GetMap',
		'VERSION=1.3.0',
		'LAYERS=' + layerId,
		'CRS=CRS:84',
		'BBOX=' + bboxOuter.join(','),
		'STYLES=',
		'WIDTH=' + PIXELSIZE,
		'HEIGHT=' + PIXELSIZE,
		'FORMAT=image/svg+xml',
	].join('&');

	const filename = config.getFilename.otherCache(layerId + '-' + bboxOuter.join(',') + '.svg');

	let response = await fetchCached(filename, url);
	response = response.toString()
	response = response.matchAll(/<clipPath id=\".*?\">\r\n(.*?)\r\n<\/clipPath>/g);

	const features = new Map();
	response = Array.from(response).map(r => {
		let path = r[1];
		const match = path.match(/^<path d=\"([ MLZ\.0-9]*?)\" \/>$/);
		if (!match) throw Error(path);
		path = match[1];
		path = path.trim().split(' ');
		let ring, polygon = [];
		for (let i = 0; i < path.length; i++) {
			const command = path[i][0];
			switch (command) {
				case 'M':
					polygon.push(ring = []);
				case 'L':
					const x = parseFloat(path[i].slice(1));
					const y = parseFloat(path[i + 1]);
					ring.push([
						x / PIXELSIZE * (bboxOuter[2] - bboxOuter[0]) + bboxOuter[0],
						y / PIXELSIZE * (bboxOuter[1] - bboxOuter[3]) + bboxOuter[3],
					].map(v => Math.round(v * 1e5) / 1e5));
					i++;
					break;
				case 'Z':
					ring.push(ring[0]);
					break;
				default: throw Error('unknown command "' + command + '"');
			}
		}

		polygon = polygon.filter(r => r.length >= 4);
		if (polygon.length === 0) return;
		polygon = polygonClipping.union(polygon.map(p => ([p])));

		const feature = coords2Feature(polygon);
		const center = turf.center(feature).geometry.coordinates;

		if (center[0] < bboxInner[0]) return;
		if (center[1] < bboxInner[1]) return;
		if (center[0] > bboxInner[2]) return;
		if (center[1] > bboxInner[3]) return;

		let bbox = feature.bbox = turf.bbox(feature);
		feature.c = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2].map(v => Math.round(v * 1e4) / 1e4);
		feature.r = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]);

		let key = JSON.stringify(bbox);
		features.set(key, feature);
	});
	return Array.from(features.values());
}
