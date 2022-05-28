#!/bin/bash
cd "$(dirname "$0")"
set -ex

./1_wind-1_download.js
./1_wind-2_parse.js
./2_alkis-1_scrape.js
./2_alkis-2_merge.js
./2_alkis-3_gebaeude.js
./2_alkis-4_siedlungsflaeche.js
./2_alkis-5_grenze_flaeche.js
./2_alkis-6_verkehrslinie.js
./2_alkis-7_versorgungslinie.js
./5_generate_frontend.js
