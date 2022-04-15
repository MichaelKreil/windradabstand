# grundlegender Aufbau

1. Windräder
	- 1.1. ZIP runterladen
	- 1.2. Windräder parsen, in welchem Bundesland steht es, Metadaten aufbereiten, (Leistung, Höhen, IDs vergeben ...)
2. ALKIS
	- 2.1. Scrapen
	- 2.2. Gebäude filtern, ist es ein Wohngebäude, welches Bundesland, Windradnähe, und als GeoPackage speichern.
	- 2.3. Siedlungsfläche filtern, welches Bundesland, Windradnähe, und als GeoPackage speichern.
	- 2.4. Naturschutzgebiete filtern, welches Bundesland, Windradnähe, und als GeoPackage speichern.
3. Web vorbereiten:
	- 3.1. Kartenkacheln generieren
	- 3.2. GeoJSON für Frontend mit:
		- Windrädern
		- kollidierende Gebäude
		- kollidierende Siedlungsflächen
		- kollidierende Naturschutzgebiete
4. Karte der möglichen Flächen
	- 4.1. bei Höhen von
		- 100m
		- 200m
		