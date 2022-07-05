#!/usr/bin/env bash
cd "$(dirname "$0")"

while true; do
	git pull
	node 8_server.js production || true
	echo "restart $(date -Iseconds)"
done
