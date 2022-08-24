#!/usr/bin/env node
'use strict'



const { processAlkis } = require('../lib/geohelper.js');



let getType = initLookup();

processAlkis({
	slug: 'versorgungslinie',
	ruleTypes: 'freileitung'.split(','),
	cbFeature: feature => {
		let type = getType.get(feature.properties.klasse);
		if (type === undefined) throw Error(`Klasse "${feature.properties.klasse}" unbekannt`);
		return type;
	}
})

function initLookup() {
	let lookup = new Map();
	lookup.set('Freileitung', 'freileitung')
	lookup.set('Förderband, Bandstraße', false)
	lookup.set('Rohrleitung, Pipeline', false)
	return lookup
}
