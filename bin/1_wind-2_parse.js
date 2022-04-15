#!/usr/bin/node
'use strict'

const fs = require('fs');
const turf = require('@turf/turf');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const config = require('../config.js');

const tiny = 1e-5; // tiny distance, e.g. 1e-5 = 1m

start()

async function start() {
	const filenameWind = config.getFilename.wind('wind.json')

	// calculate wind data

	let wind = parseWindData();
	fs.writeFileSync(filenameWind, JSON.stringify(wind));

	// calculate height statistics
	let hoehen = wind.map(w => w.hoehe);
	hoehen.sort((a,b) => a-b);
	let n = 100;
	for (let i = 0; i <= n; i++) {
		console.log(hoehen[Math.round((hoehen.length-1)*i/n)])
	}
}

function parseWindData() {
	let zip = new AdmZip(config.getFilename.wind('marktstammdatenregister.zip'));
	let zipEntries = zip.getEntries();

	console.log('load Bundesländer')
	let findBundesland = BundeslandFinder();

	console.log('load Katalogwerte')
	let translateKeys = KeyTranslator(zipEntries.find(e => e.entryName === 'Katalogwerte.xml'))

	console.log('load zip entries')
	let windEntries = [];
	for (let zipEntry of zipEntries) {
		if (!zipEntry.entryName.startsWith('EinheitenWind')) continue;
		windEntries = windEntries.concat(loadZipEntry(zipEntry));
	}

	console.log('parse xml entries');
	let wind = [];
	windEntries = windEntries.filter((windEntry, i) => {
		if (i % 20 === 0) process.stdout.write('\r   '+(100*i/windEntries.length).toFixed(1)+'%');
		translateKeys(windEntry);

		windEntry.bundesland = findBundesland(windEntry.Laengengrad, windEntry.Breitengrad).properties;
		if (!windEntry.bundesland) return false;

		windEntry.hoehe = (windEntry.Nabenhoehe + windEntry.Rotordurchmesser/2);
		if (!windEntry.hoehe) return false;

		return true;
	})
	console.log();

	return windEntries;
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
			case 'value':  keys.set(line[0], true); break;
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
				if (!v) console.log(`obj.${key} = `+JSON.stringify(obj[key]))
				obj[key] = v;
				return
			}

			console.log('unknown', key, obj[key])
			return;
		})
		return obj;
	}
}

function BundeslandFinder() {
	let gridScale = 10;
	let grid = new Map();

	let bundeslaender = fs.readFileSync(config.getFilename.static('bundeslaender.geojson'));
	bundeslaender = JSON.parse(bundeslaender);
	bundeslaender.features.forEach(bundesland => {
		let name;
		switch (bundesland.properties.AGS) {
			case '01': name = 'Schleswig-Holstein'; break;
			case '02': name = 'Hamburg'; break;
			case '03': name = 'Niedersachsen'; break;
			case '04': name = 'Bremen'; break;
			case '05': name = 'Nordrhein-Westfalen'; break;
			case '06': name = 'Hessen'; break;
			case '07': name = 'Rheinland-Pfalz'; break;
			case '08': name = 'Baden-Württemberg'; break;
			case '09': name = 'Bayern'; break;
			case '10': name = 'Saarland'; break;
			case '11': name = 'Berlin'; break;
			case '12': name = 'Brandenburg'; break;
			case '13': name = 'Mecklenburg-Vorpommern'; break;
			case '14': name = 'Sachsen'; break;
			case '15': name = 'Sachsen-Anhalt'; break;
			case '16': name = 'Thüringen'; break;
			default: return
		}
		bundesland.properties.NAME = name;
	})

	let features = turf.flatten(bundeslaender).features;
	features.forEach((polygon,i) => {
		process.stdout.write('\r   '+(100*i/features.length).toFixed(1)+'%');

		let bbox = turf.bbox(polygon);

		let x0 = Math.floor(bbox[0]*gridScale);
		let y0 = Math.floor(bbox[1]*gridScale);
		let x1 = Math.floor(bbox[2]*gridScale);
		let y1 = Math.floor(bbox[3]*gridScale);

		for (let y = y0; y <= y1; y++) {
			let row = turf.bboxPolygon([x0/gridScale-tiny, y/gridScale-tiny, x1/gridScale+tiny, (y+1)/gridScale+tiny])
			let rowPolygon = turf.intersect(row, polygon);
			if (!rowPolygon) continue;

			for (let x = x0; x <= x1; x++) {
				let col = turf.bboxPolygon([x/gridScale-tiny, y/gridScale-tiny, (x+1)/gridScale+tiny, (y+1)/gridScale+tiny])
				let cellPolygon = turf.intersect(col, rowPolygon);
				if (!cellPolygon) continue;

				cellPolygon.properties = polygon.properties;
				let key = x+'_'+y;
				if (!grid.has(key)) grid.set(key, []);
				grid.get(key).push(polygon);
			}
		}
	})

	console.log();

	return (lng,lat) => {
		let point = [lng,lat]
		let x = Math.floor(lng*gridScale);
		let y = Math.floor(lat*gridScale);
		let key = x+'_'+y;
		if (!grid.has(key)) return false;
		let result = grid.get(key).filter(polygon => turf.booleanPointInPolygon(point, polygon));
		if (result.length === 1) return result[0];
		if (result.length === 0) return false;
		throw Error('polygons overlapping?');
	}
}
