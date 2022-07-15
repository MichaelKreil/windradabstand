#!/bin/bash
cd "$(dirname "$0")"
cd ../data/2_alkis/data
set -ex

ls -1S *.geojsonl.gz | parallel 'ogr2ogr -progress {= $_= substr $_, 0, -12 =}.fgb /vsigzip/{}'
