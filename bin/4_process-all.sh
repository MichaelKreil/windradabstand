#!/usr/bin/env bash
cd "$(dirname "$0")"
set -ex

node 4_process-1_siedlungsflaeche.js
node 4_process-2_gebaeude.js

parallel -j 80% "node 4_process-{}.js" ::: 3_grenze_flaeche 4_verkehrslinie 5_versorgungslinie 6_vegetation 7_gewaesserflaeche 8_verkehrsflaeche
