#!/usr/bin/env bash
cd "$(dirname "$0")"

ls -1 2_alkis-3_extract-*.js | parallel -j 1 node {}
