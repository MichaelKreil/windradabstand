#!/bin/bash
cd "$(dirname "$0")"
cd ../data/2_alkis/data
set -ex

ls -1S *.geojsonl.gz | sed 's/.geojsonl.gz$//' | parallel 'rm -f {}.fgb; ogr2ogr -dialect SQLite -sql "SELECT ST_MakeValid(geometry) as geometry, * FROM \"{}.geojsonl\"" -nln {} {}.fgb /vsigzip/{}.geojsonl.gz; echo "created: {}.fgb"'
