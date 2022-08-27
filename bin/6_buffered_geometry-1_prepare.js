#!/usr/bin/env node
'use strict'

const config = require('../config.js');
const { writeFileSync } = require('fs');
const { getBundeslaender } = require('../lib/geohelper.js');
const { ensureFolder } = require('../lib/helper.js');
const { resolve } = require('path');
const turf = require('@turf/turf');

const { nabenhoehe, rotordurchmesser } = config.typicalWindTurbine;



let folderBundeslaender = config.getFilename.bufferedGeometry('_bundeslaender');
ensureFolder(folderBundeslaender);
let bundeslaender = getBundeslaender().map(bundesland => {
	let filename = resolve(folderBundeslaender, bundesland.properties.ags + '.geojson');
	writeFileSync(filename, JSON.stringify(turf.featureCollection(bundesland)))

	bundesland.properties.bbox = turf.bbox(bundesland);
	bundesland.properties.filename = filename;
	return bundesland.properties;
})



let ruleTypes = config.ruleTypes.filter(ruleType => {
	ruleType.filenameIn = config.getFilename.rulesGeoBasis(ruleType.slug + '.gpkg');
	ruleType.folderOut = config.getFilename.bufferedGeometry(ruleType.slug);
	ruleType.regions = [];

	for (let bundesland of bundeslaender) {
		let rules = config.rules.get(bundesland.ags);
		let func = rules[ruleType.slug];
		if (!func) continue;

		let radius = func(nabenhoehe, rotordurchmesser / 2);
		ruleType.regions.push({
			radius,
			ags: bundesland.ags,
			filenameBase: resolve(ruleType.folderOut, '' + bundesland.ags),
		})
	}

	if (ruleType.regions.length === 0) return false;

	ensureFolder(ruleType.folderOut);
	return true;
})



let result = { ruleTypes, bundeslaender }
writeFileSync(config.getFilename.bufferedGeometry('index.json'), JSON.stringify(result, null, '\t'));
