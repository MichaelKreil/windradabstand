'use strict'



const fs = require('fs');
const AdmZip = require('adm-zip');
const { XMLParser } = require('fast-xml-parser');
const config = require('../config.js');



start()

async function start() {
	let zip = new AdmZip(config.getFile.src('Gesamtdatenexport_20220330__f3b8b76f16b2426fafb59f8c747a8406.zip'));
	let zipEntries = zip.getEntries();

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

	let func = obj => {
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
				if (!v) {
					console.log(`obj.${key} = `+JSON.stringify(obj[key]))
					func.errors = true;
				}
				obj[key] = v;
				return
			}

			func.errors = true;
			console.log('unknown', key, obj[key])
			return;
		})
		return obj;
	}

	return func;
}
