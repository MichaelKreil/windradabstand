#!/bin/bash

set -ex

node 1_wind-1_download.js
node 1_wind-2_parse.js
node 2_alkis-1_scrape.js
node 2_alkis-2_gebaeude.js
node 2_alkis-3_flaechen.js
