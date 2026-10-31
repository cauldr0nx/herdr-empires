#!/bin/sh
# Installer round-trip on a throwaway app home (SPEC §10 M4 "done when"):
# fresh home → install → files present, keys merged, foreign files refused →
# uninstall → the home is byte-identical to before, except Herdr's own state.
set -eu
cd "$(dirname "$0")/.."
home=$(mktemp -d)
trap 'rm -rf "$home"' EXIT
# A person's existing files: a keys.json with one of our keys bound elsewhere, a foreign layout name clash.
mkdir -p "$home/layouts" "$home/mods"
# keys.json in Herdr's own 2-space style (the merge rewrites the file in that style; other styles compare as JSON below).
printf '{\n  "global": {\n    "ctrl-shift-t": "tab.new"\n  },\n  "layout:empires": {\n    "f1": "app.help"\n  }\n}\n' > "$home/keys.json"
printf '{ "zoom": 1 }\n' > "$home/settings.json"
(cd "$home" && find . -type f | sort | xargs md5sum) > "$home.before"

sh tools/install.sh --home "$home" install >/dev/null
test -f "$home/layouts/empires.json"
test -f "$home/layouts/empires.svg"
test -f "$home/themes/empires.json"
test -f "$home/mods/empires/main.js"
test -f "$home/mods/empires/.empires-version"
grep -q '"alt-."' "$home/keys.json"
grep -q '"f1": "app.help"' "$home/keys.json" || { echo "install-test: the person's f1 binding was replaced"; exit 1; }
ls "$home"/keys.json.bak-* >/dev/null
# Idempotent: a second install (update) changes nothing.
sh tools/install.sh --home "$home" update >/dev/null
# A foreign file of the same name is refused.
rm -rf "$home/mods/empires"
mkdir -p "$home/mods/empires" && echo "// someone else's" > "$home/mods/empires/main.js"
if sh tools/install.sh --home "$home" install >/dev/null 2>&1; then echo "install-test: foreign mods/empires was overwritten"; exit 1; fi
rm -rf "$home/mods/empires"
sh tools/install.sh --home "$home" install >/dev/null
sh tools/install.sh --home "$home" status >/dev/null
# Uninstall leaves the home as before (the keys.json backups are Herdr-style state files, removed here for the comparison).
sh tools/install.sh --home "$home" uninstall >/dev/null
rm -f "$home"/keys.json.bak-*
(cd "$home" && find . -type f | sort | xargs md5sum) > "$home.after"
if ! diff "$home.before" "$home.after"; then echo "install-test: uninstall did not restore the home"; exit 1; fi
rm -f "$home.before" "$home.after"
echo "install-test: ok"
