#!/usr/bin/env node
'use strict'



const config = require('../config.js');
const { processAlkis } = require('../lib/geohelper.js');


start()

async function start() {
	let lookup = initLookup();

	await processAlkis({
		slug: 'vegetation',
		ruleTypes: 'wald'.split(','),
		cbFeature: feature => {
			feature.properties.type = lookup.get(feature.properties.klasse);
			if (feature.properties.type === undefined) throw Error(`Klasse "${feature.properties.klasse}" unbekannt`);
			return feature.properties.type;
		}
	})

	let types = 'wald'.split(',');
	for (let type of types) {
		await processAlkis({
			slug: 'vegetation',
			slugOut: type,
			ruleTypes: [type],
			filenameIn: config.getFilename.andereGebiete(type + '.geojsonl'),
			cbFeature: feature => {
				feature.properties.type = type;
				return true;
			}
		})
	}
}



function initLookup() {
	let lookup = new Map();
	[
		'Baumbestand, Laub- und Nadelholz',
		'Baumbestand, Laubholz',
		'Baumbestand, Nadelholz',
		'Baumschule',
		'Bewuchs, Gehölz',
		'Eis, Firn',
		'Fels',
		'Gartenland',
		'Gebüsch',
		'Gehölz',
		'Geröll',
		'Gras',
		'Grünland',
		'Hecke',
		'Heide',
		'Hopfen',
		'Landwirtschaft',
		'Laub- und Nadelholz',
		'Laubbaum',
		'Laubholz',
		'Moor',
		'Nadelholz',
		'Obstplantage',
		'Röhricht, Schilf',
		'Sand',
		'Schneise',
		'Steine, Schotter',
		'Streuobst',
		'Streuobstacker',
		'Streuobstwiese',
		'Sumpf',
		'Vegetationslose Fläche',
		'Vegetationsmerkmal',
		'Wald',
		'Weingarten',
	].forEach(label => lookup.set(label, false))
	lookup.set('Wald', 'wald');
	return lookup
}
