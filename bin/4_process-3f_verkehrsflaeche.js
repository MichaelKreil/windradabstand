#!/usr/bin/env node
'use strict'



const { processAlkis } = require('../lib/geohelper.js');



processAlkis({
	slug: 'verkehrsflaeche',
	ruleTypes: 'verkehrsflaeche,militaerisch,flugplaetze'.split(','),
	cbFeature: feature => {
		let types = new Set();
		types.add('verkehrsflaeche');

		switch (feature.properties.nutzung) {
			case 'Militärisch':
			case 'Teils zivil, teils militärisch':
				types.add('militaerisch');
				break;
			case 'Zivil':
			case undefined:
				break;
			default:
				throw Error(feature.properties.nutzung)
		}

		switch (feature.properties.klasse) {
			case 'Flughafen':
			case 'Hubschrauberflugplatz':
			case 'Internationaler Flughafen':
			case 'Regionalflughafen':
			case 'Startbahn, Landebahn':
			case 'Verkehrslandeplatz':
			case 'Segelfluggelände':
			case 'Flugverkehr':
				types.add('flugplaetze');
				break;
			case 'Bahnhof':
			case 'Bahnverkehr':
			case 'Festplatz':
			case 'Fußgängerzone':
			case 'Hafenanlage (Landfläche)':
			case 'Haltepunkt':
			case 'Haltestelle':
			case 'Landeplatz, Sonderlandeplatz':
			case 'Parkplatz':
			case 'Platz':
			case 'Rastplatz':
			case 'Raststätte':
			case 'Schiffsverkehr':
			case 'Schleuse (Landfläche)':
			case 'Strassenverkehr':
			case 'Verkehrsbegleitfläche Straße':
			case 'Vorfeld':
			case 'Zurollbahn, Taxiway':

				break
			default:
				throw Error(feature.properties.klasse)
		}

		types = Array.from(types.values());
		if (types.length === 0) return;
		return types;
	}
})
