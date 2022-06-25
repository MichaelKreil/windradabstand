#!/bin/bash
cd "$(dirname "$0")"
cd ../data/2_alkis/data
set -ex

ls -1S *.geojsonl | parallel ogr2ogr -progress {.}.fgb {}
ls -1S *.geojsonl | parallel ogr2ogr -progress {.}.gpkg {}
