#!/usr/bin/env node
'use strict'

const fs = require('fs');
const AdmZip = require('adm-zip');
const turf = require('@turf/turf');
const { XMLParser } = require('fast-xml-parser');
const config = require('../config.js');
const { Progress } = require('../lib/helper.js');
const { BundeslandFinder } = require('../lib/geohelper.js');

start()

async function start() {
	// prepare lookups
	console.log('load Bundesländer')
	let findBundesland = BundeslandFinder();

	// read zip file
	let zip = new AdmZip(config.getFilename.wind('marktstammdatenregister.zip'));
	let zipEntries = zip.getEntries();

	// lookup for values in the xml files
	console.log('load Katalogwerte')
	let translateKeys = KeyTranslator(zipEntries.find(e => e.entryName === 'Katalogwerte.xml'))

	console.log('load zip entries:')
	let windEntries = [];
	for (let zipEntry of zipEntries) {
		if (!zipEntry.entryName.startsWith('EinheitenWind')) continue;
		console.log('   - ' + zipEntry.entryName)
		windEntries = windEntries.concat(loadZipEntry(zipEntry));
	}

	console.log(`parse xml entries (${windEntries.length})`);
	let progress = Progress(windEntries.length);
	let debugGeoJSON = [];
	let map = new Map();
	windEntries.forEach((windEntry, i) => {
		if (i % 20 === 0) progress(i);
		translateKeys(windEntry);

		if (!windEntry.Laengengrad || !windEntry.Breitengrad) return;
		if (floatyEnough(windEntry.Laengengrad) && floatyEnough(windEntry.Breitengrad)) return;

		let bundesland = findBundesland(windEntry.Laengengrad, windEntry.Breitengrad)?.properties;

		// add to debug
		debugGeoJSON.push(turf.point([windEntry.Laengengrad, windEntry.Breitengrad], bundesland));

		if (!bundesland) return; // only in germany
		windEntry.bundeslandName = bundesland.name;
		windEntry.bundeslandAGS = parseInt(bundesland.ags, 10);

		windEntry.hoehe = Math.round((windEntry.Nabenhoehe + windEntry.Rotordurchmesser / 2) * 100) / 100;
		if (!windEntry.hoehe) return;

		let geoHash = windEntry.Laengengrad + ',' + windEntry.Breitengrad;
		if (map.has(geoHash) && (map.get(geoHash).Inbetriebnahmedatum > windEntry.Inbetriebnahmedatum)) return

		map.set(geoHash, windEntry);
	})
	console.log();
	windEntries = Array.from(map.values());

	console.log('TSP sort and add local group indexes');
	windEntries = await tspSort(windEntries);

	fs.writeFileSync(config.getFilename.wind('wind.debug.geojson'), JSON.stringify(turf.featureCollection(debugGeoJSON)));
	fs.writeFileSync(config.getFilename.wind('wind.json'), JSON.stringify(windEntries));

	// List heights
	//console.log(windEntries.map(w => [w.Nabenhoehe, w.Rotordurchmesser].join('\t')).join('\n'));
}

function loadZipEntry(zipEntry) {
	let data = zipEntry.getData();
	if (data[0] !== 255) throw Error();
	if (data[1] !== 254) throw Error();
	data = data.slice(2);
	data = data.toString('utf16le');
	data = (new XMLParser()).parse(data);
	data = data[Object.keys(data)[0]];
	data = data[Object.keys(data)[0]];

	return data;
}

function KeyTranslator(zipEntry) {
	let keys = new Map();

	let valueLookup = loadZipEntry(zipEntry);
	valueLookup = new Map(valueLookup.map(v => [v.Id, v.Wert]));

	let list = fs.readFileSync(config.getFilename.static('bnetza_keys.tsv'), 'utf8').split('\n');
	list.forEach(line => {
		line = line.split('\t');
		switch (line[1]) {
			case 'ignore': keys.set(line[0], false); break;
			case 'value': keys.set(line[0], true); break;
			case 'lookup': keys.set(line[0], valueLookup); break;
		}
	})

	return obj => {
		Object.keys(obj).forEach(key => {
			//console.log(key);
			let result = keys.get(key);

			if (result === false) {
				delete obj[key];
				return
			}

			if (result === true) return;

			if (result) {
				let v = result.get(obj[key]);
				if (!v) console.log(`obj.${key} = ` + JSON.stringify(obj[key]))
				obj[key] = v;
				return
			}

			console.log('unknown', key, obj[key])
			return;
		})
		return obj;
	}
}

