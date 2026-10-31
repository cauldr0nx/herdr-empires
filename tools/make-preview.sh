#!/bin/sh
# Builds the Settings preview (layouts/empires.svg, 320×200) from preview.png, the real
# `herdr-app shot` that tools/demo/run-demo.sh takes in a private demo (SPEC §15: demo
# names only). The PNG is embedded so the layout keeps a single preview file.
# Needs ImageMagick. Run from anywhere: sh tools/make-preview.sh
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
magick preview.png -resize 640x400^ -gravity center -extent 640x400 -strip -colors 192 "PNG8:$tmp/p.png"
b64=$(base64 -w0 "$tmp/p.png" 2>/dev/null || base64 "$tmp/p.png" | tr -d '\n')
printf '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200"><!-- herdr-empires: Settings preview, a real herdr-app shot of the Map view (tools/demo/run-demo.sh); world art 0 A.D. (c) Wildfire Games, CC BY-SA 3.0 --><image width="320" height="200" href="data:image/png;base64,%s"/></svg>\n' "$b64" >layouts/empires.svg
echo "make-preview: wrote layouts/empires.svg ($(wc -c <layouts/empires.svg | tr -d ' ') bytes)"
