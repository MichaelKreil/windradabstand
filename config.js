'use strict'



const fs = require('fs');
const { resolve } = require('path');



const config = {
	bbox: [ 5.8, 47.2, 15.1, 55.1 ],
	maxMapZoomLevel: 14,
	folders: {
		static: 'data/static',
		wind: 'data/1_wind',
		alkisCache: 'data/2_alkis/cache',
		alkisGeo: 'data/2_alkis/data',
		andereGebiete: 'data/3_andere_gebiete',
		otherCache: 'data/cache',
		rulesGeoBasis: 'data/4_rules_geo_basis',
		bufferedGeometry: 'data/6_buffered_geometry',
		helper: 'data/helper',
		webData: 'docs/data',
		webAssets: 'docs/assets',
		tiles: 'docs/tiles',
		temporary: 'data/tmp',
	},
	getFilename: {},
	/*
		Zeitreihen zur Entwicklung der erneuerbaren Energien:
			- https://www.erneuerbare-energien.de/EE/Navigation/DE/Service/Erneuerbare_Energien_in_Zahlen/Zeitreihen/zeitreihen.html
			- https://www.erneuerbare-energien.de/EE/Navigation/DE/Service/Erneuerbare_Energien_in_Zahlen/Entwicklung/entwicklung-der-erneuerbaren-energien-in-deutschland.html

	*/
	rules: [
		/*
			Hauptquelle:
				https://www.fachagentur-windenergie.de/fileadmin/files/PlanungGenehmigung/FA_Wind_Abstandsempfehlungen_Laender.pdf
			
			Als Abstandswerte (in Metern) sind möglich:
				- eine Zahl
				- eine Funktion der Form: (h,r) => {…}, wobei h = Nabenhoehe und r = Rotorradius
		*/
		{ ags: 8, name: 'Baden-Württemberg',
			// Quelle: https://um.baden-wuerttemberg.de/fileadmin/redaktion/m-um/intern/Dateien/Dokumente/5_Energie/Erneuerbare_Energien/Windenergie/Windenergieerlass_BW.pdf
			wohngebaeude: 700,
			wohngebiet: 700,

			naturschutz: 200,
			nationalpark: 200,
			vogelschutz: 700,

			autobahn: 100,
			bundesstr: 40,
			landstr: 40,
			kreisstr: 30,

			bahnlinie: 50,
			freileitung: (h, r) => r * 3,
		},
		{ ags: 9, name: 'Bayern',
			wohngebaeude: (h, r) => 10 * (h + r),
			wohngebiet: (h, r) => 10 * (h + r),

			naturschutz: 1000,
			nationalpark: 1000,
			vogelschutz: (h, r) => Math.max(1200, 10 * (h + r)),
			biosphaere: 1000,
		},
		{ ags: 11, name: 'Berlin',
			autobahn: 40,
			bundesstr: 20,
		},
		{ ags: 12, name: 'Brandenburg',
			// Quelle: https://www.parlamentsdokumentation.brandenburg.de/parladoku/w7/drs/ab_4500/4559.pdf
			wohngebaeude: 1000,
			
			vogelschutz: 0,
			ffhabitat: 0,
		},
		{ ags: 4, name: 'Bremen',
			wohngebiet: 450,
			wohngebaeude: 450,

			landstr: 40,
			kreisstr: 40,
			// 2000m Abstand zur Flughafen-Landebahn?
		},
		{ ags: 2, name: 'Hamburg',
			wohngebiet: 500,
			wohngebaeude: 300,
			naturschutz: 300,
			vogelschutz: 300,
			ffhabitat: 200,
			
			landstr: 100,
			kreisstr: 100,
			bahnlinie: 50,
			freileitung: 100,
		},
		{ ags: 6, name: 'Hessen',
			wohngebiet: 1000,
			wohngebaeude: 1000,
			gewerbe: 1000,
			naturdenkmal: 0,
			naturschutz: 0,
			nationalpark: 0,

			autobahn: 150,
			bundesstr: 100,
			landstr: 100,
			kreisstr: 100,

			bahnlinie: 100,
			freileitung: 100,
		},
		{ ags: 13, name: 'Mecklenburg-Vorpommern',
			wohngebiet: 1000,
			wohngebaeude: 800,
			erholung: 1000,
			naturschutz: 500,
			nationalpark: 1000,
			naturpark: 500,
			vogelschutz: 500,
			ffhabitat: 500,
			biosphaere: 500,
		},
		{ ags: 3, name: 'Niedersachsen',
			// Quelle: https://www.stk.niedersachsen.de/download/174262/Windenergieerlass.pdf
			
			wohngebiet: (h, r) => Math.max(400, 2 * (h + r)),
			wohngebaeude: (h, r) => Math.max(400, 2 * (h + r)),
			camping: (h, r) => Math.max(400, 2 * (h + r)),
			
			bahnlinie: (h, r) => 1.5 * (h + r),

			naturschutz: 0,
			nationalpark: 0,
			naturdenkmal: 0,
			biosphaere: 0,
			landschaftsschutz: 0,
		},
		{ ags: 5, name: 'Nordrhein-Westfalen',
			wohngebiet: 1000,
			wohngebaeude: 1000,
			naturschutz: 300,
			nationalpark: 300,
			vogelschutz: 300,
			ffhabitat: 300,
		},
		{ ags: 7, name: 'Rheinland-Pfalz',
			// Quelle: https://mdi.rlp.de/de/unsere-themen/landesplanung/landesentwicklungsprogramm/vierte-teilfortschreibung/
			wohngebiet: 900,
			wohngebaeude: 500,
			
			freileitung: (h, r) => 3 * r,

			nationalpark: 0,
			naturschutz: 0,
			biosphaere: 0,
			naturdenkmal: 0,
		},
		{ ags: 10, name: 'Saarland',
			wohngebiet: 650,
			wohngebaeude: 650,
			naturschutz: 200,
			vogelschutz: 0,
			ffhabitat: 200,

			autobahn: 100,
			bundesstr: 100,
			landstr: 100,
			kreisstr: 50,
			
			bahnlinie: 100,
			freileitung: 100,
		},
		{ ags: 14, name: 'Sachsen',
			// https://www.revosax.sachsen.de/vorschrift_gesamt/1779/44172.html (nicht mehr erreichbar)

			// https://www.mdr.de/nachrichten/deutschland/politik/windkraft-abstandsregel-laender-oeffnungsklausel-100.html
			wohngebaeude: (h, r) => (h + r <= 150) ? 750 : 1000,
			naturschutz: 0,
			naturpark: 0,
			nationalpark: 0,
			biosphaere: 0,
			gewerbe: 0,
			ffhabitat: 0,
			
			bahnlinie: 40,
			freileitung: (h, r) => 3 * r,
		},
		{ ags: 15, name: 'Sachsen-Anhalt',
			wohngebiet: 1000,
			wohngebaeude: 400,
			camping: (h, r) => Math.max(1000, 10 * (h + r)),
			gewerbe: 500,
			erholung: 1000,
			naturdenkmal: 1000,
			naturschutz: 200,
			nationalpark: 1000,
			landschaftsschutz: 500,
			vogelschutz: 1000,
			ffhabitat: 1000,
			biosphaere: 1000,
			
			autobahn: 200,
			bundesstr: 200,
			landstr: 200,
			kreisstr: 200,

			bahnlinie: 200,
			freileitung: 200,
		},
		{ ags: 1, name: 'Schleswig-Holstein',
			wohngebiet: 800,
			wohngebaeude: 400,
			camping: 800,
			gewerbe: 400,
			naturschutz: (h, r) => 200 + r,
			nationalpark: (h, r) => 300 + r,
			vogelschutz: (h, r) => 300 + r,
			ffhabitat: (h, r) => 200 + r,
			
			bahnlinie: 100,
		},
		{ ags: 16, name: 'Thüringen',
			wohngebiet: (h, r) => (h + r) < 150 ? 750 : 1000,
			wohngebaeude: 600,
			naturschutz: 300,
			nationalpark: 600,
			
			bahnlinie: 40,
			freileitung: 100,
		},
	],
	ruleTypes: [
		// gebaeudeflaeche
		{ slug: 'gebaeude', name: 'Gebäude', default: 0 },
		{ slug: 'wohngebaeude', name: 'Einzelwohngebäude und Splittersiedlungen', default: 400 }, // Lärmschutz

		// siedlungsflaeche
		{ slug: 'wohngebiet', name: 'Allgemeine und reine Wohngebiete', default: 0 }, // Lärmschutz
		{ slug: 'camping', name: 'Campingplätze' },
		{ slug: 'erholung', name: 'Schwerpunkträume für Tourismus, Freizeit/Erholung' },
		{ slug: 'gewerbe', name: 'Gewerbe und Industriegebiete' },

		// grenze_flaeche
		{ slug: 'biosphaere', name: 'Biosphärenreservate (§ 25 BNatSchG)' },
		{ slug: 'ffhabitat', name: 'FFH-Gebiete (Richtlinie 92/43 EWG)' },
		{ slug: 'landschaftsschutz', name: 'Landschaftsschutzgebiete (§ 26 BNatSchG)' },
		{ slug: 'naturschutz', name: 'Naturschutzgebiete (§ 23 BNatSchG)' },
		{ slug: 'nationalpark', name: 'Nationalparke (§ 24 BNatSchG)' },
		{ slug: 'naturpark', name: 'Naturpark' },
		{ slug: 'vogelschutz', name: 'SPA-Gebiete (Richtlinie 79/409 EWG)' },
		{ slug: 'naturdenkmal', name: 'Naturdenkmale' },

		// verkehrslinie
		{ slug: 'autobahn', name: 'Bundesautobahnen', default: 40 }, // Quelle: https://www.gesetze-im-internet.de/fstrg/__9.html
		{ slug: 'bundesstr', name: 'Bundesstraßen', default: 20 }, // Quelle: https://www.gesetze-im-internet.de/fstrg/__9.html
		{ slug: 'landstr', name: 'Landesstraßen', default: 20 },
		{ slug: 'kreisstr', name: 'Kreisstraßen', default: 20 },
		{ slug: 'bahnlinie', name: 'Bahnlinien' },

		// versorgungslinie
		{ slug: 'freileitung', name: 'Freileitungen', default: (h, r) => r },

		// vegetation
		{ slug: 'wald', name: 'Wald' },

		// gewaesser
		{ slug: 'gewaesser', name: 'Gewässer', default: 0 },
		{ slug: 'gewaesser_1ha', name: 'stehende Gewässer größer 1 ha' },

		// verkehrsflaeche
		{ slug: 'verkehrsflaeche', name: 'Verkehrsfläche', default: 0 },
		{ slug: 'militaerisch', name: 'Militärische Nutzung' },
		{ slug: 'flugplaetze', name: 'Flughäfen, Flugplätze, Landeplätze, Segelfluggelände, ...' },
		
		// sonstiges
		{ slug: 'seismisch', name: 'seismische Messstationen', default: 0 },
		{ slug: 'dvor', name: 'Drehfunkfeuer' },
	],
	typicalWindTurbines: [
		//{ level:0, color:'#e30613', hoehe:100, Nabenhoehe: 65, Rotordurchmesser: 70 },
		//{ level:1, color:'#e74011', hoehe:150, Nabenhoehe:105, Rotordurchmesser: 90 },
		//{ level:2, color:'#ec6608', hoehe:200, Nabenhoehe:142, Rotordurchmesser:116 },
		{ level: 0, color: '#e30613', hoehe: 200, Nabenhoehe: 142, Rotordurchmesser: 116 },
	]
}

