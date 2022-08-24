#!/usr/bin/env node
'use strict'



const config = require('../config.js');
const { processAlkis } = require('../lib/geohelper.js');


start()

async function start() {
	let lookup = initLookup();

	await processAlkis({
		slug: 'grenze_flaeche',
		ruleTypes: 'naturdenkmal'.split(','),
		cbFeature: feature => {
			feature.properties.type = lookup.get(feature.properties.klasse);
			if (feature.properties.type === undefined) throw Error(`Klasse "${feature.properties.klasse}" unbekannt`);
			return feature.properties.type;
		}
	})

	let types = 'biosphaere,ffhabitat,landschaftsschutz,nationalpark,naturpark,naturschutz,vogelschutz'.split(',');
	for (let type of types) {
		await processAlkis({
			slug: 'grenze_flaeche',
			slugOut: type,
			ruleTypes: [type],
			filenameIn: config.getFilename.andereGebiete(type + '.geojsonl'),
			cbFeature: feature => {
				feature.properties.type = type;
				return feature.properties.type = type;
			}
		})
	}
}



function initLookup() {
	let lookup = new Map();
	[
		'Biosphärenreservat',
		'Flora-Fauna-Habitat-Gebiet',
		'Landschaftsschutzgebiet',
		'Naturpark',
		'Nationalpark',
		'Naturschutzgebiet',
		'Vogelschutzgebiet',
		'Geschützter Landschaftsbestandteil',
		'Truppenübungsplatz, Standortübungsplatz',
		'Wasserschutzgebiet',
	].forEach(label => lookup.set(label, false))
	lookup.set('Naturdenkmal', 'naturdenkmal');
	return lookup
}
