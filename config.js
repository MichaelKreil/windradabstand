'use strict'

const fs = require('fs');
const { resolve } = require('path');

const config = {
	folders: {
		static: 'data/static',
		wind: 'data/1_wind',
		alkisCache: 'data/2_alkis/cache',
		alkisGeo: 'data/2_alkis/data',
		schutzgebiete: 'data/3_schutzgebiete',
		helper: 'data/helper',
		web: 'docs/data',
	},
	getFilename: {},
	rules: [
		// source: https://www.fachagentur-windenergie.de/fileadmin/files/PlanungGenehmigung/FA_Wind_Abstandsempfehlungen_Laender.pdf
		{ ags: 8, name:'Baden-Württemberg',      wohngebiet: 700, wohngebaeude: 700, naturschutz:200, nationalpark:200, vogelschutz:700, autobahn:100, bundesstr:40, landesstr:40, kreisstr:30, bahnlinie:50 },
		{ ags: 9, name:'Bayern',                 wohngebiet:(h,r)=>10*(h+r), wohngebaeude:(h,r)=>10*(h+r), schutzgebiet:1000, naturschutz:1000, nationalpark:1000, vogelschutz:(h,r)=>Math.max(1200,10*(h+r)), biosphaere:1000, autobahn:40, bundesstr:20, landesstr:20, kreisstr:15 },
		{ ags:11, name:'Berlin',                 },
		{ ags:12, name:'Brandenburg',            wohngebiet:1000, wohngebaeude:1000 },
		{ ags: 4, name:'Bremen',                 wohngebiet: 450, wohngebaeude: 450, autobahn:40, bundesstr:40, landesstr:40, kreisstr:40 },
		{ ags: 2, name:'Hamburg',                wohngebiet: 500, wohngebaeude: 300, naturschutz:300, vogelschutz:300, ffhabitat:200, autobahn:100, bundesstr:100, landesstr:100, kreisstr:100, bahnlinie:50, freileitung:100 },
		{ ags: 6, name:'Hessen',                 wohngebiet:1000, wohngebaeude:1000, gesundheit:1000, gewerbe:1000, denkmal:0, naturdenkmal:0, naturschutz:0, nationalpark:0, autobahn:150, bundesstr:100, landesstr:100, kreisstr:100, bahnlinie:100, freileitung:100 },
		{ ags:13, name:'Mecklenburg-Vorpommern', wohngebiet:1000, wohngebaeude: 800, gesundheit:1000, erholung:1000, denkmal:1000, naturdenkmal:1000, schutzgebiet:500, naturschutz:500, nationalpark:1000, naturpark:500, vogelschutz:500, ffhabitat:500, biosphaere:500 },
		{ ags: 3, name:'Niedersachsen',          wohngebiet: 400, wohngebaeude: 400, camping:400, autobahn:40, bundesstr:20, landesstr:20, kreisstr:20, bahnlinie:(h,r)=>1.5*(h+r), freileitung:(h,r)=>r },
		{ ags: 5, name:'Nordrhein-Westfalen',    wohngebiet:1000, wohngebaeude:1000, naturschutz:300, nationalpark:300, vogelschutz:300, ffhabitat:300, autobahn:40, bundesstr:20, freileitung:(h,r)=>r },
		{ ags: 7, name:'Rheinland-Pfalz',        wohngebiet:(h,r)=>(h+r)<200?1000:1100, wohngebaeude:500, gesundheit:800, autobahn:40, bundesstr:20, landesstr:20, kreisstr:15, freileitung:(h,r)=>3*r },
		{ ags:10, name:'Saarland',               wohngebiet: 650, wohngebaeude: 650, naturschutz:200, vogelschutz:0, ffhabitat:200, autobahn:100, bundesstr:100, landesstr:100, kreisstr:100, bahnlinie:50, bahnlinie:100, freileitung:100 },
		{ ags:14, name:'Sachsen',                wohngebiet:1000, wohngebaeude:1000 },
		{ ags:15, name:'Sachsen-Anhalt',         wohngebiet:1000, gesundheit:1200, camping:(h,r)=>Math.max(1000,10*(h+r)), gewerbe:500, erholung:1000, denkmal:1000, naturdenkmal:1000, naturschutz:200, nationalpark:1000, landschaftsschutz:500, vogelschutz:1000, ffhabitat:1000, biosphaere:1000, autobahn:200, bundesstr:200, landesstr:200, kreisstr:200, bahnlinie:200, freileitung:200 },
		{ ags: 1, name:'Schleswig-Holstein',     wohngebiet: 800, wohngebaeude:400, camping:800, gewerbe:400, naturschutz:(h,r)=>200+r, nationalpark:(h,r)=>300+r, vogelschutz:(h,r)=>300+r, ffhabitat:(h,r)=>200+r, autobahn:100, bundesstr:40, bahnlinie:100 },
		{ ags:16, name:'Thüringen',              wohngebiet:(h,r)=>(h+r)<150?750:1000, wohngebaeude:600, naturschutz:300, nationalpark:600, autobahn:40, bundesstr:20, landesstr:20, kreisstr:20, bahnlinie:40, freileitung:100 },
	],
	typicalWindTurbines: [
		{ hoehe:100, Nabenhoehe:65,  Rotordurchmesser:70  },
		{ hoehe:150, Nabenhoehe:105, Rotordurchmesser:90  },
		{ hoehe:200, Nabenhoehe:142, Rotordurchmesser:116 },
	]
}

