#!/usr/bin/env node
'use strict'



const turf = require('@turf/turf');
const config = require('../config.js');
const { processAlkis, GeoPecker } = require('../lib/geohelper.js');



let isResidential = initLookup();
let pecker = GeoPecker(config.getFilename.rulesGeoBasis('wohngebiet.gpkg'));

processAlkis({
	slug: 'gebaeudeflaeche',
	ruleTypes: 'wohngebaeude,gebaeude'.split(','),
	filenameIn: config.getFilename.alkisGeo('gebaeudeflaeche.fgb'),
	cbFeature: feature => {
		if (feature.properties.hoehe && (feature.properties.hoehe <= 2.5)) return;
		if (turf.area(feature) > 1e6) return;
		//console.log(feature.properties);
		let residential = isResidential.get(feature.properties.klasse)
		if (residential === undefined) throw Error(`Gebäudefunktion "${feature.properties.klasse}" unbekannt`);

		if (residential) {
			let p = turf.pointOnFeature(feature).geometry.coordinates;
			if (pecker(p)) return 'wohngebaeude';
		}

		return 'gebaeude';
	},
	cbWindEntries: windEntries => windEntries.every(({ wind, distance }) => distance > 10),
})



function initLookup() {
	let isResidential = new Map();
	[
		'',
		'Allgemein bildende Schule',
		'Almhütte',
		'Apotheke',
		'Aquarium, Terrarium, Voliere',
		'Ärztehaus, Poliklinik',
		'Asylbewerberheim',
		'Aussichtsturm',
		'Badegebäude für medizinische Zwecke',
		'Badegebäude',
		'Bahnhofsgebäude',
		'Bahnwärterhaus',
		'Befestigung (Burgruine)',
		'Bergwerk',
		'Berufsbildende Schule',
		'Betriebsgebäude des Güterbahnhofs',
		'Betriebsgebäude für Flugverkehr',
		'Betriebsgebäude für Schienenverkehr',
		'Betriebsgebäude für Schiffsverkehr',
		'Betriebsgebäude für Straßenverkehr',
		'Betriebsgebäude zu Verkehrsanlagen (allgemein)',
		'Betriebsgebäude zu Verkehrsanlagen (allgemein)',
		'Betriebsgebäude zur Schleuse',
		'Betriebsgebäude zur Seilbahn',
		'Betriebsgebäude',
		'Bezirksregierung',
		'Bibliothek, Bücherei',
		'Biogasanlage',
		'Bootshaus',
		'Botschaft, Konsulat',
		'Brauerei',
		'Brennerei',
		'Burg (Fliehburg, Ringwall)',
		'Burg, Festung',
		'Bürogebäude',
		'Campingplatzgebäude',
		'Dock (Halle)',
		'Dock (Halle)',
		'Drehkran',
		'Einkaufszentrum',
		'Elektrizitätswerk',
		'Empfangsgebäude des botanischen Gartens',
		'Empfangsgebäude des Zoos',
		'Empfangsgebäude Schifffahrt',
		'Empfangsgebäude',
		'Fabrik',
		'Fahrzeughalle',
		'Festsaal',
		'Feuerwachturm',
		'Feuerwehr',
		'Finanzamt',
		'Flughafengebäude',
		'Flugzeughalle',
		'Forschungsinstitut',
		'Freizeit- und Vergnügungsstätte',
		'Freizeit-, Vereinsheim, Dorfgemeinschafts-, Bürgerhaus',
		'Friedhofsgebäude',
		'Funkmast',
		'Garage',
		'Gasometer',
		'Gaststätte, Restaurant',
		'Gaswerk',
		'Gebäude an unterirdischen Leitungen',
		'Gebäude der Abfalldeponie',
		'Gebäude der Kläranlage',
		'Gebäude für andere Erholungseinrichtung',
		'Gebäude für Beherbergung',
		'Gebäude für betriebliche Sozialeinrichtung',
		'Gebäude für Bewirtung',
		'Gebäude für Bildung und Forschung',
		'Gebäude für Erholungszwecke',
		'Gebäude für Fernmeldewesen',
		'Gebäude für Forschungszwecke',
		'Gebäude für Gesundheitswesen',
		'Gebäude für Gewerbe und Industrie',
		'Gebäude für Grundstoffgewinnung',
		'Gebäude für Handel und Dienstleistungen',
		'Gebäude für kulturelle Zwecke',
		'Gebäude für Kurbetrieb',
		'Gebäude für Land- und Forstwirtschaft',
		'Gebäude für öffentliche Zwecke',
		'Gebäude für religiöse Zwecke',
		'Gebäude für Sicherheit und Ordnung',
		'Gebäude für soziale Zwecke',
		'Gebäude für Sportzwecke',
		'Gebäude für Vorratshaltung',
		'Gebäude für Wirtschaft oder Gewerbe',
		'Gebäude im botanischen Garten',
		'Gebäude im Freibad',
		'Gebäude im Stadion',
		'Gebäude im Zoo',
		'Gebäude zum Busbahnhof',
		'Gebäude zum Parken',
		'Gebäude zum S-Bahnhof',
		'Gebäude zum Sportplatz',
		'Gebäude zum U-Bahnhof',
		'Gebäude zur Abfallbehandlung',
		'Gebäude zur Abwasserbeseitigung',
		'Gebäude zur Elektrizitätsversorgung',
		'Gebäude zur Energieversorgung',
		'Gebäude zur Entsorgung',
		'Gebäude zur Freizeitgestaltung',
		'Gebäude zur Gasversorgung',
		'Gebäude zur Müllverbrennung',
		'Gebäude zur Versorgung',
		'Gebäude zur Versorgungsanlage',
		'Gebäude zur Wasserversorgung',
		'Gedenkstätte, Denkmal, Denkstein, Standbild',
		'Gemeindehaus',
		'Gericht',
		'Geschäftsgebäude',
		'Gewächshaus (Botanik)',
		'Gewächshaus (Botanik)',
		'Gewächshaus, verschiebbar',
		'Gotteshaus',
		'Gradierwerk',
		'Hallenbad',
		'Heilanstalt, Pflegeanstalt, Pflegestation',
		'Heizwerk',
		'Historische Mauer',
		'Hochbahn, Hochstraße',
		'Hochofen',
		'Hochschulgebäude (Fachhochschule, Universität)',
		'Hochschulgebäude (Fachhochschule, Universität)',
		'Hotel, Motel, Pension',
		'Hütte (mit Übernachtungsmöglichkeit)',
		'Hütte (mit Übernachtungsmöglichkeit)',
		'Hütte (ohne Übernachtungsmöglichkeit)',
		'Hütte (ohne Übernachtungsmöglichkeit)',
		'Jagdhaus, Jagdhütte',
		'Jugendfreizeitheim',
		'Jugendherberge',
		'Justizvollzugsanstalt',
		'Kantine',
		'Kapelle',
		'Kaserne',
		'Kaufhaus',
		'Kegel-, Bowlinghalle',
		'Kesselhaus',
		'Kinderkrippe, Kindergarten, Kindertagesstätte',
		'Kino',
		'Kiosk',
		'Kirche',
		'Kirchturm, Glockenturm',
		'Kloster',
		'Kontrollturm',
		'Konzertgebäude',
		'Kran',
		'Krankenhaus',
		'Kreditinstitut',
		'Kreisverwaltung',
		'Krematorium',
		'Kühlhaus',
		'Kühlturm',
		'Laden',
		'Lagerhalle, Lagerschuppen, Lagerhaus',
		'Land- und forstwirtschaftliches Betriebsgebäude',
		'Laufkran, Brückenlaufkran',
		'Leuchtturm',
		'Lokschuppen, Wagenhalle',
		'Markthalle',
		'Mast',
		'Messehalle',
		'Moschee',
		'Mühle',
		'Müllbunker',
		'Museum',
		'Nach Quellenlage nicht zu spezifizieren',
		'Obdachlosenheim',
		'Parkdeck',
		'Parkhaus',
		'Parlament',
		'Pflanzenschauhaus',
		'Polizei',
		'Portalkran',
		'Post',
		'Produktionsgebäude',
		'Pumpstation',
		'Pumpwerk (nicht für Wasserversorgung)',
		'Pumpwerk (nicht für Wasserversorgung)',
		'Radioteleskop',
		'Rathaus',
		'Reaktorgebäude',
		'Reithalle',
		'Rundfunk, Fernsehen',
		'Sägewerk',
		'Saline',
		'Sanatorium',
		'Scheune und Stall',
		'Scheune',
		'Schleusenkammer',
		'Schloss-, Burgturm',
		'Schloss',
		'Schöpfwerk',
		'Schornstein, Schlot, Esse',
		'Schuppen',
		'Schutzbunker',
		'Schutzgalerie, Einhausung',
		'Schutzhütte',
		'Sende-, Funkturm, Fernmeldeturm',
		'Seniorenfreizeitstätte',
		'Silo',
		'Solarzellen',
		'Sonstige historische Mauer',
		'Sonstiges Gebäude für Gewerbe und Industrie',
		'Sonstiges',
		'Spannwerk zur Drahtseilbahn',
		'Speditionsgebäude',
		'Speichergebäude',
		'Spielkasino',
		'Sport-, Turnhalle',
		'Sprungschanze (Anlauf)',
		'Stadion',
		'Stadt-, Torturm',
		'Stadtmauer',
		'Stall für Tiergroßhaltung',
		'Stall im Zoo',
		'Stall',
		'Stellwerk, Blockstelle',
		'Straßenmeisterei',
		'Synagoge',
		'Tank',
		'Tankstelle',
		'Tempel',
		'Theater, Oper',
		'Tiefgarage',
		'Tierschauhaus',
		'Toilette',
		'Touristisches Informationszentrum',
		'Trauerhalle',
		'Treibhaus, Gewächshaus',
		'Treibhaus',
		'Trockendock',
		'Turbinenhaus',
		'Umformer',
		'Umspannwerk',
		'Veranstaltungsgebäude',
		'Versicherung',
		'Verwaltungsgebäude',
		'Wartehalle',
		'Waschstraße, Waschanlage, Waschhalle',
		'Wasserbehälter',
		'Wassermühle',
		'Wasserturm',
		'Wasserwerk',
		'Werft (Halle)',
		'Werft (Halle)',
		'Werkstatt',
		'Wetterstation',
		'Windmühle',
		'Wirtschaftsgebäude',
		'Zollamt',
		'Zuschauertribüne, nicht überdacht',
		'Zuschauertribüne, überdacht',
		'Zuschauertribüne',
		undefined,
	].forEach(label => isResidential.set(label, false));

	[
		'Bauernhaus',
		'Ferienhaus',
		'Forsthaus',
		'Gartenhaus',
		'Gebäude für Gewerbe und Industrie mit Wohnen',
		'Gebäude für Handel und Dienstleistung mit Wohnen',
		'Gebäude für öffentliche Zwecke mit Wohnen',
		'Gemischt genutztes Gebäude mit Wohnen',
		'Kinderheim',
		'Land- und forstwirtschaftliches Wohn- und Betriebsgebäude',
		'Land- und forstwirtschaftliches Wohngebäude',
		'Schullandheim',
		'Schwesternwohnheim',
		'Seniorenheim',
		'Studenten-, Schülerwohnheim',
		'Wochenendhaus',
		'Wohn- und Betriebsgebäude',
		'Wohn- und Bürogebäude',
		'Wohn- und Geschäftsgebäude',
		'Wohn- und Verwaltungsgebäude',
		'Wohn- und Wirtschaftsgebäude',
		'Wohngebäude mit Gemeinbedarf',
		'Wohngebäude mit Gewerbe und Industrie',
		'Wohngebäude mit Handel und Dienstleistungen',
		'Wohngebäude',
		'Wohnhaus',
		'Wohnheim',
	].forEach(label => isResidential.set(label, true));

	return isResidential;
}
