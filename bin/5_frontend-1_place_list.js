#!/usr/bin/env node
"use strict";

const fs = require("fs");
const config = require("../config.js");
const zlib = require("zlib");
const miss = require("mississippi2");
const { Progress } = require("../lib/helper.js");

let places = new Map();
let cache = new Map();
let filename = config.getFilename.alkisGeo("adresse.geojsonl.gz");
let pos = 0;
let progress = new Progress(fs.statSync(filename).size);


let getLandName = {
	BW: ['BW', 'Baden-Württemberg'],
	BY: ['Bayern', 'Bayern'],
	BE: ['Berlin', 'Berlin'],
	BB: ['Brandenburg', 'Brandenburg'],
	HB: ['Bremen', 'Bremen'],
	HH: ['Hamburg', 'Hamburg'],
	HE: ['Hessen', 'Hessen'],
	MV: ['MV', 'Mecklenburg-Vorpommern'],
	NI: ['Niedersachsen', 'Niedersachsen'],
	NW: ['NRW', 'Nordrhein-Westfalen'],
	RP: ['RP', 'Rheinland-Pfalz'],
	SL: ['Saarland', 'Saarland'],
	SN: ['Sachsen', 'Sachsen'],
	ST: ['Sachsen-Anhalt', 'Sachsen-Anhalt'],
	SH: ['SH', 'Schleswig-Holstein'],
	TH: ['Thüringen', 'Thüringen'],
}

miss.pipe([
	fs.createReadStream(filename),
	miss.spy(chunk => {
		pos += chunk.length;
		progress(pos);
	}),
	zlib.createGunzip(),
	miss.split('\n'),
	miss.to(
		(chunk, enc, cb) => {
			chunk = JSON.parse(chunk);
			let prop = chunk.properties;
			let point = chunk.geometry.coordinates;

			let [landShort, landLong] = getLandName[prop.land];
			if (!landShort) throw Error();

			if (prop.ortsteil) {
				//add([chunk.strasse, chunk.ortsteil, chunk.ort, landShort], point);
				add([prop.ortsteil, prop.ort, landShort], point);
			} else {
				//add([chunk.strasse, chunk.ort, landShort], point);
			}
			add([prop.ort, landShort], point);
			add([landLong], point);

			cb();

			function add(list, point) {
				let place;
				let key = list.join('_');
				if (cache.has(key)) {
					place = cache.get(key)
				} else {
					let last = '';

					list = list.filter(e => {
						if (e === last) return false;
						last = e;
						return true;
					});

					let name = list.shift();
					if (list.length > 0) name += ' (' + list.join(', ') + ')';

					if (!places.has(name)) {
						places.set(name, {
							name,
							count: 1,
							bbox: [point[0], point[1], point[0], point[1]],
						});
						cache.set(key, places.get(name));
						return;
					} else {
						place = places.get(name);
						cache.set(key, place);
					}
				}
				place.count++;
				if (place.bbox[0] > point[0]) place.bbox[0] = point[0];
				if (place.bbox[1] > point[1]) place.bbox[1] = point[1];
				if (place.bbox[2] < point[0]) place.bbox[2] = point[0];
				if (place.bbox[3] < point[1]) place.bbox[3] = point[1];
			}
		},
		cb => {
			places = Array.from(places.values());

			// mindestens 100 Adressen
			places = places.filter(p => p.count > 100);

			places = places.map(p => [p.name, p.count, p.bbox.map(v => Math.round(v * 1000))]);
			places = JSON.stringify(places);
			
			fs.writeFileSync(config.getFilename.web('places.json'), places);
		}
	),
]);
