#!/usr/bin/env node
'use strict'

const config = require('../config.js');
const { resolve } = require('path');

start();

async function start() {

	let pngFolder = resolve(config.folders.sdf, 'png');
	let tilesTar = resolve(config.folders.tiles, 'tiles.tar');

	console.log('1/3 pngquant')
	await wrapExec(`cd "${pngFolder}"; find . -mindepth 2 -maxdepth 2 -type d | shuf | parallel --progress --bar "pngquant -f --ext .png --quality=90-100 --speed 1 --strip {}/*.png"`);

	console.log('2/3 optipng')
	await wrapExec(`cd "${pngFolder}"; find . -mindepth 2 -maxdepth 2 -type d | shuf | parallel --progress --bar "optipng -quiet {}/*.png"`);

	console.log('3/3 tar')
	await wrapExec(`rm "${tilesTar}"; cd "${pngFolder}"; tar -cf "${tilesTar}" *`);

	console.log('Finished');
	return
}
