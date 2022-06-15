#!/bin/bash
cd "$(dirname "$0")"
cd ../data/2_alkis/data
set -ex

ls -1S *.geojsonl | parallel -j 100% ogr2ogr -progress {.}.fgb {}
