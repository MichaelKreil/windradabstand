#!/usr/bin/env node
'use strict'



const { simpleCluster } = require('big-data-tools');
const { readFileSync, renameSync, rmSync, existsSync, createWriteStream } = require('fs');
const turf = require('@turf/turf');
const miss = require('mississippi2');
const config = require('../config.js');
const { createGzip } = require('zlib');
const { getSpawn, calcTemporaryFilename } = require('../lib/helper.js');



simpleCluster(true, async runWorker => {
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
				filenameOut: region.filenameBase + '.gpkg',
			})
		})
	})

	todos = todos.filter(t => !existsSync(t.filenameOut));
	todos = todos.slice(3);

	await todos.forEachParallel(1, runWorker);

	console.log('finished')

	process.exit();

}, async todo => {

	console.log('buffer', todo.ruleType.slug, todo.region.ags, `(${todo.bundesland.name})`);

	if (todo.radius > 0) {
		let filenameIn = todo.filenameIn+'.fgb';

		let bbox = turf.bboxPolygon(todo.bundesland.bbox);
		bbox = turf.buffer(bbox, todo.radius, { steps: 18 });
		bbox = turf.bbox(bbox);

		const cp = getSpawn('ogr2ogr', [
			'-spat',
			...(bbox.map(v => v.toString())),
			'-dialect', 'SQLite',
			'-sql', 'SELECT geometry FROM ' + ogrCalcLayername(filenameIn),
			'-f', 'GeoJSONSeq',
			'/vsistdout/', ogrWrapFileDriver(filenameIn),
		]);

		let stream = cp.stdout
			.pipe(miss.split())
			.pipe(calcBuffer(todo.radius));
		
		const blockFilenames = [];
		stream = stream.pipe(cutIntoBlocks(
			index => todo.region.filenameBase + '.block_' + index + '.geojsonl.gz',
			async filenameIn => {
				let filenameOut = todo.region.filenameBase + '.block_' + index + '.gpkg';
				await unionAndClipFeatures(filenameIn, filenameOut);
				blockFilenames.push(filenameOut);
			}
		))

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
		let filenameIn = todo.filenameIn+'.gpkg';
		let filenameTmp = calcTemporaryFilename(todo.filenameOut);

		const cp = getSpawn('ogr2ogr', [
			'-spat',
			...(todo.bundesland.bbox.map(v => v.toString())),
			'-dialect', 'SQLite',
			'-sql', 'SELECT geometry FROM ' + ogrCalcLayername(filenameIn),
			'-clipsrc', todo.bundesland.filename,
			filenameTmp, ogrWrapFileDriver(filenameIn),
		]);

		await new Promise(res => cp.on('close', res))

		renameSync(filenameTmp, todo.filenameOut);
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
	}

	function cutIntoBlocks(cbFilename, asyncCb) {
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
					file = File();
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
			const filename = cbFilename(index);
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

	async function unionAndClipFeatures(filenameIn, filenameOut) {
		if (!filenameOut) filenameOut = filenameIn;

		let layerName = ogrCalcLayername(filenameIn);

		let cpOgrIn = getSpawn('ogr2ogr', [
			'-skipfailures',
			'-dialect', 'SQLite',
			'-sql', `SELECT ST_Union(geometry) AS geometry FROM "${layerName}"`,
			'-clipdst', todo.bundesland.filename,
			'--config', 'ATTRIBUTES_SKIP', 'YES',
			'-f', 'GeoJSONSeq',
			'-nlt', 'MultiPolygon',
			'/vsistdout/', ogrWrapFileDriver(filenameIn),
		]);
		let stream = cpOgrIn.stdout;

		let spawnArgsJQ = [
			'-cr',
			'.geometry | if .type != "MultiPolygon" then error("wrong type "+.type) else .coordinates[] | {type:"Feature",geometry:{type:"Polygon",coordinates:.}} | @json end'
		]
		let cpJQ = getSpawn('jq', spawnArgsJQ);
		cpJQ.stderr.pipe(process.stderr);
		cpJQ.on('exit', code => {
			if (code > 0) {
				console.log({ spawnArgsJQ });
				throw Error();
			}
		})
		stream.pipe(cpJQ.stdin);
		stream = cpJQ.stdout;

		let filenameTmp = calcTemporaryFilename(filenameOut)+'.geojsonl.gz';
		stream = stream.pipe(createGzip()).pipe(createWriteStream(filenameTmp));
		
		await new Promise(res => stream.on('close', res));

		let cpOgrOut = getSpawn('ogr2ogr', [
			filenameOut,
			filenameTmp,
		])
		await new Promise(res => cpOgrOut.on('close', res));
	}
})
