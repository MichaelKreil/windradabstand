#!/usr/bin/env node
'use strict'



const { simpleCluster } = require('big-data-tools');
const { resolve, dirname, basename } = require('path');
const { readFileSync, renameSync, createWriteStream, rmSync, existsSync, statSync, createReadStream, fstat, writeFileSync } = require('fs');
const { createGzip, createGunzip } = require('zlib');
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

	console.log('buffer', todo.ruleType.slug, todo.region.ags);

	let bbox = turf.bboxPolygon(todo.bundesland.bbox);
	bbox = turf.buffer(bbox, todo.radius, { steps: 18 });
	bbox = turf.bbox(bbox);

	let stream = readSource(todo.filenameIn, bbox); // read and split into lines
	
	if (todo.radius > 0) {
		stream = stream.pipe(calcBuffer(todo.radius));
		
		const files = [];
		stream = stream.pipe(cutIntoBlocks(todo.region.filenameBase, async filename => {
			await unionAndClipFeatures(filename);
			files.push(filename);
		}))

		await new Promise(res => stream.on('finish', res))
		
		console.log('files', files);

		if (files.length > 1) {
			const filenameVRT = generateUnionVRT(files, todo.region.filenameBase + '.vrt');
			await unionAndClipFeatures(filenameVRT, todo.filenameOut);
		} else {
			renameSync(files[0], todo.filenameOut);
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

		const spawnArgs = ['-spat']
			.concat(bbox.map(v => v.toString()))
			.concat(['-dialect', 'SQLite'])
			.concat(['-sql', 'SELECT geometry FROM ' + layerName]) // ignore all attributes
			.concat(['-f', 'GeoJSONSeq'])
			.concat(['/vsistdout/', filenameIn]);

		const cp = spawn('ogr2ogr', spawnArgs);
		cp.stderr.pipe(process.stderr);
		cp.on('exit', code => {
			if (code > 0) {
				console.log({ spawnArgs });
				throw Error();
			}
		})

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
					file = File();
				}
				await file.write(line + '\n');
				cbWrite();
			},
			async function flush(cbFlush) {
				await file.finish();
				cbFlush();
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
		return basename(filename).split('.').slice(0,-1).join('.');
	}

	async function unionAndClipFeatures(filenameIn, filenameOut) {
		if (!filenameOut) filenameOut = filenameIn;
		const filenameTmp = calcTemporaryFilename(filenameOut);

		if (!filenameOut.endsWith('.geojsonl.gz')) throw Error('file extension must be .geojsonl.gz');

		let layerName = calcLayername(filenameIn);

		let spawnArgsOGR = [
			//'--debug', 'ON',
			'-skipfailures',
			'-dialect', 'SQLite',
			'-sql', `SELECT ST_Union(geometry) AS geometry FROM "${layerName}"`,
			'-clipdst', todo.bundesland.filename,
			'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
			'--config', 'ATTRIBUTES_SKIP', 'YES',
			'-f', 'GeoJSONSeq',
			'-nlt', 'MultiPolygon',
			'/vsistdout/', 'GeoJSONSeq:/vsigzip/' + filenameIn,
		]


		//console.log({ spawnArgs1, layerName, bundeslandFilename, filenameIn, filenameTmp1 });
		let cpOGR = spawn('ogr2ogr', spawnArgsOGR);
		cpOGR.stderr.pipe(process.stderr);
		cpOGR.on('exit', code => {
			if (code > 0) {
				console.log({ spawnArgsOGR });
				throw Error();
			}
		})

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
		result.push(`   <OGRVRTUnionLayer name="layer">`);
		filenamesIn.forEach(filename => {
			result.push(`      <OGRVRTLayer name="${calcLayername(filename)}"><SrcDataSource>${filename}</SrcDataSource></OGRVRTLayer>`);
		})
		result.push(`   </OGRVRTUnionLayer>`);
		result.push(`</OGRVRTDataSource>`);
		writeFileSync(filenameOut, result.join('\n'));
	}
})

/*


async function extractAndBuffer(bbox, radius, layerName, filenameIn, filenameOut) {
	let filenameTmp = calcTemporaryFilename(filenameOut);
	if (!filenameOut.endsWith('.geojsonl.gz')) throw Error('file extension must be .geojsonl.gz');


	let spawnArgs = ['-spat']
		.concat(bbox.map(v => v.toString()))
		.concat(['-dialect', 'SQLite'])
		.concat(['-sql', 'SELECT geom as geometry FROM ' + layerName]) // ignore all attributes
		.concat(['-f', 'GeoJSONSeq'])
		.concat(['/vsistdout/', filenameIn]);

	let cp = spawn('ogr2ogr', spawnArgs);
	cp.stderr.pipe(process.stderr);
	cp.on('exit', code => {
		if (code > 0) {
			console.log({ spawnArgs });
			throw Error();
		}
	})

	let stream = cp.stdout;
	if (radius > 0) {
		stream = stream.pipe(miss.split());
		stream = stream.pipe(miss.through.obj(function (line, enc, next) {
			if (line.length === 0) return next();
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
						this.push(JSON.stringify(f3) + '\n');
					})
				})
			})
			next();
		}))
	}

	stream = stream.pipe(createGzip())
	stream = stream.pipe(createWriteStream(filenameTmp))

	await new Promise(res => stream.on('close', res))

	renameSync(filenameTmp, filenameOut);
}

async function clip(bundeslandFilename, filenameIn, filenameOut) {
	if (!filenameOut.endsWith('.geojsonl.gz')) throw Error('file extension must be .geojsonl.gz');

	let filenameTmp1 = calcTemporaryFilename(filenameOut);

	let spawnArgs1 = [
		//'--debug', 'ON',
		'-clipdst', bundeslandFilename,
		'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
		'--config', 'ATTRIBUTES_SKIP', 'YES',
		'-f', 'GeoJSONSeq',
		'/vsigzip/' + filenameTmp1, 'GeoJSONSeq:/vsigzip/' + filenameIn,
	]
	let cp1 = spawn('ogr2ogr', spawnArgs1);
	cp1.stderr.pipe(process.stderr);
	cp1.on('exit', code => {
		if (code > 0) {
			console.log({ todo, spawnArgs1 });
			throw Error();
		}
	})

	await new Promise(res => cp1.on('close', res))

	renameSync(filenameTmp1, filenameOut);
}
*/
