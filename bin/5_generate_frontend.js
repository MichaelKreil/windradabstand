#!/usr/bin/env node
'use strict'



const fs = require('fs');
const config = require('../config.js');
const { writeWebData } = require('../lib/helper.js');

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

		'Laengengrad': true,
		'Breitengrad': true,
		'Bruttoleistung': true,
		'bundeslandAGS': true,
		'hoehe': true,
		'Inbetriebnahmedatum': true,
		'DatumBeginnVoruebergehendeStilllegung': true,
		'DatumEndgueltigeStilllegung': true,
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
		let values = windEntries.map(w => w[key] ?? null);

		switch (key) {
			case 'Breitengrad':
			case 'Laengengrad':
				values = diffEncoding(values.map(v => Math.round(v*1e5)));
			break;
			case 'Inbetriebnahmedatum':
				values = diffEncoding(values.map(v => {
					if (v === null) return v;
					v = v.split('-').map(s => parseInt(s,10));
					return v[2] + 32*v[1] + 512*v[2];
				}));
			break;
		}
		values = runLengthEncoding(values);

		result[key] = values;
		console.log(key, JSON.stringify(values).length)
	})
	//console.log(result['Inbetriebnahmedatum']);
	result = JSON.stringify(result);
	console.log(result.length);

	writeWebData('wind.json', result);
})();

async function tspSort(entries) {
	const Delaunator = (await import('delaunator')).default;

	const c = Math.cos(51*Math.PI/180);
	const points0 = entries.map((entry,index) => {
		let point = [ entry.Laengengrad*c, entry.Breitengrad ];
		return Object.assign(point, { index, group:index, count:0, entry, neighbours:[] });
	});

	let points = points0.slice();
	let segmentKeys = new Set();
	let step = 0;

	do {
		if (step++ > 100) throw Error();

		const { halfedges, hull, triangles } = Delaunator.from(points);

		let edges = [];
		for (let i = 0; i < halfedges.length; i++) {
			const j = halfedges[i];
			if (j > i) addEdge(triangles[i], triangles[j]);
		}
		for (let i = 1; i < hull.length; i++) addEdge(hull[i-1], hull[i]);
		addEdge(hull[hull.length-1], hull[0]);

		function addEdge(i0, i1) {
			if (i0 === i1) return;
			let p0 = points[i0];
			let p1 = points[i1];
			let dx = p0[0] - p1[0];
			let dy = p0[1] - p1[1];
			let d = dx*dx + dy*dy;
			edges.push({p0, p1, d});
		}

		edges.sort((a,b) => a.d - b.d);

		let maxIndex = Math.round(edges.length/5+2);

		edges.slice(0,maxIndex).forEach(edge => {
			let {p0, p1} = edge;
			if (p0.count >= 2) return;
			if (p1.count >= 2) return;
			if (p0.group === p1.group) return;
			let i0 = p0.index;
			let i1 = p1.index;
			let key = (i0 < i1) ? i0+'_'+i1 : i1+'_'+i0;
			if (segmentKeys.has(key)) return;
			segmentKeys.add(key);

			p0.count++; p0.neighbours.push(p1);
			p1.count++; p1.neighbours.push(p0);

			let p2, newGroup = p0.group;
			while (true) {
				p1.group = newGroup;
				p2 = (p1.neighbours[0] === p0) ? p1.neighbours[1] : p1.neighbours[0];
				if (!p2) break;
				p0 = p1;
				p1 = p2;
			}
		})

		points = points.filter(p => p.count < 2);
	} while (points.length > 2)

	let pStart = points[0];
	let pEnd   = points[1];
	
	let p0 = pEnd, p1 = pStart, p2, path = [pStart];
	while (true) {
		p2 = (p1.neighbours[0] === p0) ? p1.neighbours[1] : p1.neighbours[0];
		path.push(p2);
		if (p2 === pEnd) break;
		p0 = p1;
		p1 = p2;
	}

	return path.map(p => p.entry);
}

function runLengthEncoding(array) {
	let result = [], lastValue = 'zwetschenkuchen kommt bestimmt nicht vor';
	for (let i = 0; i < array.length; i++) {
		let value = array[i];
		if (value === lastValue) {
			let end = result.length-1;
			if (Array.isArray(result[end])) {
				result[end][1]++;
			} else {
				result[end] = [result[end], 2];
			}
		} else {
			result.push(value);
			lastValue = value;
		}
	}
	return result;
}

function diffEncoding(array) {
	for (let i = array.length-1; i > 0; i--) {
		if (array[i] === null) continue;
		if (array[i-1] === null) continue;
		array[i] -= array[i-1];
	}
	return array;
}
