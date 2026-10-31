#!/bin/sh
# Fetch pinned inputs for the 0 A.D. art pack pipeline (SPEC §18.5 step 1).
#
#   art/sources/zeroad/0ad/       sparse, blobless clone of the 0 A.D. git mirror
#   art/sources/tools/blender-*/  portable Blender 4.5 LTS (last series with the
#                                 legacy COLLADA importer), sha256-verified
#
# Everything lands under art/sources/ (gitignored, never committed).
# Re-running is cheap: existing, verified downloads are reused.
set -eu
cd "$(dirname "$0")/../.."

# --- 0 A.D. -----------------------------------------------------------------
# Tag A26 of https://github.com/0ad/0ad (the last tagged release in the mirror).
ZEROAD_REPO=https://github.com/0ad/0ad
ZEROAD_COMMIT=0562a8c13982ee979f852004756dd3f16453acc7
ZEROAD_DIR=art/sources/zeroad/0ad
P=binaries/data/mods/public/art

if [ ! -d "$ZEROAD_DIR/.git" ]; then
  mkdir -p art/sources/zeroad
  git clone --filter=blob:none --sparse --no-checkout "$ZEROAD_REPO" "$ZEROAD_DIR"
fi
cd "$ZEROAD_DIR"
# Pass 1: the small XML trees (actors, variants, skeletons, materials) so
# resolve.py can work out which binary files the chosen actors use.
xml_paths="/$P/LICENSE.txt /$P/actors/ /$P/variants/ /$P/skeletons/ /$P/materials/"
# shellcheck disable=SC2086
git sparse-checkout set --no-cone $xml_paths
git checkout -q "$ZEROAD_COMMIT"
cd - >/dev/null
# Pass 2: add exactly the meshes, animations and textures resolve.py lists.
# Blobs are fetched lazily, so this bounds the download to a few tens of MB.
list=art/sources/zeroad/files.txt
python3 art/zeroad/resolve.py files > "$list"
cd "$ZEROAD_DIR"
# shellcheck disable=SC2086
{ for p in $xml_paths; do echo "$p"; done; sed 's|^|/|' "../files.txt"; } | git sparse-checkout set --no-cone --stdin
echo "0 A.D. at $(git rev-parse HEAD)"
cd - >/dev/null

# --- Blender 4.5 LTS --------------------------------------------------------
# download.blender.org sits behind a bot challenge; use an official mirror.
# The checksum below is copied from blender-4.5.15.sha256 (identical on the
# OCF Berkeley and NLUUG mirrors).
BL_VER=4.5.15
BL_TAR=blender-$BL_VER-linux-x64.tar.xz
BL_SHA=0d2b8bb2efe97e6c8eb57de6b7322f8800e1984e3125b60decca5f6771e4773e
BL_MIRROR=${BL_MIRROR:-https://mirrors.ocf.berkeley.edu/blender/release/Blender4.5}
T=art/sources/tools
mkdir -p "$T"
if [ ! -x "$T/blender-$BL_VER-linux-x64/blender" ]; then
  [ -f "$T/$BL_TAR" ] || curl -fL --retry 3 -o "$T/$BL_TAR" "$BL_MIRROR/$BL_TAR"
  echo "$BL_SHA  $T/$BL_TAR" | sha256sum -c -
  tar -xJf "$T/$BL_TAR" -C "$T"
  rm -f "$T/$BL_TAR"
fi
"$T/blender-$BL_VER-linux-x64/blender" --version | head -1
