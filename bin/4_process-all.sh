#!/usr/bin/env bash
cd "$(dirname "$0")"
set -ex

[ -d "../data/tmp" ] && rm -r ../data/tmp

node 4_process-1_siedlungsflaeche.js
node 4_process-2_gebaeude.js

parallel "node 4_process-{}.js; echo '--------------------------------------------------'" ::: 3_grenze_flaeche 4_verkehrslinie 5_versorgungslinie 6_vegetation 7_gewaesserflaeche 8_verkehrsflaeche 9_seismisch
