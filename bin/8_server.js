#!/usr/bin/env node
'use strict'


const fs = require('fs');
const { resolve, relative } = require('path');

const express = require('express');
const mime = require('mime-types');

const { getFileTarDB } = require('../lib/tar.js')
const config = require('../config.js')

const app = express()

const folder = resolve(__dirname, '../docs/');
const port = 8080;
const users = {
	'taz': 'seilbahn',
	'gff': 'rollschuhe',
	'privat': 'omnibus',
	'swr': 'hafermilch',
}

app.use((req, res, next) => {
	const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
	const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':')
	
	if (req.url === '/') console.log({time:(new Date()).toLocaleString('de'), login, password});

	if (login && password && (users[login] === password)) return next()

	// Access denied...
	res.set('WWW-Authenticate', 'Basic realm="401"')
	res.status(401).send('Authentication required.')
})

app.use(cors())

app.use('/data', precompressionStatic(resolve(folder, 'data')));
app.use('/assets', express.static(resolve(folder, 'assets')));

app.get('/', (req, res) => {
	res.sendFile(resolve(folder, 'index.html'))
})

const bufferedTiles = getFileTarDB(config.getFilename.tiles('buffered.tar'));
app.get(/\/tiles\/(buffered.*\.png)/, (req, res) => {
	let filename = req.params[0];
	res
		.set('Content-Type', 'image/png')
		.end(bufferedTiles.get(filename));
})

app.listen(port, () => {
	console.log(`listening on port ${port}`)
})

function precompressionStatic(baseFolder) {
	let files = new Map();
	scanFiles(baseFolder);

	function scanFiles(folder) {
		fs.readdirSync(folder).forEach(name => {
			let fullname = resolve(folder, name);
			if (fs.statSync(fullname).isDirectory()) return scanFiles(fullname);

			let encoding = 'raw', match;
			let keyName = relative(baseFolder, fullname);
			if (match = keyName.match(/(.*)\.gz/i)) {
				keyName = match[1];
				encoding = 'gz';
			} else if (match = keyName.match(/(.*)\.br/i)) {
				keyName = match[1];
				encoding = 'br';
			}
			keyName = ('/' + keyName).replace(/\/{2,}/, '/');

			let file = files.get(keyName);
			if (!file) files.set(keyName, file = { mime: mime.lookup(keyName) });
			file[encoding] = fs.readFileSync(fullname);
		})
	}

	return function compress(req, res, next) {
		if (req.method !== 'GET' && req.method !== 'HEAD') return next();

		let acceptEncoding = req.headers['accept-encoding'];
		if (!acceptEncoding) return next()

		let file = files.get(req.url);
		if (!file) return next();

		res.setHeader('Content-Type', file.mime);

		if ((acceptEncoding.indexOf('br') > -1) && file.br) {
			res.setHeader('Content-Encoding', 'br');
			res.send(file.br);
		} else if ((acceptEncoding.indexOf('gzip') > -1) && file.gz) {
			res.setHeader('Content-Encoding', 'gzip');
			res.send(file.gz);
		} else if (file.raw) {
			res.send(file.raw);
		}

		return next();
	}
}

function cors() {
	return function handler(req, res, next) {
		let origin = req.headers.origin;
		if (!origin) return next();
		let url = new URL(origin);
		switch (url.hostname) {
			case 'localhost':
			case 'michaelkreil.github.io':
				res.setHeader('Access-Control-Allow-Origin', origin);
				break;
		}
		next();
	}
}
