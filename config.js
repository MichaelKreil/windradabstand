'use strict'

const fs = require('fs');
const { resolve } = require('path');

const config = {
	folders: {
		temp:   resolve(__dirname, 'data/0_temp'),
		src:    resolve(__dirname, 'data/1_src'),
		static: resolve(__dirname, 'data/2_static'),
		data:   resolve(__dirname, 'data/3_result'),
	},
	getFile: {
		temp:   f => resolve(config.folders.temp, randomString(8)+'.'+(f || 'tmp')),
		src:    f => resolve(config.folders.src, f),
		static: f => resolve(config.folders.static, f),
		data:   f => resolve(config.folders.data, f),
	}
}

Object.values(config.folders).forEach(path => fs.mkdirSync(path, { recursive:true }));

module.exports = config;

function randomString(n = 8) {
	const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	return Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('');
}
