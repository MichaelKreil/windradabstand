#!/usr/bin/env node
'use strict'



const { processAlkis } = require('../lib/geohelper.js');



let getType = initLookup();

processAlkis({
	slug: 'siedlungsflaeche',
	ruleTypes: 'wohngebiet,camping,erholung,gewerbe'.split(','),
	generateGPKG: true,
	cbFeature: feature => {
		let type = getType.get(feature.properties.klasse);
		if (type === undefined) throw Error(`Klasse "${feature.properties.klasse}" unbekannt`);
		return type;
	}
})

function initLookup() {
	let lookup = new Map();
	lookup.set('Siedlung', 'wohngebiet');
	lookup.set('Campingplatz', 'camping');
	lookup.set('Sport-, Freizeit-, und Erholungsfläche', 'erholung');
	lookup.set('Freizeitanlage', 'erholung');
	lookup.set('Freizeitpark', 'erholung');
	lookup.set('Industrie- und Gewerbefläche', 'gewerbe');
	[
		'Abfallbehandlungsanlage',
		'Ausstellung, Messe',
		'Autokino, Freilichtkino',
		'Bergbau',
		'Botanischer Garten',
		'Deponie (oberirdisch)',
		'Deponie (untertägig)',
		'Entsorgung',
		'Förderanlage',
		'Freilichtmuseum',
		'Freilichttheater',
		'Friedhof',
		'Gärtnerei',
		'Golfplatz',
		'Grünanlage',
		'Halde',
		'Handel und Dienstleistung',
		'Handel',
		'Heizwerk',
		'Kläranlage, Klärwerk',
		'Kleingarten',
		'Kraftwerk',
		'Modellflugplatz',
		'Park',
		'Raffinerie',
		'Safaripark, Wildpark',
		'Schwimmbad, Freibad',
		'Sportanlage',
		'Tagebau, Grube, Steinbruch',
		'Umspannstation',
		'Vergnügung',
		'Versorgungsanlage',
		'Wasserwerk',
		'Werft',
		'Wochenend- und Ferienhausfläche',
		'Zoo',
	].forEach(label => lookup.set(label, false))
	return lookup
}
