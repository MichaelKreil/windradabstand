#!/usr/bin/env node
'use strict'



const { processAlkis } = require('../lib/geohelper.js');



let lookup = initLookup();

processAlkis({
	slug:'grenze_flaeche',
	ruleTypes:'biosphaere,ffhabitat,landschaftsschutz,naturpark,nationalpark,naturschutz,vogelschutz,naturdenkmal'.split(','),
	cbFeature:feature => {
		feature.properties.type = lookup.get(feature.properties.klasse);
		if (feature.properties.type === undefined) throw Error(`Klasse "${feature.properties.klasse}" unbekannt`);
		return feature.properties.type;
	}
})

function initLookup() {
	let lookup = new Map();
	lookup.set('Biosphärenreservat', 'biosphaere');
	lookup.set('Flora-Fauna-Habitat-Gebiet', 'ffhabitat');
	lookup.set('Landschaftsschutzgebiet', 'landschaftsschutz');
	lookup.set('Naturpark', 'naturpark');
	lookup.set('Nationalpark', 'nationalpark');
	lookup.set('Naturschutzgebiet', 'naturschutz');
	lookup.set('Vogelschutzgebiet', 'vogelschutz');
	lookup.set('Naturdenkmal', 'naturdenkmal');
	[
		'Geschützter Landschaftsbestandteil',
		'Truppenübungsplatz, Standortübungsplatz',
		'Wasserschutzgebiet',
	].forEach(label => lookup.set(label, false))
	return lookup
}
