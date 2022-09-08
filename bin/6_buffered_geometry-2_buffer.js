#!/usr/bin/env node
'use strict'



const { simpleCluster } = require('big-data-tools');
const { readFileSync, renameSync, rmSync, existsSync, createWriteStream } = require('fs');
const turf = require('@turf/turf');
const miss = require('mississippi2');
const config = require('../config.js');
const { getSpawn, calcTemporaryFilename, GzipFileWriter } = require('../lib/helper.js');
const { ogrWrapFileDriver, ogrLoadGpkgAsGeojsonStream, generateUnionVRT, unionAndClipFeatures, ogrGenerateSQL } = require('../lib/geohelper.js');
const { createGzip } = require('zlib');



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

	await todos.forEachParallel(1, runWorker);

	console.log('finished')

	process.exit();

}, async todo => {

	console.log('buffer', todo.ruleType.slug, todo.region.ags, `(${todo.bundesland.name})`);

	if (todo.radius > 0) {
		let filenameIn = todo.filenameIn + '.gpkg';

		let bbox = turf.bboxPolygon(todo.bundesland.bbox);
		bbox = turf.buffer(bbox, todo.radius, { steps: 18 });
		bbox = turf.bbox(bbox);

		let filenameTmp = todo.region.filenameBase + '.tmp.geojsonl.gz';
		if (!existsSync(filenameTmp)) {
			let stream = ogrLoadGpkgAsGeojsonStream(filenameIn, {
				dropProperties: true,
				bbox,
			});
			stream = stream
				.pipe(miss.split())
				.pipe(calcBuffer(todo.radius))
				.pipe(createGzip())
				.pipe(createWriteStream(filenameTmp));
			await new Promise(res => stream.once('close', () => res()));
		}

		return;

		const blockFilenames = [];
		stream = stream.pipe(cutIntoBlocks(
			index => todo.region.filenameBase + '.block_' + index + '.geojsonl.gz',
			async (filenameTmp, index) => {
				let filenameOut = todo.region.filenameBase + '.block_' + index + '.gpkg';
				await unionAndClipFeatures(filenameTmp, todo.bundesland.filename, filenameOut);
				rmSync(filenameTmp);

				if (existsSync(filenameOut)) blockFilenames.push(filenameOut);
			}
		))

		await new Promise(res => stream.once('close', res))

		if (blockFilenames.length === 0) {
			// do nothing
		} else if (blockFilenames.length > 1) {
			const filenameVRT = calcTemporaryFilename(todo.region.filenameBase + '.vrt');
			await generateUnionVRT(blockFilenames, filenameVRT);
			await unionAndClipFeatures(filenameVRT, todo.bundesland.filename, todo.filenameOut);

			rmSync(filenameVRT);
			blockFilenames.forEach(file => rmSync(file));

		} else {
			renameSync(blockFilenames[0], todo.filenameOut);
		}
	} else {
		throw Error();
		let filenameIn = todo.filenameIn + '.gpkg';
		let filenameTmp = calcTemporaryFilename(todo.filenameOut);

		let args = [
			'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
			'--config', 'ATTRIBUTES_SKIP', 'YES',
			'-a_srs', 'EPSG:4326',
			'-dialect', 'SQLite',
			'-sql', ogrGenerateSQL(opt),
		];
		if (filenameClip) args.push('-clipdst', filenameClip);
		args.push(
			'-f', 'GeoJSONSeq',
			'-nlt', 'MultiPolygon',
			'/vsistdout/',
			ogrWrapFileDriver(filenameIn),
		)
	
		let cp = getSpawn('ogr2ogr', [
			'--config', 'CPL_VSIL_GZIP_WRITE_PROPERTIES', 'NO',
			'--config', 'ATTRIBUTES_SKIP', 'YES',
			'-a_srs', 'EPSG:4326',
			'-dialect', 'SQLite',
			'-sql', ogrGenerateSQL({
				dropProperties:true,
				bbox:todo.bundesland.bbox,
				clipping:todo.bundesland.filename,
			}),
			'-nlt', 'MULTIPOLYGON',
			'-nln', 'layer',
			'-lco', 'GEOMETRY_NAME=geometry',
			filenameTmp,
			ogrWrapFileDriver(filenameIn),
		]);

		await new Promise(res => cp.once('close', res))

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
						this.push(JSON.stringify(f3)+'\n');
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
		let file = GzipFileWriter(cbFilename(index));

		let stream = miss.to.obj(
			async function write(line, enc, cbWrite) {
				size += line.length;
				if (size >= maxSize) {
					await file.close();
					index++;
					size = 0;
					file = GzipFileWriter(cbFilename(index));
				}
				await file.write(line + '\n');
				cbWrite();
			},
			async function flush(cbFlush) {
				await file.close();
				cbFlush();
				setTimeout(() => stream.emit('close'), 1000);
			}
		)
		return stream;
	}
})