// prepare folders
for (let name in config.folders) {
	let path = resolve(__dirname, config.folders[name]);
	config.folders[name] = path
	config.getFilename[name] = filename => resolve(path, filename || randomName());
	fs.mkdirSync(path, { recursive: true });
	
	function randomName() {
		return 'tmp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + '.tmp';
	}
}

// prepare laws
let ruleLookup = new Map();
let ruleTypeLookup = new Set(config.ruleTypes.map(r => r.slug))

// prepare ruleType defaults
config.ruleTypes.forEach(ruleTypeDef => {
	let def = ruleTypeDef.default;
	switch (typeof def) {
		case 'undefined': /*ok*/ break;
		case 'number': ruleTypeDef.default = () => def; break;
		case 'function': /*ok*/ break;
		default: throw Error();
	}
})

// prepare rules
config.rules.forEach(rule => {
	Object.keys(rule).forEach(key => {
		if (key === 'ags') return // bundesland id
		if (key === 'name') return // bundesland name
		if (!ruleTypeLookup.has(key)) throw Error('unknown rule type key: ' + key);

		let def = rule[key];
		switch (typeof def) {
			case 'undefined': /*ok*/ break;
			case 'number': rule[key] = () => def; break;
			case 'function': /*ok*/ break;
			default: throw Error();
		}
	})

	config.ruleTypes.forEach(ruleTypeDef => {
		let def0 = ruleTypeDef.default;
		let key = ruleTypeDef.slug;

		if (def0 !== undefined) {
			let def1 = rule[key];
			if (def1 === undefined) {
				rule[key] = def0;
			} else {
				// if both are defined, take the maximum result
				rule[key] = (h, r) => Math.max(def0(h, r), def1(h, r));
			}
		}

		if (rule[key] === undefined) return;

		Object.defineProperty(rule[key], 'name', { value: key, writable: false });
	})

	ruleLookup.set(rule.ags, rule);
})
config.rules = ruleLookup;



module.exports = config;
