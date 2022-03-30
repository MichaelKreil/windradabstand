'use strict'


const fs = require('fs');
const child_process = require('child_process');
const Havel = require('havel');
const turf = require('@turf/turf');
const gdal = require('gdal-next');
const config = require('../config.js');



start()

async function start() {
	let index = 0;
	let filename = config.getFile.data('buildings.gpkg');
	let filenameTemp = config.getFile.temp();

	Havel.pipeline()
		.readFile(config.getFile.src('Gebaeudeflaeche.geojsonl.xz'), { showProgress: true })
		.decompressXZ()
		.split()
		.map(geoJson => {
			if (geoJson.length === 0) return '';
			geoJson = JSON.parse(geoJson);
			if (turf.area(geoJson) > 1e6) return '';
			index++;
			geoJson.properties = {
				fid: index,
				type: geoJson.properties.gebaeudefunktion,
				height: geoJson.properties.hoehe,
				residential: isResidential(geoJson.properties.gebaeudefunktion),
			}
			return JSON.stringify(geoJson);
		})
		.join()
		.writeFile(filenameTemp)
		.finished(() => {
			if (fs.existsSync(filename)) fs.unlinkSync(filename);
			child_process.spawnSync('ogr2ogr', [
				'-f','GPKG',
				'-s_srs','EPSG:4326',
				'-t_srs','EPSG:4326',
				'-nln', 'buildings',
				'-overwrite',
				config.getFile.data('buildings.gpkg'),
				'GeoJSONSeq:'+filenameTemp,
			], { stdio:'inherit' })
			fs.unlinkSync(filenameTemp)
		})
}

