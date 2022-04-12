'use strict'

const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');

[http, https].forEach(h => {
	h.globalAgent.keepAlive = true;
	h.globalAgent.keepAliveMsecs = 30000;
	h.globalAgent.timeout = 5000;
});

module.exports = {
	fetch,
	fetchCached,
	wait,
}

function fetch(url, headers) {
	return new Promise(async (resolve, reject) => {
		let protocol = url.startsWith('https') ? https : http;

		protocol.get(url, { headers }, response => {
			if (response.statusCode !== 200) return reject(response.statusCode);
			let buffers = [];
			response.on('data', chunk => buffers.push(chunk));
			response.on('end', () => resolve(Buffer.concat(buffers)))
		}).on('error', async error => {
			if (error.code === 'ETIMEDOUT') return reject(-1);
			throw Error(error);
		})
	})
}

async function fetchCached(filename, url, headers) {
	if (fs.existsSync(filename)) return fs.readFileSync(filename);
	let buffer;
	while (true) {
		try {
			buffer = await fetch(url, headers);
			break;
		} catch (code) {
			if (code === 500) {
				buffer = Buffer.allocUnsafe(0);
				break;
			}

			if (code === -1) {
				console.log('ETIMEDOUT, retrying', url)
				continue;
			}

			if (code !== 500) {
				console.log('url', url);
				throw Error('Status code: ' + code)
			}
		}
	}
	fs.writeFileSync(filename, buffer);
	return buffer;
}

function wait(time) {
	return new Promise(res => setTimeout(res, time));
}

Array.prototype.forEachParallel = forEachParallel;

function forEachParallel() {
	let callback, maxParallel = os.cpus().length;
	switch (arguments.length) {
		case 1: [callback] = arguments; break;
		case 2: [maxParallel, callback] = arguments; break;
		default:
			throw Error('forEachParallel( [ maxParallel, ] callback)')
	}

	let list = this;
	return new Promise((resolve, reject) => {
		let running = 0, index = 0, finished = false;

		queueMicrotask(next);

		function next() {
			if (finished) return;
			if (running >= maxParallel) return;
			if (index >= list.length) {
				if (running === 0) {
					finished = true;
					resolve();
					return
				}
				return
			}

			running++;
			let currentIndex = index++;

			callback(list[currentIndex], currentIndex)
				.then(() => {
					running--;
					queueMicrotask(next)
				})
				.catch(err => {
					finished = true;
					reject(err);
				})

			if (running < maxParallel) queueMicrotask(next);
		}
	})
}
