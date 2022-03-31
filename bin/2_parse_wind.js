'use strict'



const fs = require('fs');
const turf = require('@turf/turf');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const config = require('../config.js');



start()

async function start() {
	let zip = new AdmZip(config.getFile.src('Gesamtdatenexport_20220330__f3b8b76f16b2426fafb59f8c747a8406.zip'));
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
	windEntries.forEach((windEntry, i) => {
		if (i % 100 === 0) process.stdout.write('\r'+(100*i/windEntries.length).toFixed(1)+'%');
		translateKeys(windEntry);

		windEntry.Hoehe = (windEntry.Nabenhoehe + windEntry.Rotordurchmesser/2);
		windEntry.Bundesland = findBundesland(windEntry.Laengengrad, windEntry.Breitengrad).properties;
		if (!windEntry.Bundesland) return;
		windEntry.MinDistanz = getMinDistance(windEntry.Bundesland.AGS, windEntry.Hoehe)

		wind.push({
			type: 'Feature',
			geometry: { type:'Point', coordinates:[windEntry.Laengengrad, windEntry.Breitengrad]},
			properties: windEntry,
		});
	})
	console.log();

	fs.writeFileSync(config.getFile.data('wind.geojson'), JSON.stringify(wind));
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

	let list = fs.readFileSync(config.getFile.static('bnetza_keys.tsv'), 'utf8').split('\n');
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

function getMinDistance(ags, hoehe) {
	switch (ags) {
		case '01': /* Schleswig-Holstein */ return false;
		case '02': /* Hamburg */ return 300;
		case '03': /* Niedersachsen */ return 400;
		case '04': /* Bremen */ return 450;
		case '05': /* Nordrhein-Westfalen */ return 1000;
		case '06': /* Hessen */ return 1000;
		case '07': /* Rheinland-Pfalz */ return 500;
		case '08': /* Baden-Württemberg */ return false;
		case '09': /* Bayern */ return 10*hoehe;
		case '10': /* Saarland */ return false;
		case '11': /* Berlin */ return false;
		case '12': /* Brandenburg */ return 1000;
		case '13': /* Mecklenburg-Vorpommern */ return 800;
		case '14': /* Sachsen */ return false;
		case '15': /* Sachsen-Anhalt */ return false;
		case '16': /* Thüringen */ return false;
		default:
			throw Error('unknown ags '+ags)
	}
}

function BundeslandFinder() {
	let gridScale = 10;
	let grid = new Map();

	let bundeslaender = fs.readFileSync(config.getFile.src('VG250_Bundeslaender.geojson'));
	bundeslaender = JSON.parse(bundeslaender).features;
	bundeslaender.forEach(bundesland => {
		turf.flatten(bundesland).features.forEach(polygon => {
			polygon.bbox = turf.bbox(polygon);
			let x0 = Math.floor(polygon.bbox[0]*gridScale);
			let x1 = Math.ceil( polygon.bbox[2]*gridScale);
			let y0 = Math.floor(polygon.bbox[1]*gridScale);
			let y1 = Math.ceil( polygon.bbox[3]*gridScale);
			for (let y = y0; y < y1; y++) {
				for (let x = x0; x < x1; x++) {
					let cellPolygon = turf.bboxPolygon([x0/gridScale, y0/gridScale, x1/gridScale, y1/gridScale])
					if (!turf.booleanIntersects(cellPolygon, polygon)) continue;
					let key = x+'_'+y;
					if (!grid.has(key)) grid.set(key, []);
					grid.get(key).push(polygon);
				}
			}
		})
	})
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
