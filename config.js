'use strict'

const fs = require('fs');
const { resolve } = require('path');

const config = {
	folders: {
		src:    resolve(__dirname, 'data/1_src'),
		static: resolve(__dirname, 'data/2_static'),
		cache:  resolve(__dirname, 'data/3_cache'),
		temp:   resolve(__dirname, 'data/4_temp'),
		geo:    resolve(__dirname, 'data/5_geo'),
		result: resolve(__dirname, 'data/6_result'),
	}
}

Object.values(config.folders).forEach(path => fs.mkdirSync(path, { recursive:true }));

module.exports = config;

function randomString(n = 8) {
	const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	return Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}
