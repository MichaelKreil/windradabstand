#!/usr/bin/env node
'use strict'



const { processAlkis } = require('../lib/geohelper.js');



processAlkis({
	slug: 'gewaesserflaeche',
	ruleTypes: 'gewaesser,gewaesser_1ha'.split(','),
	cbFeature: feature => {
		let types = new Set();
		types.add('gewaesser');

		switch (feature.properties.klasse) {
			case 'Hafenbecken':
			case 'Meer':
			case 'See':
				if (feature.properties.flaeche > 100*100) types.add('gewaesser_1ha');
				break;

			case 'Sandbank':
			case 'Stromschnelle':
			case 'Wasserfall':
			case 'Watt':
			case 'Fliessgewässer':
			case 'Kanal':
			case 'Priel':
			case 'Quelle':

				break
			default:
				throw Error(feature.properties.klasse)
		}

		types = Array.from(types.values());
		if (types.length === 0) return;

		if (feature.properties.zweitname && Array.isArray(feature.properties.zweitname)) {
			feature.properties.zweitname = feature.properties.zweitname.join('|')
		}

		return types;
	}
})
