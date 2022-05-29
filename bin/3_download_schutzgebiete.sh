#!/bin/bash
cd "$(dirname "$0")"

ogr2ogr ../data/3_schutzgebiete/nationale_naturmonumente.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Nationale_Naturmonumente
ogr2ogr ../data/3_schutzgebiete/fauna_flora_habitat_gebiete.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Fauna_Flora_Habitat_Gebiete
ogr2ogr ../data/3_schutzgebiete/vogelschutzgebiete.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Vogelschutzgebiete
ogr2ogr ../data/3_schutzgebiete/biosphaerenreservate.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Biosphaerenreservate
ogr2ogr ../data/3_schutzgebiete/nationalparke.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Nationalparke
ogr2ogr ../data/3_schutzgebiete/naturparke.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Naturparke
ogr2ogr ../data/3_schutzgebiete/naturschutzgebiete.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Naturschutzgebiete
ogr2ogr ../data/3_schutzgebiete/landschaftsschutzgebiete.geojsonl WFS:"https://geodienste.bfn.de/ogc/wfs/schutzgebiet?REQUEST=GetCapabilities&SERVICE=WFS&VERSION=2.0.0" Landschaftsschutzgebiete