// prepare folders
for (let name in config.folders) {
	let path = resolve(__dirname, config.folders[name]);
	config.folders[name] = path
	config.getFilename[name] = filename => resolve(path, filename);
	fs.mkdirSync(path, { recursive:true });
}

// prepare laws
let ruleLookup = new Map();
config.rules.forEach(rule => {
	const types = [
		// gebaeudeflaeche
		'wohngebaeude', // Einzelwohngebäude und Splittersiedlungen

		// siedlungsflaeche
		'wohngebiet', // Allgemeine und reine Wohngebiete
		'camping', // Campingplätze
		'erholung', // Schwerpunkträume für Tourismus, Freizeit/Erholung
		'gewerbe', // Gewerbe und Industriegebiete
		
		// grenze_flaeche
		'biosphaere', // Biosphärenreservate (§ 25 BNatSchG)
		'ffhabitat', // FFH-Gebiete (Richtlinie 92/43 EWG)
		'landschaftsschutz', // Landschaftsschutzgebiete (§ 26 BNatSchG)
		'naturschutz', // Naturschutzgebiete (§ 23 BNatSchG)
		'nationalpark', // Nationalparke (§ 24 BNatSchG)
		'naturpark', // Naturpark
		'vogelschutz', // SPA-Gebiete (Richtlinie 79/409 EWG)
		'naturdenkmal', // Naturdenkmale

		// verkehrslinie
		'autobahn', // Bundesautobahnen
		'bundesstr', // Bundesstraßen
		'landesstr', // Landesstraßen
		'kreisstr', // Kreisstraßen
		'bahnlinie', // Bahnlinien

		// versorgungslinie
		'freileitung', // Freileitungen

		// todos
		'denkmal', // Kulturdenkmale und geschützte Ensembles
		'gesundheit', // Kur und Klinikgebiete
		'schutzgebiet', // Freiraum mit bes. Schutzanspruch/Freiraumverbund/Vorrang Natur und Landschaft
	]
	Object.keys(rule).forEach(type => {
		if (type === 'ags') return // bundesland id
		if (type === 'name') return // bundesland name
		if (!types.includes(type)) throw Error('unknown rule key '+type);
		if (typeof rule[type] === 'number') {
			let v = rule[type];
			rule[type] = () => v;
		}
	})
	ruleLookup.set(rule.ags, rule);
})
config.rules = ruleLookup;



module.exports = config;
