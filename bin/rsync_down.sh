#!/bin/bash
cd "$(dirname "$0")"
set -ex

rsync -azvhtPSe "ssh -o Compression=no" --zc=lz4 --zl=1 --inplace --exclude='cache/' --exclude='*.tar' root@168.119.98.135:/root/projects/windradabstand/data/ /Users/michaelkreil/Projekte/privat/ZSHH/windradabstand/data/ --delete-after
