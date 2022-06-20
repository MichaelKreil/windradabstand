#!/usr/bin/env bash
cd "$(dirname "$0")"
cd ../docs/tiles

set -e

echo "1/4 pngquant"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "pngquant -f --ext .png --quality=95-100 --speed 1 --strip {}/*.png"

echo "2/4 optipng"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "optipng -quiet {}/*.png"

echo "3/4 tar"
tar -cf buffered.tar buffered

echo "4/4 cleanup"
rm -r buffered
