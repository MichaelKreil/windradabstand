'use strict'

const fs = require('fs');
const zlib = require('zlib');
const config = require('../config.js');

(async () => {
	let windEntries = JSON.parse(fs.readFileSync(config.getFilename.wind('wind.json')));
	'gebaeudeflaeche,siedlungsflaeche,grenze_flaeche,verkehrslinie,versorgungslinie'
	.split(',').forEach(slug => {
		JSON.parse(fs.readFileSync(config.getFilename.alkisResult(slug+'.json'))).forEach(link => {
			let windEntry = windEntries[link.index];
			Object.entries(link.minDistance).forEach(([key,val]) => {
				key = 'min_'+key;
				val = Math.floor(val);
				if ((windEntry[key] === undefined) || (windEntry[key] > val)) {
					windEntry[key] = val;
				}
			})
		})
	})

	windEntries = await tspSort(windEntries);

	const keys = {
		'Bundesland': false,
		'bundeslandName': false,
		'DatumBeginnVoruebergehendeStilllegung': false,
		'DatumEndgueltigeStilllegung': false,
		'DatumLetzteAktualisierung': false,
		'DatumWiederaufnahmeBetrieb': false,
		'EegMaStRNummer': false,
		'EinheitMastrNummer': false,
		'Energietraeger': false,
		'Gemeinde': false,
		'Gemeindeschluessel': false,
		'GenMastrNummer': false,
		'GeplantesInbetriebnahmedatum': false,
		'Land': false,
		'Landkreis': false,
		'LokationMaStRNummer': false,
		'NameStromerzeugungseinheit': false,
		'Nettonennleistung': false,
		'Postleitzahl': false,
		'Registrierungsdatum': false,

		'Breitengrad': true,
		'Bruttoleistung': true,
		'bundeslandAGS': true,
		'hoehe': true,
		'Inbetriebnahmedatum': true,
		'Laengengrad': true,
		'min_autobahn': true,
		'min_bahnlinie': true,
		'min_biosphaere': true,
		'min_bundesstr': true,
		'min_camping': true,
		'min_erholung': true,
		'min_ffhabitat': true,
		'min_freileitung': true,
		'min_gewerbe': true,
		'min_kreisstr': true,
		'min_landesstr': true,
		'min_landschaftsschutz': true,
		'min_nationalpark': true,
		'min_naturdenkmal': true,
		'min_naturpark': true,
		'min_naturschutz': true,
		'min_vogelschutz': true,
		'min_wohngebaeude': true,
		'min_wohngebiet': true,
		'Nabenhoehe': true,
		'Rotordurchmesser': true,
	}

	windEntries.forEach((w,i) => {
		Object.keys(w).forEach(key => {
			if (keys[key] === undefined) throw Error('unknown key '+key);
		})
	})
	let result = {};
	Object.entries(keys).forEach(([key,use]) => {
		if (!use) return;
		result[key] = windEntries.map(w => w[key]);
	})
	result = JSON.stringify(result);
	//console.log(result);
	//result = result.replaceAll('null','');
	console.log(result.length);
	console.log(zlib.gzipSync(result, {level:9}).length);
})();

