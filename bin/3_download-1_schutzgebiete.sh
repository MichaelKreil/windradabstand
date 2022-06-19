#!/bin/bash
cd "$(dirname "$0")"
set -ex

ogr2ogr -overwrite ../data/3_andere_gebiete/biosphaere.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Biosphaerenreservate
ogr2ogr -overwrite ../data/3_andere_gebiete/ffhabitat.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Fauna_Flora_Habitat_Gebiete
ogr2ogr -overwrite ../data/3_andere_gebiete/landschaftsschutz.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Landschaftsschutzgebiete
ogr2ogr -overwrite ../data/3_andere_gebiete/nationalpark.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Nationalparke
ogr2ogr -overwrite ../data/3_andere_gebiete/naturpark.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Naturparke
ogr2ogr -overwrite ../data/3_andere_gebiete/naturschutz.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Naturschutzgebiete
ogr2ogr -overwrite ../data/3_andere_gebiete/vogelschutz.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Vogelschutzgebiete

ogr2ogr -overwrite ../data/3_andere_gebiete/nationale_naturmonumente.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Nationale_Naturmonumente
