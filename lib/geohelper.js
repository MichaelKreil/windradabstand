'use strict'

const fs = require('fs');
const config = require('../config.js');
const turf = require('@turf/turf');



const tiny = 1e-5; // tiny distance, e.g. 1e-5 = 1m



module.exports = {
	BundeslandFinder,
}



function BundeslandFinder() {
	let gridScale = 100; // 100 = 1km
	let filenameCache = config.getFilename.helper('bundeslandFinder.json');

	if (!fs.existsSync(filenameCache)) {
		let bundeslaender = fs.readFileSync(config.getFilename.static('bundeslaender.geojson'));
		bundeslaender = JSON.parse(bundeslaender);
		bundeslaender.features.forEach((bundesland, index) => {
			bundesland.properties = Object.fromEntries(
				Object.entries(
					bundesland.properties
				).map(e => [e[0].toLowerCase(), e[1]])
			)
			bundesland.properties.index = index;
			switch (bundesland.properties.AGS) {
				case '01': bundesland.properties.name = 'Schleswig-Holstein'; break;
				case '02': bundesland.properties.name = 'Hamburg'; break;
				case '03': bundesland.properties.name = 'Niedersachsen'; break;
				case '04': bundesland.properties.name = 'Bremen'; break;
				case '05': bundesland.properties.name = 'Nordrhein-Westfalen'; break;
				case '06': bundesland.properties.name = 'Hessen'; break;
				case '07': bundesland.properties.name = 'Rheinland-Pfalz'; break;
				case '08': bundesland.properties.name = 'Baden-Württemberg'; break;
				case '09': bundesland.properties.name = 'Bayern'; break;
				case '10': bundesland.properties.name = 'Saarland'; break;
				case '11': bundesland.properties.name = 'Berlin'; break;
				case '12': bundesland.properties.name = 'Brandenburg'; break;
				case '13': bundesland.properties.name = 'Mecklenburg-Vorpommern'; break;
				case '14': bundesland.properties.name = 'Sachsen'; break;
				case '15': bundesland.properties.name = 'Sachsen-Anhalt'; break;
				case '16': bundesland.properties.name = 'Thüringen'; break;
				default: return
			}
		})

		let grid = new Map();
		let features = turf.flatten(bundeslaender);
		let fullarea = turf.area(features);
		let area = 0;
		features.features.forEach(polygon => {
			let bbox = turf.bbox(polygon);

			let x0 = Math.floor(bbox[0] * gridScale);
			let y0 = Math.floor(bbox[1] * gridScale);
			let x1 = Math.floor(bbox[2] * gridScale);
			let y1 = Math.floor(bbox[3] * gridScale);

			splitRecursive(polygon, x0,y0,x1,y1);

			function splitRecursive(part, x0,y0,x1,y1) {
				if (!part) return;
				//console.log(`splitRecursive(${turf.area(part)}, ${x0},${y0},${x1},${y1}`)

				if ((x0 === x1) && (y0 === y1)) {
					// single grid cell
					area += turf.area(part);
					process.stdout.write('\r' + (100 * Math.min(1,area / fullarea)).toFixed(1) + '% - '+polygon.properties.gen+'\x1b[K');

					turf.truncate(part, { precision:5, coordinates:2, mutate:true })
					part.properties = polygon.properties.index;
					let key = x0 + '_' + y0;
					if (!grid.has(key)) grid.set(key, []);
					grid.get(key).push(part);

					return
				}
				//console.log(`splitRecursive(${turf.area(part)}, ${x0},${y0},${x1},${y1}`)

				if (y1-y0 > x1-x0) {
					//split horizontal
					let yc = Math.floor((y0+y1)/2);
					split(x0, y0  , x1, yc);
					split(x0, yc+1, x1, y1);
				} else {
					//split vertical
					let xc = Math.floor((x0+x1)/2);
					split(x0  , y0, xc, y1);
					split(xc+1, y0, x1, y1);
				}

				function split(x0,y0,x1,y1) {
					//console.log(`split(${x0},${y0},${x1},${y1})`)
					let box = turf.bboxPolygon([
						(x0  ) / gridScale - tiny,
						(y0  ) / gridScale - tiny,
						(x1+1) / gridScale + tiny,
						(y1+1) / gridScale + tiny,
					])
					splitRecursive(turf.intersect(box, part), x0,y0,x1,y1);
				}
			}
		})

		console.log();

		let data = {
			bundeslaender: bundeslaender.features.map(b => b.properties),
			grid:Array.from(grid.entries()),
		}
		fs.writeFileSync(filenameCache, JSON.stringify(data));
	}
	
	let data = JSON.parse(fs.readFileSync(filenameCache));
	data.grid.forEach(entries => {
		entries[1].forEach(entry => {
			entry.properties = data.bundeslaender[entry.properties];
		})
	})
	let grid = new Map(data.grid);

	return (lng, lat) => {
		let point = [lng, lat]
		let x = Math.floor(lng * gridScale);
		let y = Math.floor(lat * gridScale);
		let key = x + '_' + y;
		if (!grid.has(key)) return false;
		let result = grid.get(key).filter(polygon => turf.booleanPointInPolygon(point, polygon));
		if (result.length === 1) return result[0];
		if (result.length === 0) return false;
		throw Error('polygons overlapping?');
	}
}
