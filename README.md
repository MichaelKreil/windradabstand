# grundlegender Aufbau

## `bin` Verzeichnis
1. Windräder aus dem [Marktstammdatenregister](https://www.marktstammdatenregister.de/MaStR/Datendownload)
	- [1_wind-1_download.js](blob/main/bin/1_wind-1_download.js) ZIP runterladen
	- [1_wind-2_parse.js](blob/main/bin/1_wind-2_parse.js) Windräder parsen, in welchem Bundesland stehen sie, Metadaten aufbereiten (Leistung, Höhen, IDs vergeben ...) und durch Clustererkennung in Gruppen sortieren.
2. ALKIS von [AdV Smart Mapping](https://adv-smart.de)
	- [2_alkis-1_scrape.js](blob/main/bin/2_alkis-1_scrape.js) Scrapen
	- [2_alkis-2_merge.js](blob/main/bin/2_alkis-2_merge.js) Merge die Geometrien der Vektorkacheln und speichere sie als Layer
	- [2_alkis-3_generate_fgb.sh](blob/main/bin/2_alkis-3_generate_fgb.sh) Konvertiere die Daten in FlatGeoBuffers
3. Schutzgebiete
	- [3_download-1_schutzgebiete.sh](blob/main/bin/3_download-1_schutzgebiete.sh) Lade die Schutzgebiete als einzelne Layer runter, wie Vogel-, Natur-, Landschaftsschutzgebiete, usw.
	- [3_download-2_windvorranggebiete_bayern.js](blob/main/bin/3_download-2_windvorranggebiete_bayern.js) Lade die Windvorranggebiete in Bayern runter
4. Verarbeite die Quelldaten
	- Berechne Nähe zu Windrädern
	- generiere GeoJSONs für alle Features
	- generiere NDJSONs für Features in der Nähe zu Windrädern, gruppiert nach Windradgruppen
	- [4_process-1_siedlungsflaeche.js](blob/main/bin/4_process-1_siedlungsflaeche.js) Siedlungsfläche
	- [4_process-2_gebaeude.js](blob/main/bin/4_process-2_gebaeude.js) Gebäude in Siedlungsfläche
	- [4_process-3_grenze_flaeche.js](blob/main/bin/4_process-3_grenze_flaeche.js) Naturschutzgebiete
	- [4_process-4_verkehrslinie.js](blob/main/bin/4_process-4_verkehrslinie.js) Verkehrslinien (z.B. Autobahnen, Bundesstraßen, …)
	- [4_process-5_versorgungslinie.js](blob/main/bin/4_process-5_versorgungslinie.js) Versorgungslinien (z.B. Hochspannungsleitungen, …)
	- [4_process-all.sh](blob/main/bin/4_process-all.sh) führt alle diese Schritte aus.
5. Frontend vorbereiten
	- [5_generate_frontend.js](blob/main/bin/5_generate_frontend.js) Generiert und komprimiert die Daten fürs Frontend
6. "verbotene" Flächen berechnen
	- [6_buffered_geometry-1_calc.js](blob/main/bin/6_buffered_geometry-1_calc.js) Nutzt die ALKIS und Naturschutzdaten, um verbotene Flächen zu berechnen.
7. Karte rendern
	- [7_render_map-1_buffered_geometry.js](blob/main/bin/7_render_map-1_buffered_geometry.js) generiert Kartenkacheln
	- [7_render_map-3_cleanup.sh](blob/main/bin/7_render_map-3_cleanup.sh) komprimiert die Kacheln und speichert sie als TAR
8. Server
	- hat einen Passwortschutz
	- macht CORS
	- liefert die Daten vorkomprimiert aus
	- liefert die Kartenkacheln direkt aus dem TAR im RAM aus 🤩
	- [8_server.js](blob/main/bin/8_server.js) startet den Server
	- [8_server-loop.sh](blob/main/bin/8_server-loop.sh) starten den Server in einer Bash-Loop
