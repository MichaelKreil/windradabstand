#!/usr/bin/env bash
cd "$(dirname "$0")"
set -ex

node 4_process-1_siedlungsflaeche.js
node 4_process-2_gebaeude.js
node 4_process-3_grenze_flaeche.js
node 4_process-4_verkehrslinie.js
node 4_process-5_versorgungslinie.js
