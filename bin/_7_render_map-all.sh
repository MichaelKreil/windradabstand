#!/usr/bin/env bash
cd "$(dirname "$0")"
set -ex

./7_render_map-1_buffered_geometry.js
./7_render_map-3_cleanup.sh
