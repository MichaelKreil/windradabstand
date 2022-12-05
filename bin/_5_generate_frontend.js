#!/usr/bin/env node
'use strict'



const fs = require('fs');
const config = require('../config.js');
const { gzip, brotli } = require('../lib/helper.js');
require('big-data-tools');

const KEYS = {
	'Bundesland': false,
	'bundeslandName': false,
	'DatumLetzteAktualisierung': false,
	'DatumWiederaufnahmeBetrieb': false,
	'EegMaStRNummer': false,
	'EinheitMastrNummer': false,
	'Energietraeger': false,
	'Gemeinde': false,
	'Gemeindeschluessel': false,
	'GenMastrNummer': false,
	'GeplantesInbetriebnahmedatum': false,
	'Land': false,
	'Landkreis': false,
	'LokationMaStRNummer': false,
	'NameStromerzeugungseinheit': false,
	'Nettonennleistung': false,
	'Postleitzahl': false,
	'Registrierungsdatum': true,

	'index': false,

	'groupIndex': true,

	'Laengengrad': true,
	'Breitengrad': true,
	'Bruttoleistung': true,
	'bundeslandAGS': false,
	'hoehe': true,
	'Inbetriebnahmedatum': true,
	'DatumBeginnVoruebergehendeStilllegung': false,
	'DatumEndgueltigeStilllegung': false,
	'Nabenhoehe': true,
	'Rotordurchmesser': true,
};



start()

async function start() {
	await generateWindEntries()
	console.log('Finished')
}



async function generateWindEntries() {
	console.log('generate wind entries')
	let windEntries = JSON.parse(fs.readFileSync(config.getFilename.wind('wind.json')));

	windEntries = windEntries.map(w => {
		let result = {};
		Object.keys(w).forEach(key => {
			if (KEYS[key] === false) return;
			if (KEYS[key] === undefined) throw Error('unknown key ' + key);
			if (KEYS[key] !== true) throw Error('problem at ' + key);;
			result[key] = w[key];
		})
		return result;
	})

	// convert from "array of objects" to "object of arrays"
	let result = {};
	windEntries.forEach((w, i) => {
		Object.entries(w).forEach(([key, val]) => {
			if (!result[key]) result[key] = [];
			result[key][i] = val;
		})
	})

	Object.entries(result).forEach(([key, values]) => {
		switch (key) {
			case 'Breitengrad':
			case 'Laengengrad':
				values = diffEncoding(values.map(v => Math.round(v * 1e5)));
				values = runLengthEncoding(values);
				break;
			case 'Inbetriebnahmedatum':
			case 'Registrierungsdatum':
				values = diffEncoding(values.map(v => {
					if (v === null) return v;
					v = v.split('-').map(s => parseInt(s, 10));
					return v[2] + 32 * v[1] + 512 * v[2];
				}));
				values = runLengthEncoding(values);
				break;
			case 'Bruttoleistung':
			case 'Nabenhoehe':
			case 'Rotordurchmesser':
			case 'bundeslandAGS':
			case 'hoehe':
			case 'groupIndex':
				values = runLengthEncoding(values);
				break;
			default:
				if (key.startsWith('min_')) {
					values = runLengthEncoding(values);
					break;
				}
				console.log('dont know what to do with', key);
				console.log(values);
		}

		result[key] = values;
		//console.log('\t',zlib.gzipSync(JSON.stringify(values)).length, key)
	})
	result = JSON.stringify(result);
	await writeWebData('wind.json', result);
}

async function writeWebData(filename, buffer) {
	fs.writeFileSync(config.getFilename.webData(filename, buffer), buffer);
	fs.writeFileSync(config.getFilename.webData(filename + '.gz', buffer), await gzip(buffer));
	fs.writeFileSync(config.getFilename.webData(filename + '.br', buffer), await brotli(buffer));
}


function runLengthEncoding(array) {
	let result = [], lastValue = 'zwetschenkuchen kommt bestimmt nicht vor';
	for (let i = 0; i < array.length; i++) {
		let value = array[i];
		if (value === lastValue) {
			let end = result.length - 1;
			if (Array.isArray(result[end])) {
				result[end][1]++;
			} else {
				result[end] = [result[end], 2];
			}
		} else {
			result.push(value);
			lastValue = value;
		}
	}
	return result;
}

function diffEncoding(array) {
	for (let i = array.length - 1; i > 0; i--) {
		if (array[i] === null) continue;
		if (array[i - 1] === null) continue;
		array[i] -= array[i - 1];
	}
	return array;
}