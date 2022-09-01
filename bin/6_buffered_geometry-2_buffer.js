#!/usr/bin/env node
'use strict'



const { simpleCluster } = require('big-data-tools');
const { resolve, dirname, basename, extname } = require('path');
const { readFileSync, renameSync, createWriteStream, rmSync, existsSync, writeFileSync, statSync } = require('fs');
const { createGzip } = require('zlib');
const { spawn } = require('child_process');
const turf = require('@turf/turf');
const miss = require('mississippi2');
const config = require('../config.js');



simpleCluster(async runWorker => {
	const { ruleTypes, bundeslaender } = JSON.parse(readFileSync(config.getFilename.bufferedGeometry('index.json')));

	let todos = [];
	ruleTypes.forEach(ruleType => {
		ruleType.regions.forEach(region => {
			let bundesland = bundeslaender.find(b => b.ags === region.ags);
			todos.push({
				bundesland,
				ruleType,
				region,
				radius: region.radius / 1000,
				filenameIn: ruleType.filenameIn,
				filenameOut: region.filenameBase + '.geojsonl.gz',
			})
		})
	})

	todos = todos.filter(t => !existsSync(t.filenameOut));

	await todos.forEachParallel(runWorker);

	console.log('finished')

	process.exit();

}, async todo => {

	console.log('buffer', todo.ruleType.slug, todo.region.ags, `(${todo.bundesland.name})`);

	let bbox = turf.bboxPolygon(todo.bundesland.bbox);
	bbox = turf.buffer(bbox, todo.radius, { steps: 18 });
	bbox = turf.bbox(bbox);

	let stream = readSource(todo.filenameIn, bbox); // read and split into lines
	
	if (todo.radius > 0) {
		stream = stream.pipe(calcBuffer(todo.radius));
		
		const blockFilenames = [];
		stream = stream.pipe(cutIntoBlocks(todo.region.filenameBase, async filename => {
			await unionAndClipFeatures(filename);
			blockFilenames.push(filename);
		}))

		await new Promise(res => stream.on('close', res))

		if (blockFilenames.length > 1) {
			const filenameVRT = calcTemporaryFilename(todo.region.filenameBase + '.vrt');
			await generateUnionVRT(blockFilenames, filenameVRT);
			await unionAndClipFeatures(filenameVRT, todo.filenameOut);
			
			rmSync(filenameVRT);
			blockFilenames.forEach(file => rmSync(file));

		} else {
			renameSync(blockFilenames[0], todo.filenameOut);
		}
	} else {
		let filenameTmp = calcTemporaryFilename(todo.filenameOut);
		stream = stream
			.pipe(miss.map(chunk => chunk + '\n'))
			.pipe(createGzip())
			.pipe(createWriteStream(filenameTmp));

		await new Promise(res => stream.on('close', res))
		renameSync(filenameTmp, todo.filenameOut);
	}



	function readSource(filenameIn, bbox) {

		const layerName = calcLayername(filenameIn);

		const cp = getOgr([
			'-spat',
			...(bbox.map(v => v.toString())),
			'-dialect', 'SQLite',
			'-sql', 'SELECT geometry FROM ' + layerName, // ignore all attributes
			'-f', 'GeoJSONSeq',
			'/vsistdout/', filenameIn,
		]);

		return cp.stdout.pipe(miss.split());
	}

	function calcBuffer(radius) {
		return miss.through.obj(function (line, enc, cb) {
			if (line.length === 0) return cb();
			let f0 = JSON.parse(line);
			turf.flattenEach(f0, f1 => {
				f1 = turf.buffer(f1, radius, { steps: 18 });
				turf.flattenEach(f1, f2 => {
					cleanupFeature(f2);
					try {
						f2 = turf.unkinkPolygon(f2);
					} catch (e) {
						console.dir(f2, { depth: 10 });
						throw e;
					}
					f2.features.forEach(f3 => {
						this.push(JSON.stringify(f3));
					})
				})
			})
			cb();
		})
	}

	function cutIntoBlocks(templateFilename, asyncCb) {
		const maxSize = 1024 ** 3;
		let size = 0;
		let index = 0;
		let file = File();
		stream = miss.to.obj(
			async function write(line, enc, cbWrite) {
				size += line.length;
				if (size >= maxSize) {
					await file.finish();
					index++;
					size = 0;
					file = await File();
				}
				await file.write(line + '\n');
				cbWrite();
			},
			async function flush(cbFlush) {
				await file.finish();
				cbFlush();
				setTimeout(() => stream.emit('close'), 1000);
			}
		)
		return stream;

		function File() {
			const filename = templateFilename + '.block_' + index + '.geojsonl.gz';
			const gzipStream = createGzip();
			const fileStream = createWriteStream(filename);
			gzipStream.pipe(fileStream);

			const write = chunk => new Promise(res => {
				if (gzipStream.write(chunk)) return res();
				gzipStream.once('drain', res);
			})
			const finish = async () => {
				await new Promise(res => {
					fileStream.once('close', res);
					gzipStream.end()
				})
				await asyncCb(filename);
			}

			return { write, finish }
		}

	}

	function calcLayername(filename) {
		return basename(filename).split('.').slice(0, -1).join('.');
	}

	async function unionAndClipFeatures(filenameIn, filenameOut) {
		if (!filenameOut) filenameOut = filenameIn;
		const filenameTmp = calcTemporaryFilename(filenameOut);

		if (!filenameOut.endsWith('.geojsonl.gz')) throw Error('file extension must be .geojsonl.gz');

		let layerName = calcLayername(filenameIn);

		let cpOGR = getOgr([
			//'--debug', 'ON',
			'-skipfailures',
			'-dialect', 'SQLite',
			'-sql', `SELECT ST_Union(geometry) AS geometry FROM "${layerName}"`,
			'-clipdst', todo.bundesland.filename,
			'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
			'--config', 'ATTRIBUTES_SKIP', 'YES',
			'-f', 'GeoJSONSeq',
			'-nlt', 'MultiPolygon',
			'/vsistdout/', wrapFileDriver(filenameIn),
		]);

		let spawnArgsJQ = [
			'-cr',
			'.geometry | if .type != "MultiPolygon" then error("wrong type "+.type) else .coordinates[] | {type:"Feature",geometry:{type:"Polygon",coordinates:.}} | @json end'
		]
		let cpJQ = spawn('jq', spawnArgsJQ);
		cpJQ.stderr.pipe(process.stderr);
		cpJQ.on('exit', code => {
			if (code > 0) {
				console.log({ spawnArgsJQ });
				throw Error();
			}
		})

		cpOGR.stdout.pipe(cpJQ.stdin);

		let stream = cpJQ.stdout
			.pipe(createGzip())
			.pipe(createWriteStream(filenameTmp))

		await new Promise(res => stream.on('close', res))

		renameSync(filenameTmp, filenameOut);
	}

	function calcTemporaryFilename(filename) {
		let dir = dirname(filename);
		let name = basename(filename);
		let filenameTmp = resolve(dir, 'tmp-' + name);
		if (existsSync(filenameTmp)) rmSync(filenameTmp);
		return filenameTmp;
	}

	function wrapFileDriver(filenameOriginal) {
		let filename = filenameOriginal;
		let gzip = false;
		if (filename.endsWith('.gz')) {
			gzip = true;
			filename = filename.slice(0, -3);
		}

		let driver;
		switch (extname(filename)) {
			case '.geojsonl': driver = 'GeoJSONSeq:'; break;
			case '.geojson': driver = 'GeoJSON:'; break;
			case '.vrt': driver = ''; break;
			default: throw Error(extname(filename))
		}

		return driver + (gzip ? '/vsigzip/' : '') + filenameOriginal;
	}

	function cleanupFeature(feature) {
		if (feature.geometry.type !== 'Polygon') throw Error(feature.geometry.type);
		feature.geometry.coordinates = feature.geometry.coordinates.map(ring => {
			let lastp = [];
			return ring.filter(p => {
				p = p.map(v => Math.round(v * 1e8) / 1e8);
				if ((p[0] === lastp[0]) && (p[1] === lastp[1])) return false;
				lastp = p;
				return true;
			})
		})
	}
	
	function generateUnionVRT(filenamesIn, filenameOut) {
		let result = [];
		result.push(`<OGRVRTDataSource>`);
		result.push(`   <OGRVRTUnionLayer name="${calcLayername(filenameOut)}">`);
		filenamesIn.forEach(filenameIn => {
			if (statSync(filenameIn).size <= 20) return; // ignore empty files
			result.push(`      <OGRVRTLayer name="${calcLayername(filenameIn)}">`)
			result.push(`         <SrcDataSource>${wrapFileDriver(filenameIn)}</SrcDataSource>`)
			result.push(`      </OGRVRTLayer>`);
		})
		result.push(`   </OGRVRTUnionLayer>`);
		result.push(`</OGRVRTDataSource>`);
		writeFileSync(filenameOut, result.join('\n'));
	}

	function getOgr(args) {
		const ogr = spawn('ogr2ogr', args);
		ogr.stderr.on('data', line => {
			if (line.includes('Warning 1: VSIFSeekL(xxx, SEEK_END) may be really slow')) return;
			process.stderr.write(line);
		})
		ogr.on('exit', code => {
			if (code > 0) {
				console.log({ args });
				throw Error();
			}
		})
		return ogr;
	}
})
