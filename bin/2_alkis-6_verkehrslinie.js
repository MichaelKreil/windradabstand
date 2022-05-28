#!/usr/bin/node
'use strict'



const { processAlkis } = require('../lib/geohelper.js');



let getType = initLookup();

processAlkis(
	'verkehrslinie',
	'autobahn,bundesstr,landesstr,kreisstr,bahnlinie'.split(','),
	feature => {
		feature.properties.type = getType.get(feature.properties.klasse);
		if (feature.properties.type === undefined) throw Error(`Klasse "${feature.properties.klasse}" unbekannt`);
		return feature.properties.type;
	}
)

function initLookup() {
	let lookup = new Map();
	lookup.set('Bundesautobahn', 'autobahn');
	lookup.set('Bundesstraße', 'bundesstr');
	lookup.set('Landesstraße, Staatsstraße', 'landesstr');
	lookup.set('Kreisstraße', 'kreisstr');
	lookup.set('Eisenbahn', 'bahnlinie');
	[
		'(Kletter-)Steig im Gebirge',
		'Attribut trifft nicht zu',
		'Autofährverkehr',
		'Bahn im Freizeitpark',
		'Fußweg',
		'Gemeindestraße',
		'Gleis',
		'Güterverkehr',
		'Hauptwirtschaftsweg',
		'Kabinenbahn, Umlaufseilbahn',
		'Linienverkehr',
		'Luftseilbahn, Großkabinenbahn',
		'Magnetschwebebahn',
		'Materialseilbahn',
		'Museumsbahn',
		'Personenfährverkehr',
		'Rad- und Fußweg',
		'Radweg',
		'Reitweg',
		'S-Bahn',
		'Schwebebahn',
		'Seilbahn, Bergbahn',
		'Sessellift',
		'Skaterstrecke',
		'Ski-, Schlepplift',
		'Sonstiges',
		'Stadtbahn',
		'Standseilbahn',
		'Startbahn, Landebahn',
		'Straßenbahn',
		'U-Bahn',
		'Weg, Pfad, Steig',
		'Wirtschaftsweg',
		'Zahnradbahn',
		'Zurollbahn, Taxiway',
	].forEach(label => lookup.set(label, false))
	return lookup
}
