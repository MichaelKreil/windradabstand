#!/usr/bin/env bash
cd "$(dirname "$0")"
cd ../docs/tiles


echo "1/4 cleanup"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "md5sum {}/*.png | grep '91035755a501e30825fe66e5cc71f9ab' | cut -d' ' -f3- | xargs rm"

echo "2/4 pngquant"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "pngquant -f --ext .png --quality=95-100 --speed 1 --strip {}/*.png"

echo "3/4 optipng"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "optipng -quiet {}/*.png"

echo "4/4 cleanup"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "md5sum {}/*.png | grep '42cc2561c002c4e07aff64fc6f144241' | cut -d' ' -f3- | xargs rm"
