#!/usr/bin/env bash
cd "$(dirname "$0")"

ls -1 4_process-*.js | parallel -j 1 node {}
