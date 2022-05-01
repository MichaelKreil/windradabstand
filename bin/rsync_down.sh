#!/bin/bash
cd "$(dirname "$0")"
set -ex

rsync -azhtPe ssh --info=progress2 --exclude='cache/' root@168.119.98.135:/root/projects/windradabstand/data/ /Users/michaelkreil/Projekte/privat/ZSHH/windradabstand/data/ --delete-after
