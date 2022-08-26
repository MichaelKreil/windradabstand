#!/usr/bin/env node
'use strict'

const config = require('../config.js');
const { writeFileSync } = require('fs');
const { getBundeslaender } = require('../lib/geohelper.js');

const bundeslaender = getBundeslaender();
const { nabenhoehe, rotordurchmesser } = config.typicalWindTurbine;

let ruleTypes = config.ruleTypes;

for (let ruleType of ruleTypes) {
	ruleType.filenameIn = config.getFilename.rulesGeoBasis(ruleType.slug + '.gpkg');
	ruleType.folderOut = config.getFilename.bufferedGeometry(ruleType.slug);
	ruleType.regions = [];

	for (let bundesland of bundeslaender) {
		let rules = config.rules.get(bundesland.properties.ags);
		let func = rules[ruleType.slug];
		if (!func) continue;

		let radius = func(nabenhoehe, rotordurchmesser / 2);
		ruleType.regions.push({
			radius,
			ags: bundesland.properties.ags,
		})
	}
}

ruleTypes = ruleTypes.filter(r => r.regions.length > 0)

writeFileSync(config.getFilename.bufferedGeometry('index.json'), JSON.stringify(ruleTypes, null, '\t'));
