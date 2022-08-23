#!/usr/bin/env node
'use strict'



const { processAlkis } = require('../lib/geohelper.js');



let getType = initLookup();

processAlkis({
	slug: 'vegetationflaeche',
	ruleTypes: 'wald'.split(','),
	cbFeature: feature => {
		feature.properties.type = getType.get(feature.properties.klasse);
		if (feature.properties.type === undefined) throw Error(`Klasse "${feature.properties.klasse}" unbekannt`);
		return feature.properties.type;
	}
})

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
