# grundlegender Aufbau

1. Windräder
	- 1.1. ZIP runterladen
	- 1.2. Windräder parsen, in welchem Bundesland stehen sie, Metadaten aufbereiten (Leistung, Höhen, IDs vergeben ...) und durch Clustererkennung in Gruppen sortieren.
2. ALKIS
	- 2.1. Scrapen
	- 2.2. Merge die Geometrien der Vektorkacheln und speichere sie als Layer
3. Schutzgebiete
	- 3.1. Lade die Schutzgebiete als einzelne Layer runter, wie Vogel-, Natur-, Landschaftsschutzgebiete, usw.
4. Verarbeite die Quelldaten
	- Berechne Nähe zu Windrädern
	- generiere GeoJSONs für alle Features
	- generiere NDJSONs für Features in der Nähe zu Windrädern, gruppiert nach Windradgruppen
	- 4.1. Gebäude
	- 4.2. Siedlungsfläche
	- 4.3. Naturschutzgebiete
	- 4.4. Verkehrslinien (z.B. Autobahnen, Bundesstraßen, …)
	- 4.5. Versorgungslinien (z.B. Hochspannungsleitungen, …)
5. Frontend vorbereiten

---

6. Mögliche Nutzflächen berechnen
7. Karte rendern




Todos:
- Frontend:
	- Windräder clickable mit Linien zu den Hauskoordinaten
	- Legende
	- Passwortschutz
- Welche Flächen bleiben übrigen, in %
- Berücksichtigung der bayrischen Windvorranggebiete für
	- buffered geometry
	- windräder

