'use strict'

const fs = require('fs');
const http = require('http');
const https = require('https');

module.exports = {
	fetch,
	fetchCached,
	wait,
}

function fetch(url, headers) {
	return new Promise(async resolve => {
		let protocol = url.startsWith('https') ? https : http;

		protocol.get(url, { headers }, response => {
			if (response.statusCode !== 200) {
				console.log('url', url);
				throw Error('status code: '+response.statusCode);
			}
			let buffers = [];
			response.on('data', chunk => buffers.push(chunk));
			response.on('end', () => resolve(Buffer.concat(buffers)))
		})
	})
}

async function fetchCached(filename, url, headers) {
	if (fs.existsSync(filename)) return fs.readFileSync(filename);
	let buffer = await fetch(url, headers);
	fs.writeFileSync(filename, buffer);
	return buffer;
}

function wait(time) {
	return new Promise(res => setTimeout(res, time));
}
