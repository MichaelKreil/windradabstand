#!/usr/bin/env bash
cd "$(dirname "$0")"
cd ../docs/tiles

set -e

echo "1/5 cleanup"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "md5sum {}/*.png | grep '91035755a501e30825fe66e5cc71f9ab' | cut -d' ' -f3- | xargs -r rm"

echo "2/5 delete empty folders"
find . -empty -type d -delete

echo "3/5 pngquant"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "pngquant -f --ext .png --quality=95-100 --speed 1 --strip {}/*.png"

echo "4/5 optipng"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "optipng -quiet {}/*.png"

echo "5/5 cleanup"
find . -mindepth 3 -maxdepth 3 -type d | shuf | parallel --progress --bar "md5sum {}/*.png | grep '42cc2561c002c4e07aff64fc6f144241' | cut -d' ' -f3- | xargs rm"
