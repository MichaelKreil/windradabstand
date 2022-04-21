#!/usr/bin/node
'use strict'


const fs = require('fs');
const child_process = require('child_process');
const Havel = require('havel');
const turf = require('@turf/turf');
const config = require('../config.js');
const { WindFinder } = require('../lib/geohelper.js');



start()

async function start() {
	console.log('load windfinder');
	let keys = 'biosphaere,ffhabitat,landschaftsschutz,naturpark,nationalpark,naturschutz,vogelschutz,naturdenkmal'.split(',');
	let windFinder = WindFinder('grenze_flaeche', (hoehe,rad,windEntry) => {
		let result = {};
		for (let key of keys) result[key] = 0;
		for (let rule of config.rules.values()) {
			for (let key of keys) {
				if (rule[key]) result[key] = Math.max(result[key], rule[key](hoehe,rad));
			}
		}
		return result;
	});

	console.log('process grenze_flaeche');
	let filenameGeoJSONSeq = config.getFilename.alkisResult('grenze_flaeche.geojsonl');
	let filenameGPKG = config.getFilename.alkisResult('grenze_flaeche.gpkg');

	Havel.pipeline()
		.readFile(config.getFilename.alkisGeo('grenze_flaeche.geojsonl'), { showProgress: true })
		.split()
		.map(feature => {
			if (feature.length === 0) return;
			feature = JSON.parse(feature);
			
			let type;
			switch (feature.properties.klasse) {
				case 'Biosphärenreservat':
					type = 'biosphaere'; break;
				case 'Flora-Fauna-Habitat-Gebiet':
					type = 'ffhabitat'; break;
				case 'Landschaftsschutzgebiet':
					type = 'landschaftsschutz'; break;
				case 'Naturpark':
					type = 'naturpark'; break;
				case 'Nationalpark':
					type = 'nationalpark'; break;
				case 'Naturschutzgebiet':
					type = 'naturschutz'; break;
				case 'Vogelschutzgebiet':
					type = 'vogelschutz'; break;
				case 'Naturdenkmal':
					type = 'naturdenkmal'; break;
				case 'Geschützter Landschaftsbestandteil':
				case 'Truppenübungsplatz, Standortübungsplatz':
				case 'Wasserschutzgebiet':
					return
				default: throw Error();
			}

			feature.properties.type = type;
			let windEntries = windFinder(feature);
			windEntries = windEntries.filter(w => w[0].properties.radius[type] >= w[1])
			windEntries.sort((a,b) => a[1] - b[1]);
			feature.properties.windEntr = windEntries.map(([w,d]) => w.properties._index).join(',');
			feature.properties.windDist = windEntries.map(([w,d]) => Math.round(d)).join(',');
			return JSON.stringify(feature);
		})
		.join()
		.writeFile(filenameGeoJSONSeq)
		.finished(() => {
			console.log('\nconvert to geopackage')
			if (fs.existsSync(filenameGPKG)) fs.unlinkSync(filenameGPKG);
			child_process.spawnSync('ogr2ogr', [
				'-f','GPKG',
				'-s_srs','EPSG:4326',
				'-t_srs','EPSG:4326',
				'-nln', 'buildings',
				'-overwrite',
				'-progress',
				filenameGPKG,
				'GeoJSONSeq:'+filenameGeoJSONSeq,
			], { stdio:'inherit' })
		})
}