function isResidential(type) {
	switch (type) {
		case 'Allgemein bildende Schule':
		case 'Almhütte':
		case 'Apotheke':
		case 'Aquarium, Terrarium, Voliere':
		case 'Asylbewerberheim':
		case 'Badegebäude für medizinische Zwecke':
		case 'Badegebäude':
		case 'Bahnhofsgebäude':
		case 'Bahnwärterhaus':
		case 'Bergwerk':
		case 'Berufsbildende Schule':
		case 'Betriebsgebäude des Güterbahnhofs':
		case 'Betriebsgebäude für Flugverkehr':
		case 'Betriebsgebäude für Schienenverkehr':
		case 'Betriebsgebäude für Schiffsverkehr':
		case 'Betriebsgebäude für Straßenverkehr':
		case 'Betriebsgebäude zu Verkehrsanlagen (allgemein)':
		case 'Betriebsgebäude zur Schleuse':
		case 'Betriebsgebäude zur Seilbahn':
		case 'Betriebsgebäude':
		case 'Bezirksregierung':
		case 'Bibliothek, Bücherei':
		case 'Bootshaus':
		case 'Botschaft, Konsulat':
		case 'Brauerei':
		case 'Brennerei':
		case 'Burg, Festung':
		case 'Bürogebäude':
		case 'Campingplatzgebäude':
		case 'Dock (Halle)':
		case 'Einkaufszentrum':
		case 'Elektrizitätswerk':
		case 'Empfangsgebäude des botanischen Gartens':
		case 'Empfangsgebäude des Zoos':
		case 'Empfangsgebäude Schifffahrt':
		case 'Empfangsgebäude':
		case 'Fabrik':
		case 'Fahrzeughalle':
		case 'Festsaal':
		case 'Feuerwehr':
		case 'Finanzamt':
		case 'Flughafengebäude':
		case 'Flugzeughalle':
		case 'Forschungsinstitut':
		case 'Freizeit- und Vergnügungsstätte':
		case 'Freizeit-, Vereinsheim, Dorfgemeinschafts-, Bürgerhaus':
		case 'Friedhofsgebäude':
		case 'Garage':
		case 'Gaststätte, Restaurant':
		case 'Gaswerk':
		case 'Gebäude an unterirdischen Leitungen':
		case 'Gebäude der Abfalldeponie':
		case 'Gebäude der Kläranlage':
		case 'Gebäude für andere Erholungseinrichtung':
		case 'Gebäude für Beherbergung':
		case 'Gebäude für betriebliche Sozialeinrichtung':
		case 'Gebäude für Bewirtung':
		case 'Gebäude für Bildung und Forschung':
		case 'Gebäude für Erholungszwecke':
		case 'Gebäude für Fernmeldewesen':
		case 'Gebäude für Forschungszwecke':
		case 'Gebäude für Gesundheitswesen':
		case 'Gebäude für Gewerbe und Industrie':
		case 'Gebäude für Grundstoffgewinnung':
		case 'Gebäude für Handel und Dienstleistungen':
		case 'Gebäude für kulturelle Zwecke':
		case 'Gebäude für Kurbetrieb':
		case 'Gebäude für Land- und Forstwirtschaft':
		case 'Gebäude für religiöse Zwecke':
		case 'Gebäude für Sicherheit und Ordnung':
		case 'Gebäude für soziale Zwecke':
		case 'Gebäude für Sportzwecke':
		case 'Gebäude für Vorratshaltung':
		case 'Gebäude für Wirtschaft oder Gewerbe':
		case 'Gebäude für öffentliche Zwecke':
		case 'Gebäude im botanischen Garten':
		case 'Gebäude im Freibad':
		case 'Gebäude im Stadion':
		case 'Gebäude im Zoo':
		case 'Gebäude zum Busbahnhof':
		case 'Gebäude zum Parken':
		case 'Gebäude zum S-Bahnhof':
		case 'Gebäude zum Sportplatz':
		case 'Gebäude zum U-Bahnhof':
		case 'Gebäude zur Abfallbehandlung':
		case 'Gebäude zur Abwasserbeseitigung':
		case 'Gebäude zur Elektrizitätsversorgung':
		case 'Gebäude zur Energieversorgung':
		case 'Gebäude zur Entsorgung':
		case 'Gebäude zur Freizeitgestaltung':
		case 'Gebäude zur Gasversorgung':
		case 'Gebäude zur Müllverbrennung':
		case 'Gebäude zur Versorgung':
		case 'Gebäude zur Versorgungsanlage':
		case 'Gebäude zur Wasserversorgung':
		case 'Gemeindehaus':
		case 'Gericht':
		case 'Geschäftsgebäude':
		case 'Gewächshaus (Botanik)':
		case 'Gewächshaus, verschiebbar':
		case 'Gotteshaus':
		case 'Hallenbad':
		case 'Heilanstalt, Pflegeanstalt, Pflegestation':
		case 'Heizwerk':
		case 'Hochschulgebäude (Fachhochschule, Universität)':
		case 'Hotel, Motel, Pension':
		case 'Hütte (mit Übernachtungsmöglichkeit)':
		case 'Hütte (ohne Übernachtungsmöglichkeit)':
		case 'Jagdhaus, Jagdhütte':
		case 'Jugendfreizeitheim':
		case 'Jugendherberge':
		case 'Justizvollzugsanstalt':
		case 'Kantine':
		case 'Kapelle':
		case 'Kaserne':
		case 'Kaufhaus':
		case 'Kegel-, Bowlinghalle':
		case 'Kesselhaus':
		case 'Kinderkrippe, Kindergarten, Kindertagesstätte':
		case 'Kino':
		case 'Kiosk':
		case 'Kirche':
		case 'Kloster':
		case 'Konzertgebäude':
		case 'Krankenhaus':
		case 'Kreditinstitut':
		case 'Kreisverwaltung':
		case 'Krematorium':
		case 'Kühlhaus':
		case 'Laden':
		case 'Lagerhalle, Lagerschuppen, Lagerhaus':
		case 'Land- und forstwirtschaftliches Betriebsgebäude':
		case 'Lokschuppen, Wagenhalle':
		case 'Markthalle':
		case 'Messehalle':
		case 'Moschee':
		case 'Museum':
		case 'Mühle':
		case 'Müllbunker':
		case 'Nach Quellenlage nicht zu spezifizieren':
		case 'Obdachlosenheim':
		case 'Parkdeck':
		case 'Parkhaus':
		case 'Parlament':
		case 'Pflanzenschauhaus':
		case 'Polizei':
		case 'Post':
		case 'Produktionsgebäude':
		case 'Pumpstation':
		case 'Pumpwerk (nicht für Wasserversorgung)':
		case 'Rathaus':
		case 'Reaktorgebäude':
		case 'Reithalle':
		case 'Rundfunk, Fernsehen':
		case 'Saline':
		case 'Sanatorium':
		case 'Scheune und Stall':
		case 'Scheune':
		case 'Schloss':
		case 'Schuppen':
		case 'Schutzbunker':
		case 'Schutzhütte':
		case 'Schöpfwerk':
		case 'Seniorenfreizeitstätte':
		case 'Sonstiges Gebäude für Gewerbe und Industrie':
		case 'Spannwerk zur Drahtseilbahn':
		case 'Speditionsgebäude':
		case 'Speichergebäude':
		case 'Spielkasino':
		case 'Sport-, Turnhalle':
		case 'Stall für Tiergroßhaltung':
		case 'Stall im Zoo':
		case 'Stall':
		case 'Stellwerk, Blockstelle':
		case 'Straßenmeisterei':
		case 'Synagoge':
		case 'Sägewerk':
		case 'Tankstelle':
		case 'Tempel':
		case 'Theater, Oper':
		case 'Tiefgarage':
		case 'Tierschauhaus':
		case 'Toilette':
		case 'Touristisches Informationszentrum':
		case 'Trauerhalle':
		case 'Treibhaus':
		case 'Treibhaus, Gewächshaus':
		case 'Turbinenhaus':
		case 'Umformer':
		case 'Umspannwerk':
		case 'Veranstaltungsgebäude':
		case 'Versicherung':
		case 'Verwaltungsgebäude':
		case 'Wartehalle':
		case 'Waschstraße, Waschanlage, Waschhalle':
		case 'Wasserbehälter':
		case 'Wassermühle':
		case 'Wasserwerk':
		case 'Werft (Halle)':
		case 'Werkstatt':
		case 'Wetterstation':
		case 'Windmühle':
		case 'Wirtschaftsgebäude':
		case 'Zollamt':
		case 'Ärztehaus, Poliklinik':
		case '':
		case undefined:
			// kein Wohngebäude
			return false;
		break;

		case 'Bauernhaus':
		case 'Ferienhaus':
		case 'Forsthaus':
		case 'Gartenhaus':
		case 'Gebäude für Gewerbe und Industrie mit Wohnen':
		case 'Gebäude für Handel und Dienstleistung mit Wohnen':
		case 'Gebäude für öffentliche Zwecke mit Wohnen':
		case 'Gemischt genutztes Gebäude mit Wohnen':
		case 'Kinderheim':
		case 'Land- und forstwirtschaftliches Wohn- und Betriebsgebäude':
		case 'Land- und forstwirtschaftliches Wohngebäude':
		case 'Schullandheim':
		case 'Schwesternwohnheim':
		case 'Seniorenheim':
		case 'Studenten-, Schülerwohnheim':
		case 'Wochenendhaus':
		case 'Wohn- und Betriebsgebäude':
		case 'Wohn- und Bürogebäude':
		case 'Wohn- und Geschäftsgebäude':
		case 'Wohn- und Verwaltungsgebäude':
		case 'Wohn- und Wirtschaftsgebäude':
		case 'Wohngebäude mit Gemeinbedarf':
		case 'Wohngebäude mit Gewerbe und Industrie':
		case 'Wohngebäude mit Handel und Dienstleistungen':
		case 'Wohngebäude':
		case 'Wohnhaus':
		case 'Wohnheim':
			// Wohngebäude
			return true;
		break;

		default:
			console.log('unbekannte gebaeudefunktion "'+type+'"');
			throw Error();
	}
}
