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
	let keys = 'wohngebiet,camping,erholung,gewerbe'.split(',');
	let windFinder = WindFinder('flaechen', (hoehe,rad,windEntry) => {
		let result = {};
		for (let key of keys) result[key] = 0;
		for (let rule of config.rules.values()) {
			for (let key of keys) {
				if (rule[key]) result[key] = Math.max(result[key], rule[key](hoehe,rad));
			}
		}
		return result;
	});

	console.log('process siedlungsflaeche');
	let filenameGeoJSONSeq = config.getFilename.alkisResult('flaechen.geojsonl');
	let filenameGPKG = config.getFilename.alkisResult('flaechen.gpkg');

	Havel.pipeline()
		.readFile(config.getFilename.alkisGeo('siedlungsflaeche.geojsonl'), { showProgress: true })
		.split()
		.map(feature => {
			if (feature.length === 0) return;
			feature = JSON.parse(feature);
			
			let type;
			switch (feature.properties.klasse) {
				case 'Siedlung':
					type = 'wohngebiet'; break;
					
				case 'Campingplatz':
					type = 'camping'; break;

				case 'Sport-, Freizeit-, und Erholungsfläche':
				case 'Freizeitanlage':
				case 'Freizeitpark':
					type = 'erholung'; break;

				case 'Industrie- und Gewerbefläche':
					type = 'gewerbe'; break;
				
				
				case 'Abfallbehandlungsanlage':
				case 'Ausstellung, Messe':
				case 'Autokino, Freilichtkino':
				case 'Bergbau':
				case 'Botanischer Garten':
				case 'Deponie (oberirdisch)':
				case 'Deponie (untertägig)':
				case 'Entsorgung':
				case 'Förderanlage':
				case 'Freilichtmuseum':
				case 'Freilichttheater':
				case 'Friedhof':
				case 'Gärtnerei':
				case 'Golfplatz':
				case 'Grünanlage':
				case 'Halde':
				case 'Handel und Dienstleistung':
				case 'Handel':
				case 'Heizwerk':
				case 'Kläranlage, Klärwerk':
				case 'Kleingarten':
				case 'Kraftwerk':
				case 'Modellflugplatz':
				case 'Park':
				case 'Raffinerie':
				case 'Safaripark, Wildpark':
				case 'Schwimmbad, Freibad':
				case 'Sportanlage':
				case 'Tagebau, Grube, Steinbruch':
				case 'Umspannstation':
				case 'Versorgungsanlage':
				case 'Wasserwerk':
				case 'Werft':
				case 'Wochenend- und Ferienhausfläche':
				case 'Zoo':
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
