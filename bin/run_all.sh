#!/bin/bash
cd "$(dirname "$0")"

rm -r ../data/4_map_result
rm -r ../data/6_buffered_geometry
rm -r ../data/helper
rm -r ../docs/tiles

set -ex

./4_process-all.sh
./5_generate_frontend.js
./6_buffered_geometry-1_calc.js
./7_render_map-all.sh
