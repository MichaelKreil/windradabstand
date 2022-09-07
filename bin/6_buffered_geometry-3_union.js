#!/usr/bin/env node
'use strict'

const { simpleCluster } = require('big-data-tools');
const { readFileSync, existsSync, mkdirSync, rmSync } = require('fs');
const config = require('../config.js');
const { resolve } = require('path');
const { generateUnionVRT, unionAndClipFeatures } = require('../lib/geohelper');


// union geometry per bundesland

simpleCluster(async runWorker => {
	const outputFolder = config.getFilename.bufferedGeometry('_results/');
	mkdirSync(outputFolder, { recursive: true })

	let { ruleTypes, bundeslaender } = JSON.parse(readFileSync(config.getFilename.bufferedGeometry('index.json')));

	bundeslaender.forEach(b => {
		b.filenameBase = resolve(outputFolder, b.ags + '');
		b.filenameOut = b.filenameBase + '.gpkg'
		b.filesIn = [];
	});

	bundeslaender = new Map(bundeslaender.map(b => [b.ags, b]));

	ruleTypes.forEach(ruleType => {
		ruleType.regions.forEach(region => {
			let index = region.ags;
			let filenameIn = region.filenameBase + '.gpkg';

			if (!existsSync(filenameIn)) return;
			bundeslaender.get(index).filesIn.push(filenameIn);
		})
	})

	bundeslaender = Array.from(bundeslaender.values());
	
	bundeslaender = bundeslaender.filter(b => !existsSync(b.filenameOut));
	//bundeslaender = bundeslaender.filter(b => b.ags === 4);

	await bundeslaender.forEachParallel(1, runWorker);

	console.log('finished')

	process.exit();

}, async todo => {
	console.log(todo.name);

	const filenameVRT = todo.filenameBase + '.vrt';
	await generateUnionVRT(todo.filesIn, filenameVRT);
	await unionAndClipFeatures(filenameVRT, todo.filename, todo.filenameOut)
	rmSync(filenameVRT);
})

