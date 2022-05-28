#!/usr/bin/env node
'use strict'



const fs = require('fs');
const turf = require('@turf/turf');
const AdmZip = require('adm-zip');
const gdal = require('gdal-next');
const { XMLParser } = require('fast-xml-parser');
const config = require('../config.js');

const hoehen = [100,150,200];


let { forEachBuilding } = BuildingFinder();
getBundeslaender().forEach(bundesland => {
	if (bundesland.properties.type !== 'Land') return;

	// get bbox
	let bufferland = turf.buffer(bundesland, 5); // 5 km buffer
	let bbox = turf.bbox(bufferland);

	// get residential buildings
	let buildings = [];
	forEachBuilding(bbox, building => {
		building.center = turf.center(building).geometry.coordinates;
		if (!turf.booleanPointInPolygon(building.center, bufferland))
		buildings.push(building)
	})

	console.log(buildings);

	// sort buildings for N to W
	// merge building buffer
	// intersect with bundesland
	// save
})

function getBundeslaender() {
	let bundeslaender = fs.readFileSync(config.getFile.src('VG250_Bundeslaender.geojson'));
	bundeslaender = JSON.parse(bundeslaender).features;

	//console.table(bundeslaender.map(b => b.properties));

	bundeslaender.forEach(bundesland => {
		switch (bundesland.properties.AGS) {
			case '01': bundesland.properties.name = 'Schleswig-Holstein'; break;
			case '02': bundesland.properties.name = 'Hamburg'; break;
			case '03': bundesland.properties.name = 'Niedersachsen'; break;
			case '04': bundesland.properties.name = 'Bremen'; break;
			case '05': bundesland.properties.name = 'Nordrhein-Westfalen'; break;
			case '06': bundesland.properties.name = 'Hessen'; break;
			case '07': bundesland.properties.name = 'Rheinland-Pfalz'; break;
			case '08': bundesland.properties.name = 'Baden-Württemberg'; break;
			case '09': bundesland.properties.name = 'Bayern'; break;
			case '10': bundesland.properties.name = 'Saarland'; break;
			case '11': bundesland.properties.name = 'Berlin'; break;
			case '12': bundesland.properties.name = 'Brandenburg'; break;
			case '13': bundesland.properties.name = 'Mecklenburg-Vorpommern'; break;
			case '14': bundesland.properties.name = 'Sachsen'; break;
			case '15': bundesland.properties.name = 'Sachsen-Anhalt'; break;
			case '16': bundesland.properties.name = 'Thüringen'; break;
			default: throw Error();
		}
		switch (bundesland.properties.GF) {
			case 1: bundesland.properties.type = 'Wasser'; break;
			case 2: bundesland.properties.type = 'Fluss'; break;
			case 3: bundesland.properties.type = 'Watt'; break;
			case 4: bundesland.properties.type = 'Land'; break;
			default: throw Error();
		}
	})

	return bundeslaender;
}

function BuildingFinder() {
	let dbBuildings = gdal.open(config.getFile.result('buildings.gpkg')).layers.get(0);
	let ignoredBuildings = fs.readFileSync(config.getFile.result('ignoredBuildings.json'));
	ignoredBuildings = new Set(JSON.parse(ignoredBuildings));

	function forEachInBBox(bbox, cb) {
		dbBuildings.setSpatialFilter(bbox[0]-1e-4, bbox[1]-1e-4, bbox[2]+1e-4, bbox[3]+1e-4);
		let feature;
		while (feature = dbBuildings.features.next()) {
			cb({
				type: 'Feature',
				fid: feature.fid,
				properties: feature.fields.toObject(),
				geometry: feature.getGeometry().toObject(),
			});
		}
	}

	function forEachBuilding(bbox, cb) {
		forEachInBBox(bbox, building => {
			if (ignoredBuildings.has(building.fid)) return;
			if (!building.properties.residential) return;
			cb(building);
		})
	}

	return {
		forEachBuilding,
	}
}