function floatyEnough(value) {
	value = value * 100;
	value = Math.abs(Math.round(value) - value);
	return value < 1e-8
}

async function tspSort(entries) {
	const maxDInGroup = 0.01;

	const Delaunator = (await import('delaunator')).default;

	const c = Math.cos(51 * Math.PI / 180);
	const points0 = entries.map((entry, index) => {
		let point = [entry.Laengengrad * c, entry.Breitengrad];
		return Object.assign(point, { index, group: index, count: 0, entry, neighbours: [] });
	});

	let points = points0.slice();
	let segmentKeys = new Set();
	let step = 0;
	let groupsSaved = false;

	do {
		if (step++ > 100) throw Error();

		const { halfedges, hull, triangles } = Delaunator.from(points);

		let edges = [];
		for (let i = 0; i < halfedges.length; i++) {
			const j = halfedges[i];
			if (j > i) addEdge(triangles[i], triangles[j]);
		}
		for (let i = 1; i < hull.length; i++) addEdge(hull[i - 1], hull[i]);
		addEdge(hull[hull.length - 1], hull[0]);

		function addEdge(i0, i1) {
			if (i0 === i1) return;
			let p0 = points[i0];
			let p1 = points[i1];
			let dx = p0[0] - p1[0];
			let dy = p0[1] - p1[1];
			let d = dx * dx + dy * dy;
			edges.push({ p0, p1, d });
		}

		edges.sort((a, b) => a.d - b.d);

		let maxIndex = Math.round(edges.length / 5 + 2);

		edges.slice(0, maxIndex).forEach(edge => {
			let { p0, p1 } = edge;

			if (!groupsSaved && (edge.d > maxDInGroup)) {
				let knownGroups = new Map();
				points0.forEach(p => {
					let groupId = p.group, groupIndex;
					if (knownGroups.has(groupId)) {
						groupIndex = knownGroups.get(groupId);
					} else {
						groupIndex = knownGroups.size;
						knownGroups.set(groupId, groupIndex);
					}
					p.entry.groupIndex = groupIndex;
				})
				console.log('   found', knownGroups.size, 'groups');
				groupsSaved = true;
			}

			if (p0.count >= 2) return;
			if (p1.count >= 2) return;
			if (p0.group === p1.group) return;
			let i0 = p0.index;
			let i1 = p1.index;
			let key = (i0 < i1) ? i0 + '_' + i1 : i1 + '_' + i0;
			if (segmentKeys.has(key)) return;
			segmentKeys.add(key);

			p0.count++; p0.neighbours.push(p1);
			p1.count++; p1.neighbours.push(p0);

			let p2, newGroup = p0.group;
			while (true) {
				p1.group = newGroup;
				p2 = (p1.neighbours[0] === p0) ? p1.neighbours[1] : p1.neighbours[0];
				if (!p2) break;
				p0 = p1;
				p1 = p2;
			}
		})

		points = points.filter(p => p.count < 2);
	} while (points.length > 2)

	if (!groupsSaved) throw Error();

	let pStart = points[0];
	let pEnd = points[1];

	let p0 = pEnd, p1 = pStart, p2, path = [pStart];
	while (true) {
		p2 = (p1.neighbours[0] === p0) ? p1.neighbours[1] : p1.neighbours[0];
		path.push(p2);
		if (p2 === pEnd) break;
		p0 = p1;
		p1 = p2;
	}

	path = path.map(p => p.entry);
	path.forEach((e, i) => e.index = i);

	return path;
}
