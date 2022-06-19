#!/usr/bin/env bash
cd "$(dirname "$0")"
cd ../docs/tiles

echo "1/3 pngquant"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "pngquant -f --ext .png --quality=95-100 --speed 1 --strip {}/*.png"

echo "2/3 optipng"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "optipng -quiet {}/*.png"

echo "3/3 cleanup"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "md5sum {}/*.png | grep '42cc2561c002c4e07aff64fc6f144241' | cut -d' ' -f3- | xargs rm"
