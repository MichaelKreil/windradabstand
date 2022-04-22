#!/usr/bin/node
'use strict'



const { processAlkis } = require('../lib/geohelper.js');



let getType = initLookup();

processAlkis(
	'grenze_flaeche',
	'biosphaere,ffhabitat,landschaftsschutz,naturpark,nationalpark,naturschutz,vogelschutz,naturdenkmal'.split(','),
	feature => {
		feature.properties.type = getType.get(feature.properties.klasse);

		if (feature.properties.type === undefined) throw Error();
		return feature.properties.type;
	}
)

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
