'use strict'

const fs = require('fs');
const { resolve } = require('path');

const config = {
	folders: {
		wind: '1_wind',
		static: 'static',
	},
	getFilename: {},
}

for (let name in config.folders) {
	let path = resolve(__dirname, 'data', config.folders[name]);
	config.folders[name] = path
	config.getFilename[name] = filename => resolve(path, filename);
	fs.mkdirSync(path, { recursive:true });
}

module.exports = config;

function randomString(n = 8) {
	const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	return Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}
