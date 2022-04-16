#!/usr/bin/node
'use strict'

const fs = require('fs');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const config = require('../config.js');
const { Progress } = require('../lib/helper.js');
const { BundeslandFinder } = require('../lib/geohelper.js');

start()

async function start() {
	const filenameWind = config.getFilename.wind('wind.json')

	// calculate wind data

	let wind = parseWindData();
	fs.writeFileSync(filenameWind, JSON.stringify(wind));

	console.log('\nheight distribution:');
	// calculate height statistics
	let hoehen = wind.map(w => w.hoehe);
	hoehen.sort((a,b) => a-b);
	let numbers = [...Array(100).keys()];
	console.log(numbers.map(i => hoehen[Math.round((hoehen.length-1)*(i+0.5)/100)]).join(','))
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
	let progress = Progress(windEntries.length);
	windEntries = windEntries.filter((windEntry, i) => {
		if (i % 20 === 0) progress(i);
		translateKeys(windEntry);

		windEntry.bundesland = findBundesland(windEntry.Laengengrad, windEntry.Breitengrad).properties;
		if (!windEntry.bundesland) return false;

		windEntry.hoehe = Math.round((windEntry.Nabenhoehe + windEntry.Rotordurchmesser/2)*100)/100;
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
