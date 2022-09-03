'use strict'

const fs = require('fs');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { resolve, dirname, basename } = require('path');
const { spawn } = require('child_process');

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
	brotli,
	calcTemporaryFilename,
	download,
	ensureFolder,
	fetch,
	fetchCached,
	getSpawn,
	gzip,
	Progress,
	readTSV,
	wait,
}

function download(url, filename, showProgress) {
	return new Promise(async (resolve, reject) => {
		let protocol = url.startsWith('https') ? https : http;

		let request = protocol.get(url, response => {
			if (response.statusCode !== 200) {
				request.destroy();
				return reject(response.statusCode);
			}
			response.pipe(fs.createWriteStream(filename));
			response.on('end', () => resolve())

			if (showProgress) {
				const mb = 1024 * 1024;
				let length = parseInt(response.headers['content-length'], 10);
				let pos = 0;
				let progress = Progress(length / mb);

				response.on('data', chunk => {
					pos += chunk.length;
					progress(pos / mb);
				})
			}
		}).on('error', async error => {
			throw Error(error);
		})
	})
}

function fetch(url, headers) {
	return new Promise(async (resolve, reject) => {
		let protocol = url.startsWith('https') ? https : http;

		let request = protocol.get(url, { agent: protocol.myAgent, headers, timeout: 3000 }, response => {
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

	ensureFolder(dirname(filename));

	let buffer;
	for (let i = 1; i <= 3; i--) {
		try {
			buffer = await fetch(url, headers);
			process.stderr.write('\u001b[38;5;46m.\u001b[0m');
			//await wait(200);
			break;
		} catch (code) {
			if (code === 404) {
				buffer = Buffer.allocUnsafe(0);
				break;
			}

			console.log('error', { code, url, filename });

			if (code === 500) {
				process.stderr.write('\u001b[38;5;214m-\u001b[0m');
				buffer = Buffer.allocUnsafe(0);
				break;
			}

			if (code === -1) {
				process.stderr.write('\u001b[38;5;208mT\u001b[0m');
				//console.log('ETIMEDOUT, retrying', url)
				continue;
			}

			if (code !== 500) {
				process.stderr.write('\u001b[38;5;196mE\u001b[0m');
				console.log('url', url);
				throw Error('Status code: ' + code)
			}
		}
		throw Error('3 failed attempts')
	}
	fs.writeFileSync(filename, buffer);
	return buffer;
}

function ensureFolder(folder) {
	if (!fs.existsSync(folder)) {
		ensureFolder(dirname(folder));
		fs.mkdirSync(folder, { recursive: true });
	}
}

function wait(milliseconds) {
	return new Promise(res => setTimeout(res, milliseconds));
}

function Progress(n) {
	let lastTime = 0;
	let times = [];
	return i => {
		let now = Date.now();
		if (now - lastTime < 1000) return // only once every seconds
		lastTime = now;

		if (i > n) i = n;

		times.push([i, now]);

		while (times.length > 100) times.shift(); // based on the last 10 entries

		let speed = 0, timeLeft = '?';
		if (times.length > 1) {
			let [i0, t0] = times[0];
			speed = (i - i0) * 1000 / (now - t0);
			timeLeft = (n - i) / speed;
			timeLeft = [
				(Math.floor(timeLeft / 3600)).toString(),
				(Math.floor(timeLeft / 60) % 60 + 100).toString().slice(1),
				(Math.floor(timeLeft) % 60 + 100).toString().slice(1)
			].join(':')
		}
		process.stderr.write(
			'\u001b[2K\r' +
			[
				(100 * i / n).toFixed(2) + '%',
				speed.toFixed(1) + '/s',
				timeLeft
			].map(s => s + ' '.repeat(12 - s.length)).join('')
		);
	}
}

function gzip(buffer) {
	return new Promise(res => {
		zlib.gzip(buffer, { level: 9 }, (err, result) => res(result))
	})
}

function brotli(buffer) {
	return new Promise(res => {
		zlib.brotliCompress(buffer, {
			params: {
				[zlib.constants.BROTLI_PARAM_QUALITY]: 11,
				[zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length,
			}
		}, (err, result) => res(result))
	})
}

function readTSV(filename) {
	let data = fs.readFileSync(filename, 'utf8').split(/\n/);
	data = data.filter(l => l.length > 0);
	data = data.map(l => l.split('\t'));
	let header = data.shift();
	data = data.map(l => Object.fromEntries(header.map((k, i) => [k, l[i]])));
	return data;
}

function getSpawn(command, args) {
	const cp = spawn(command, args);
	cp.stderr.on('data', line => {
		line = line.toString();
		if (line.includes('Warning 1: VSIFSeekL(xxx, SEEK_END) may be really slow')) return;
		process.stderr.write(line);
	})
	cp.on('exit', code => {
		if (code > 0) {
			console.log({ args });
			throw Error();
		}
	})
	return cp;
}

function calcTemporaryFilename(filename) {
	let filenameTmp = resolve(dirname(filename), 'tmp-' + randomString(8) + '-' + basename(filename));
	if (existsSync(filenameTmp)) rmSync(filenameTmp);
	return filenameTmp;
}

function randomString(length) {
	const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
	return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]);
}
