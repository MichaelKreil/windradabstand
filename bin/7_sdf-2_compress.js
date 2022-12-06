#!/usr/bin/env node
'use strict'

const config = require('../config.js');
const { resolve } = require('path');
const child_process = require('child_process');

start();

async function start() {

	let pngFolder = resolve(config.folders.sdf, 'png');
	let tilesTar = resolve(config.folders.tiles, 'tiles.tar');

	console.log('1/2 convert to webp')
	await wrapExec(`cd "${pngFolder}"; find . -mindepth 3 -maxdepth 3 -type f | parallel --progress --bar "cwebp -quiet -near_lossless 0 -m 6 -noalpha {.}.png -o {.}.webp"`);

	console.log('2/2 delete png')
	await wrapExec(`cd "${pngFolder}"; find . -mindepth 2 -maxdepth 2 -type d | shuf | parallel -j 1 --progress --bar "rm {}/*.png"`);
/*
	console.log('2/4 pngquant')
	await wrapExec(`cd "${pngFolder}"; find . -mindepth 2 -maxdepth 2 -type d | shuf | parallel --progress --bar "pngquant -f --ext .png --quality=90-100 --speed 1 --strip {}/*.png"`);

	console.log('3/4 optipng')
	await wrapExec(`cd "${pngFolder}"; find . -mindepth 2 -maxdepth 2 -type d | shuf | parallel --progress --bar "optipng -quiet {}/*.png"`);

	console.log('4/4 tar')
	await wrapExec(`rm "${tilesTar}"; cd "${pngFolder}"; tar -cf "${tilesTar}" *`);
*/
	console.log('Finished');
	return
}


async function wrapExec(cmd) {
	try {
		child_process.execSync(cmd, { stdio: 'inherit' });
	} catch (e) {
		console.log(e);
		if (e.stdout) console.log('stdout', e.stdout.toString());
		if (e.stderr) console.log('stderr', e.stderr.toString());
		throw e;
	}
}
