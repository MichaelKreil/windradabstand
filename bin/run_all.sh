#!/bin/bash
cd "$(dirname "$0")"
set -ex

rm -r ../data/4_map_result
rm -r ../data/6_buffered_geometry
rm -r ../data/helper
rm -r ../docs/tiles

./4_process-all.sh
./6_buffered_geometry-1_calc.js
./7_render_map-all.sh
