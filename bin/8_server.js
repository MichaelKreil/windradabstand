#!/usr/bin/env node
'use strict'


const fs = require('fs');
const { resolve, relative } = require('path');
const zlib = require('zlib');

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
const productionMode = process.argv.includes('production');
if (productionMode) console.log('run server in production mode')



// add login
app.use((req, res, next) => {
	const b64auth = (req.headers.authorization || '').split(' ')[1] || ''
	const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':')
	
	if (req.url === '/') console.log({time:(new Date()).toLocaleString('de'), login, password});

	if (login && password && (users[login] === password)) return next()

	// Access denied...
	res.set('WWW-Authenticate', 'Basic realm="401"')
	res.status(401).send('Authentication required.')
})

// add CORS
app.use(cors())

app.use('/data', serveStatic('data'));
app.use('/scripts', serveStatic('scripts'));
app.use('/assets', serveStatic('assets'));
app.use(/\//, serveStatic('.', false))

const bufferedTiles = getFileTarDB(config.getFilename.tiles('buffered.tar'));
app.get(/\/tiles\/(buffered.*\.png)/, (req, res) => {
	let filename = req.params[0];
	res
		.set('Content-Type', 'image/png')
		.end(bufferedTiles.get(filename));
})

app.listen(port, console.log(`listening on port ${port}`))

function serveStatic(source, recursive=true) {
	console.log(`add files from ${source}`)
	source = resolve(folder, source);
	let files = new Map();
	scanFiles(source);
	if (productionMode) {
		files.forEach((f,key) => {
			if (key.endsWith('.png')) return;
			if (!f.br) {
				console.log(`   compress ${key} with brotli`);
				let buffer = f.raw();
				buffer = zlib.brotliCompressSync(buffer, {params:{
					[zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
					[zlib.constants.BROTLI_PARAM_SIZE_HINT]: buffer.length,
				}});
				f.br = () => buffer;
			}
			if (!f.gz) {
				console.log(`   compress ${key} with gzip`);
				let buffer = f.raw();
				buffer = zlib.gzipSync(buffer, {level:9});
				f.gz = () => buffer;
			}
		})
	}

	function scanFiles(folder) {
		fs.readdirSync(folder).forEach(name => {
			let fullname = resolve(folder, name);
			if (fs.statSync(fullname).isDirectory()) {
				if (recursive) scanFiles(fullname);
				return;
			}

			let encoding = 'raw', match;
			let urlName = relative(source, fullname);
			if (match = urlName.match(/(.*)\.gz/i)) {
				urlName = match[1];
				encoding = 'gz';
			} else if (match = urlName.match(/(.*)\.br/i)) {
				urlName = match[1];
				encoding = 'br';
			}
			urlName = ('/' + urlName).replace(/\/{2,}/, '/');
			addFile(urlName, fullname, encoding);

			if (urlName.endsWith('/index.html')) {
				addFile(urlName.slice(0,-10), fullname, encoding);
			}
		})
	}

	function addFile(urlName, filename, encoding) {
		let file = files.get(urlName);
		if (!file) files.set(urlName, file = { mime: mime.lookup(filename) });
		if (productionMode) {
			let buffer = fs.readFileSync(filename);
			file[encoding] = () => buffer;
		} else {
			file[encoding] = () => fs.readFileSync(filename);
		}
	}

	return function serve(req, res, next) {
		if (req.method !== 'GET' && req.method !== 'HEAD') return next();

		let acceptEncoding = req.headers['accept-encoding'];
		if (!acceptEncoding) return next()

		let file = files.get(req.url);

		if (!file) {
			if (!productionMode) console.log(`can not find file "${req.url}"`)
			return next();
		}

		res.setHeader('Content-Type', file.mime);

		if (file.br && (acceptEncoding.indexOf('br') > -1)) {
			res.setHeader('Content-Encoding', 'br');
			res.send(file.br());
		} else if (file.gz && (acceptEncoding.indexOf('gzip') > -1)) {
			res.setHeader('Content-Encoding', 'gzip');
			res.send(file.gz());
		} else if (file.raw) {
			res.send(file.raw());
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
