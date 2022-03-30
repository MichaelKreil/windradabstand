'use strict'

const fs = require('fs');
const { resolve } = require('path');

const config = {
	folders: {
		src:    resolve(__dirname, 'data/1_src'),
		temp:   resolve(__dirname, 'data/0_temp'),
		data:   resolve(__dirname, 'data/2_interim'),
		result: resolve(__dirname, 'data/3_result'),
	},
	getFile: {
		src:    f => resolve(config.folders.src, f),
		temp:   f => resolve(config.folders.temp, randomString(8)+'.tmp'+(f || '')),
		data:   f => resolve(config.folders.data, f),
		result: f => resolve(config.folders.result, f),
	}
}

Object.values(config.folders).forEach(path => fs.mkdirSync(path, { recursive:true }));

module.exports = config;

function randomString(n = 8) {
	const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	return Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}