async function tspSort(entries) {
	const Delaunator = (await import('delaunator')).default;

	const c = Math.cos(51*Math.PI/180);
	const points0 = entries.map((e,i) => [e.Laengengrad/c, e.Breitengrad, i, 0, e]);

	let points = points0.slice();
	let path = new Map();
	let time0 = Date.now();
	let step = 0;

	do {
		if (step > 0) console.log([
			points.length,
			path.size,
			step,
			(Date.now()-time0)/step
		].join('\t'));
		step++;

		const { halfedges, hull, triangles } = Delaunator.from(points);

		let edges = [];
		for (let i = 0; i < halfedges.length; i++) {
			const j = halfedges[i];
			if (j > i) addEdge(triangles[i], triangles[j]);
		}
		for (let i = 1; i < hull.length; i++) addEdge(hull[i-1], hull[i]);
		addEdge(hull[hull.length-1], hull[0]);

		if (points.length === 6) {
			console.dir({hull,halfedges,triangles, points}, {depth:3, colors:true});
			console.table(points.map(p => p[4]));
			process.exit();
		}

		function addEdge(i0, i1) {
			if (i0 === i1) return;
			let p0 = points[i0];
			let p1 = points[i1];
			let dx = p0[0] - p1[0];
			let dy = p0[1] - p1[1];
			let d = dx*dx + dy*dy;
			edges.push([p0, p1, d]);
		}

		edges.sort((a,b) => a[2] - b[2]);

		edges.forEach(([p0, p1]) => {
			if (p0[3] >= 2) return;
			if (p1[3] >= 2) return;
			let i0 = p0[2];
			let i1 = p1[2];
			let key = (i0 < i1) ? i0+'_'+i1 : i1+'_'+i0;
			if (path.has(key)) return;
			path.set(key, [p0,p1]);
			p0[3]++;
			p1[3]++;
		})

		points = points.filter(p => p[3] < 2);
	} while (points.length > 0)

	path = Array.from(path.values());
	console.log(path.pop());
	let [ p0, p1 ] = path.pop();



	console.log(p0, p1);

	process.exit();
	//let distances = [];

	let sum = calcDistance(path[0], path[n-1]) + calcDistance(path[n-2], path[n-1]);
	for (let i = 0; i < n-1; i++) sum += calcDistance(path[i], path[i+1]);
	console.log(sum);

	let ar, br = 0, maxI = 1e9;
	for (let i = 0; i < maxI; i++) {
		if (i % 1e6 === 0) process.stderr.write('\r'+(100*i/maxI).toFixed(1)+'%')

		let dr = Math.floor(Math.pow(Math.random(),6)*n/2)+1;
		ar = br;
		br = (ar + dr) % n;

		let a0,a1,a2,b0,b1,b2,d1,d2
		switch (dr) {
			case 1:
				a0 = path[ ar       ];
				b0 = path[ br       ]; // <= ar+1
				b1 = path[(br+1) % n]; // <= br+1
				b2 = path[(br+2) % n];
				d1 = calcDistance(a0, b0) + calcDistance(b1, b2);
				d2 = calcDistance(a0, b1) + calcDistance(b0, b2);
				if (d1 <= d2) continue;
			case 2:
				a0 = path[ ar       ];
				a1 = path[(ar+1) % n]; // <= ar+1
				b0 = path[ br       ];
				b1 = path[(br+1) % n]; // <= br+1
				b2 = path[(br+2) % n];
				d1 = calcDistance(a0, a1) + calcDistance(a1, b0) + calcDistance(b0, b1) + calcDistance(b1, b2);
				d2 = calcDistance(a0, b1) + calcDistance(b1, b0) + calcDistance(b0, a1) + calcDistance(a1, b2);
				if (d1 <= d2) continue;
			default:
				a0 = path[ ar       ];
				a1 = path[(ar+1) % n];
				a2 = path[(ar+2) % n];
				b0 = path[ br       ];
				b1 = path[(br+1) % n];
				b2 = path[(br+2) % n];
				d1 = calcDistance(a0, a1) + calcDistance(a1, a2) + calcDistance(b0, b1) + calcDistance(b1, b2);
				d2 = calcDistance(a0, b1) + calcDistance(b1, a2) + calcDistance(b0, a1) + calcDistance(a1, b2);
				if (d1 <= d2) continue;
		}

		let t = path[(ar+1) % n];
		path[(ar+1) % n] = path[(br+1) % n];
		path[(br+1) % n] = t;
	}

	sum = calcDistance(path[0], path[n-1]) + calcDistance(path[n-2], path[n-1]);
	for (let i = 0; i < n-1; i++) sum += calcDistance(path[i], path[i+1]);
	console.log(sum);
	process.exit();

	function calcDistance(i0, i1) {
		let p0 = entries[i0 % n].point;
		let p1 = entries[i1 % n].point;
		let dx = p0[0] - p1[0];
		let dy = p0[1] - p1[1];
		return Math.sqrt(dx*dx + dy*dy);
	}
}
