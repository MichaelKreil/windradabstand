'use strict'

const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');

[http, https].forEach(h => {
	h.myAgent = new h.Agent({
		keepAlive: true,
		keepAliveMsecs: 3000,
		timeout: 3000,
		maxSockets: 4,
		maxFreeSockets: 4,
	})
});

module.exports = {
	fetch,
	fetchCached,
	wait,
}

function fetch(url, headers) {
	return new Promise(async (resolve, reject) => {
		let protocol = url.startsWith('https') ? https : http;

		let request = protocol.get(url, { agent:protocol.myAgent, headers, timeout:3000 }, response => {
			if (response.statusCode !== 200) {
				request.destroy();
				return reject(response.statusCode);
			}
			let buffers = [];
			response.on('data', chunk => buffers.push(chunk));
			response.on('end', () => resolve(Buffer.concat(buffers)))
		}).on('error', async error => {
			if (error.code === 'ETIMEDOUT') return reject(-1);
			if (error.code === 'ENOTFOUND') return reject(-1);
			throw Error(error);
		})
	})
}

async function fetchCached(filename, url, headers) {
	if (fs.existsSync(filename)) return fs.readFileSync(filename);
	let buffer;
	for (let i = 1; i <= 3; i--) {
		try {
			buffer = await fetch(url, headers);
			process.stdout.write('.');
			//await wait(200);
			break;
		} catch (code) {
			//console.log('error', code, url);
			if (code === 500) {
				process.stdout.write('5');
				buffer = Buffer.allocUnsafe(0);
				break;
			}

			if (code === -1) {
				process.stdout.write('#');
				//console.log('ETIMEDOUT, retrying', url)
				continue;
			}

			if (code !== 500) {
				process.stdout.write('?');
				console.log('url', url);
				throw Error('Status code: ' + code)
			}
		}
		throw Error('3 failed attempts')
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