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
		mapGroup: 'data/4_map_result/group',
		mapFeature: 'data/4_map_result/feature',
		bufferedGeometry: 'data/6_buffered_geometry',
		helper: 'data/helper',
		webData: 'docs/data',
		webAssets: 'docs/assets',
		tiles: 'docs/tiles',
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
			landesstr: 40,
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

			autobahn: 40,
			bundesstr: 20,
			landesstr: 20,
			kreisstr: 15,
		},
		{ ags: 11, name: 'Berlin',
			wohngebiet: 0, // Lärmschutz
			wohngebaeude: 0,
		},
		{ ags: 12, name: 'Brandenburg',
			// Quelle: https://www.parlamentsdokumentation.brandenburg.de/parladoku/w7/drs/ab_4500/4559.pdf
			wohngebaeude: 1000,
			wohngebiet: 0,
			vogelschutz: 0,
			ffhabitat: 0,

			autobahn: 40,
			bundesstr: 20,
			landesstr: 20,
			kreisstr: 20,
		},
		{ ags: 4, name: 'Bremen',
			wohngebiet: 450,
			wohngebaeude: 450,

			autobahn: 40,
			bundesstr: 40,
			landesstr: 40,
			kreisstr: 40,
			// 2000m Abstand zur Flughafen-Landebahn?
		},
		{ ags: 2, name: 'Hamburg',
			wohngebiet: 500,
			wohngebaeude: 300,
			naturschutz: 300,
			vogelschutz: 300,
			ffhabitat: 200,
			autobahn: 40,
			bundesstr: 20,
			landesstr: 100,
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
			landesstr: 100,
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
			autobahn: 40,
			bundesstr: 20,
			landesstr: 20,
			kreisstr: 20,
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
			autobahn: 40,
			bundesstr: 20,
			freileitung: (h, r) => r,
		},
		{ ags: 7, name: 'Rheinland-Pfalz',
			// Quelle: https://mdi.rlp.de/de/unsere-themen/landesplanung/landesentwicklungsprogramm/vierte-teilfortschreibung/
			wohngebiet: 900,
			wohngebaeude: 500,
			autobahn: 40,
			bundesstr: 20,
			landesstr: 20,
			kreisstr: 15,
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
			landesstr: 100,
			kreisstr: 50,
			bahnlinie: 100,
			freileitung: 100,
		},
		{ ags: 14, name: 'Sachsen',
			// https://www.revosax.sachsen.de/vorschrift_gesamt/1779/44172.html (nicht mehr erreichbar)

			// https://www.mdr.de/nachrichten/deutschland/politik/windkraft-abstandsregel-laender-oeffnungsklausel-100.html
			wohngebaeude:(h + r) <= 150 ? 750 : 1000,
			wohngebiet: 0,
			naturschutz: 0,
			naturpark: 0,
			nationalpark: 0,
			biosphaere: 0,
			gewerbe: 0,
		},
		{ ags: 15, name: 'Sachsen-Anhalt',
			wohngebiet: 1000,
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
			landesstr: 200,
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
			autobahn: 40,
			bundesstr: 200,
			landesstr: 20,
			kreisstr: 15,
			bahnlinie: 100,
		},
		{ ags: 16, name: 'Thüringen',
			wohngebiet: (h, r) => (h + r) < 150 ? 750 : 1000,
			wohngebaeude: 600,
			naturschutz: 300,
			nationalpark: 600,
			autobahn: 40,
			bundesstr: 20,
			landesstr: 20,
			kreisstr: 20,
			bahnlinie: 40,
			freileitung: 100,
		},
	],
	ruleTypes: [
		// gebaeudeflaeche
		{ slug:'wohngebaeude', name:'Einzelwohngebäude und Splittersiedlungen' },

		// siedlungsflaeche
		{ slug:'wohngebiet', name:'Allgemeine und reine Wohngebiete' },
		{ slug:'camping', name:'Campingplätze' },
		{ slug:'erholung', name:'Schwerpunkträume für Tourismus, Freizeit/Erholung' },
		{ slug:'gewerbe', name:'Gewerbe und Industriegebiete' },
		
		// grenze_flaeche
		{ slug:'biosphaere', name:'Biosphärenreservate (§ 25 BNatSchG)' },
		{ slug:'ffhabitat', name:'FFH-Gebiete (Richtlinie 92/43 EWG)' },
		{ slug:'landschaftsschutz', name:'Landschaftsschutzgebiete (§ 26 BNatSchG)' },
		{ slug:'naturschutz', name:'Naturschutzgebiete (§ 23 BNatSchG)' },
		{ slug:'nationalpark', name:'Nationalparke (§ 24 BNatSchG)' },
		{ slug:'naturpark', name:'Naturpark' },
		{ slug:'vogelschutz', name:'SPA-Gebiete (Richtlinie 79/409 EWG)' },
		{ slug:'naturdenkmal', name:'Naturdenkmale' },

		// verkehrslinie
		{ slug:'autobahn', name:'Bundesautobahnen' },
		{ slug:'bundesstr', name:'Bundesstraßen' },
		{ slug:'landesstr', name:'Landesstraßen' },
		{ slug:'kreisstr', name:'Kreisstraßen' },
		{ slug:'bahnlinie', name:'Bahnlinien' },

		// versorgungslinie
		{ slug:'freileitung', name:'Freileitungen' },

		// todos
		//{ slug:'denkmal', name:'Kulturdenkmale und geschützte Ensembles' },
		/*{ slug:'gesundheit', name:'Kur und Klinikgebiete' },*/
		/*{ slug:'schutzgebiet', name:'Freiraum mit bes. Schutzanspruch/Freiraumverbund/Vorrang Natur und Landschaft' },*/
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
	config.getFilename[name] = filename => resolve(path, filename);
	fs.mkdirSync(path, { recursive:true });
}

// prepare laws
let ruleLookup = new Map();
let ruleTypeLookup = new Set(config.ruleTypes.map(r => r.slug))
config.rules.forEach(rule => {
	Object.keys(rule).forEach(type => {
		if (type === 'ags') return // bundesland id
		if (type === 'name') return // bundesland name
		if (!ruleTypeLookup.has(type)) throw Error('unknown rule key '+type);
		if (typeof rule[type] === 'number') {
			let v = rule[type];
			let f = function () { return v }
			Object.defineProperty(f, 'name', {value: type, writable: false});
			rule[type] = f;
		}
	})
	ruleLookup.set(rule.ags, rule);
})
config.rules = ruleLookup;



module.exports = config;
