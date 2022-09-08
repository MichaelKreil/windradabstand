#!/usr/bin/env bash
cd "$(dirname "$0")"
set -ex

[ -d "../data/tmp" ] && rm -r ../data/tmp

node 4_process-1_siedlungsflaeche.js
node 4_process-2_gebaeude.js

parallel "node {}; echo '--------------------------------------------------'" ::: 4_process-3*.js
