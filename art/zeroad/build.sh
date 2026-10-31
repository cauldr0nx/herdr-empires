#!/bin/sh
# Build the shipped 0 A.D. art pack end to end (SPEC §18.5).
#
#   sh art/zeroad/build.sh            full build (~15-20 min on 8 CPU cores)
#   sh art/zeroad/build.sh --quick    2 directions, fewer samples (preview only;
#                                     do not commit its output)
#
# Inputs land in art/sources/ and intermediate frames in art/out/ (both
# gitignored). The output, mods/empires/packs/zeroad/, is committed.
set -eu
cd "$(dirname "$0")/../.."
QUICK=""
[ "${1:-}" = "--quick" ] && QUICK="--quick"

sh art/zeroad/fetch.sh
COMMIT=$(git -C art/sources/zeroad/0ad rev-parse HEAD)
BLENDER=art/sources/tools/blender-4.5.15-linux-x64/blender

python3 art/zeroad/resolve.py scenes
rm -rf art/out/zeroad-frames
# shellcheck disable=SC2086
"$BLENDER" --background --factory-startup --python art/zeroad/render.py -- \
  --scenes art/sources/zeroad/scenes.json --out art/out/zeroad-frames $QUICK \
  2>&1 | grep -E 'RENDERED|WARN|MISSING|Traceback|Error' | grep -v 'Not freed memory' || true
python3 art/zeroad/compose.py --frames art/out/zeroad-frames \
  --out mods/empires/packs/zeroad --commit "$COMMIT"
python3 art/zeroad/sheet.py --pack mods/empires/packs/zeroad --out art/out/zeroad-sheet.png
du -sh mods/empires/packs/zeroad
