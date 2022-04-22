#!/usr/bin/node
'use strict'



const { processAlkis } = require('../lib/geohelper.js');



let getType = initLookup();

processAlkis(
	'versorgungslinie',
	'freileitung'.split(','),
	feature => {
		feature.properties.type = getType.get(feature.properties.klasse);
		if (feature.properties.type === undefined) throw Error();
		return feature.properties.type;
	}
)

function initLookup() {
	let lookup = new Map();
	lookup.set('Freileitung', 'freileitung')
	lookup.set('Förderband, Bandstraße', false)
	lookup.set('Rohrleitung, Pipeline', false)
	return lookup
}
