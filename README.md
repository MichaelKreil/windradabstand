# grundlegender Aufbau

## `bin` Verzeichnis
1. Lade Windrad-Daten aus dem [Marktstammdatenregister](https://www.marktstammdatenregister.de/MaStR/Datendownload). Die Daten werden aber nicht mehr in der Karte dargestellt, sondern nur noch statistisch ausgewertet.
	- [1_get_wind-1_download.js](bin/1_get_wind-1_download.js) ZIP runterladen
	- [1_get_wind-2_parse.js](bin/1_get_wind-2_parse.js) Windräder parsen, in welchem Bundesland stehen sie, Metadaten aufbereiten (Leistung, Höhen, IDs vergeben ...) und durch Clustererkennung in Gruppen sortieren.
2. Lade ALKIS von [basemap.de Web Vektor](https://basemap.de/web-vektor/)
	- [2_get_alkis-1_scrape.js](bin/2_get_alkis-1_scrape.js) Scrapen
	- [2_get_alkis-2_merge.js](bin/2_get_alkis-2_merge.js) Merge die Geometrien der Vektorkacheln und speichere sie als separate Layer
	- [2_get_alkis-3_generate_fgb.sh](bin/2_get_alkis-3_generate_fgb.sh) Konvertiere die Daten in FlatGeoBuffers
3. Lade weitere Geodaten
	- [3_get_other-1_schutzgebiete.sh](bin/3_get_other-1_schutzgebiete.sh) Lade die Schutzgebiete als einzelne Layer runter, wie Vogel-, Natur-, Landschaftsschutzgebiete, usw.
	- [3_get_other-2_windvorranggebiete_bayern.js](bin/3_get_other-2_windvorranggebiete_bayern.js) Lade die Windvorranggebiete in Bayern runter
4. Verarbeite die Quelldaten
   - Sortiere die Daten nach Abstandsregelungen. Beispielsweise werde Gebäude aufgesplittet nach Wohnen und Gewerbe.
   - Generiere für jede Abstandsregelung einen eigenen Layer.
   - [4_process-1_siedlungsflaeche.js](bin/4_process-1_siedlungsflaeche.js) Siedlungsfläche
   - [4_process-2_gebaeude.js](bin/4_process-2_gebaeude.js) Gebäude
   - [4_process-3a_grenze_flaeche.js](bin/4_process-3a_grenze_flaeche.js) z.B. Naturschutzgebiete
   - [4_process-3b_verkehrslinie.js](bin/4_process-3b_verkehrslinie.js) Verkehrslinien, z.B. Autobahnen, Bundesstraßen, etc.
   - [4_process-3c_versorgungslinie.js](bin/4_process-3c_versorgungslinie.js) Versorgungslinien, z.B. Freileitungen
   - [4_process-3d_vegetation.js](bin/4_process-3d_vegetation.js) Vegetationsflächen, z.B. Wälder
   - [4_process-3e_gewaesserflaeche.js](bin/4_process-3e_gewaesserflaeche.js) Gewässerflächen
   - [4_process-3f_verkehrsflaeche.js](bin/4_process-3f_verkehrsflaeche.js) Verkehrsflächen, z.B. Flugplätze
   - [4_process-3g_seismisch.js](bin/4_process-3g_seismisch.js) seismische Messstationen
	- [4_process-all.sh](bin/4_process-all.sh) führt alle diese Schritte aus.
5. Frontend vorbereiten
	- [5_frontend-1_place_list.js](bin/5_frontend-1_place_list.js) Generiere aus den HK-Daten eine Liste von Orten, nach denen im Frontend gesucht werden kann.
6. "verbotene" Flächen berechnen
	- [6_buffered_geometry-1_prepare.js](bin/6_buffered_geometry-1_prepare.js) Bereite die Berechnung der Geometrien vor.
	- [6_buffered_geometry-2_buffer.js](bin/6_buffered_geometry-2_buffer.js) Berechne einen Buffer entsprechend der Abstandsregelung um jede Geometrie.
	- [6_buffered_geometry-3_union.js](bin/6_buffered_geometry-3_union.js) Merge die Geometrien, um sie zu vereinfachen.
7. Karte rendern
	- [7_sdf-1_generate.js](bin/7_sdf-1_generate.js) Rendere Kartenkacheln mit Rust. Der Rotkanal ist ein Distancefield zu Wohngebäuden, der Grünkanal zeigt alle anderen gesperrten Flächen.
	- [7_sdf-2_compress.js](bin/7_sdf-2_compress.js) Komprimiere die PNG-Kacheln zu (almost) lossless Webp-Kacheln.

Die Kacheln mit Distance-Field sehen dann so aus:

<img src="https://cdn.michael-kreil.de/data/windradabstand/9/168/276.webp">

## `lib` Verzeichnis

… enthält kleinere Libraries, die für die Berechnung verwendet werden, oder in einer früheren Version mal verwendet wurden.

## `rust` Verzeichnis

… enthält den Quellcode für zwei Rust-Programme. `calc_sdf.rs` berechnet das Distance-Field. `merge.rs` nimmt 4 Kacheln einer Ebene und berechnet die entsprechende Kachel eine Ebene höher.

## `docs` Verzeichnis

Web-Verzeichnis:

- [index.html](docs/index.html) Demo-Artikel mit Lorem-Ipsum-Text und iframe.
- [map.html](docs/map.html) Die eigentliche Karte inklusive CSS und JavaScript.
- [screenshot.html](docs/screenshot.html) Kleine Hilfsdatei, um einen Screenshot für die Printgrafik zu generieren.
- [places.json](docs/places.json) JSON mit Orten, nach denen gesucht werden kann.
- [maplibre-gl.css](docs/maplibre-gl.css), [maplibre-gl.js](docs/maplibre-gl.js), [maplibre-gl.js.map](docs/maplibre-gl.js.map) speziell "angepasste" (gehackte) Version von Maplibre. Der Fragment-Shader für Raster-Tiles wurde umgearbeitet, um Distance-Field darstellen zu können. Der entsprechende Branch `raster_sdf` befindet sich im Fork: [github.com/michaelkreil/maplibre-gl-js/tree/raster_sdf](https://github.com/MichaelKreil/maplibre-gl-js/tree/raster_sdf)
- [autoComplete.css](docs/autoComplete.css), [autoComplete.min.js](docs/autoComplete.min.js) AutoComplete-Bibliothek für die Ortssuche.
