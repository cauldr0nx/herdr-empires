#!/bin/sh
# Herdr Empires installer (SPEC §3.1): install / update / uninstall into a Herdr
# app home. POSIX sh, no network, no sudo, idempotent; prints every path it
# touches. Never overwrites a file that isn't ours (markers: the layout's root
# title "Herdr Empires" (Herdr keeps it; it drops unknown fields such as
# x_empires on its first layout.set), colors.x_empires in the theme files,
# mods/empires/.empires-version).
#
#   tools/install.sh [--home DIR] install [--switch] [--templates]
#   tools/install.sh [--home DIR] update  [--switch]
#   tools/install.sh [--home DIR] uninstall
#   tools/install.sh [--home DIR] status
#
# The app home is --home, else $HERDR_APP_HOME, else $XDG_CONFIG_HOME/herdr-app,
# else ~/.config/herdr-app (how herdr-app resolves it on every platform).
set -u

here=$(cd "$(dirname "$0")/.." && pwd)
home=""
cmd=""
switch=0
templates=0
while [ $# -gt 0 ]; do
  case "$1" in
    --home) home=$2; shift ;;
    --switch) switch=1 ;;
    --templates) templates=1 ;;
    install|update|uninstall|status) cmd=$1 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "install.sh: unknown argument $1" >&2; exit 2 ;;
  esac
  shift
done
[ -z "$cmd" ] && { sed -n '2,13p' "$0"; exit 2; }
if [ -z "$home" ]; then
  if [ -n "${HERDR_APP_HOME:-}" ]; then home=$HERDR_APP_HOME
  elif [ -n "${XDG_CONFIG_HOME:-}" ]; then home=$XDG_CONFIG_HOME/herdr-app
  else home=$HOME/.config/herdr-app
  fi
fi
case "$home" in
  /*) ;;
  *) home=$(pwd)/$home ;;
esac
# Removals below are guarded with ${home:?}: an empty home can never become "/".
[ -n "$home" ] && [ "$home" != "/" ] || { echo "install.sh: refusing to use $home as the app home" >&2; exit 2; }
version=$(cat "$here/mods/empires/.empires-version" 2>/dev/null || echo "unknown")
stamp=$(date +%Y%m%d-%H%M%S)
say() { echo "install.sh: $*"; }
die() { echo "install.sh: $*" >&2; exit 1; }

# ---- helpers

json_tool() {
  if command -v python3 >/dev/null 2>&1; then echo python3
  elif command -v node >/dev/null 2>&1; then echo node
  elif command -v bun >/dev/null 2>&1; then echo bun
  else echo ""
  fi
}

# json_valid FILE: exit 0 when FILE parses as JSON.
json_valid() {
  case "$(json_tool)" in
    python3) python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$1" 2>/dev/null ;;
    node) node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$1" 2>/dev/null ;;
    bun) bun -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$1" 2>/dev/null ;;
    *) grep -q '{' "$1" ;;
  esac
}

# ours FILE: is this file one we installed (marker), or absent?
ours() {
  f=$1
  [ -e "$f" ] || return 0
  case "$f" in
    */layouts/empires.json) grep -q '"x_empires"\|"title": "Herdr Empires"' "$f" ;;
    */themes/empires*.json) grep -q '"x_empires"' "$f" ;;
    */layouts/empires.svg) grep -q 'herdr-empires' "$f" ;;
    */mods/empires) [ -f "$f/.empires-version" ] ;;
    *) return 1 ;;
  esac
}

copy_file() { # copy_file SRC DST
  src=$1; dst=$2
  if [ -e "$dst" ] && ! ours "$dst"; then
    die "refusing to overwrite $dst: it is not a Herdr Empires file (no marker). Move it aside and run again."
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst" || die "cannot write $dst"
  say "wrote $dst"
}

copy_mod() { # the mod folder: refuse a foreign one, prune files we no longer ship, copy ours
  src="$here/mods/empires"
  dst="${home:?}/mods/empires"
  if [ -d "$dst" ] && ! ours "$dst"; then
    die "refusing to overwrite $dst: it is not a Herdr Empires folder (no .empires-version). Move it aside and run again."
  fi
  mkdir -p "$dst"
  if [ -f "$dst/.empires-version" ]; then
    (cd "$dst" && find . -type f) | while read -r f; do
      if [ ! -e "$src/$f" ]; then
        rm -f -- "${dst:?}/${f:?}"
        say "removed $dst/$f (no longer shipped)"
      fi
    done
  fi
  (cd "$src" && find . -type d) | while read -r d; do mkdir -p "$dst/$d"; done
  (cd "$src" && find . -type f) | while read -r f; do
    cp "$src/$f" "$dst/$f" || die "cannot write $dst/$f"
  done
  say "wrote $dst/ ($(cd "$src" && find . -type f | wc -l | tr -d ' ') files)"
}

# merge_keys add|remove: add our layout:empires keys to the person's keys.json without
# replacing any binding they already have (or remove the section), after a backup.
merge_keys() {
  user="$home/keys.json"
  ours_keys="$here/keys.json"
  tool=$(json_tool)
  [ -n "$tool" ] || { say "no python3/node/bun: skipping keys.json merge; add the layout:empires section from $ours_keys by hand"; return 0; }
  if [ -e "$user" ]; then
    json_valid "$user" || die "$user is not valid JSON; fix it before installing (nothing was changed)"
    cp "$user" "$user.bak-$stamp" && say "backed up $user to $user.bak-$stamp"
  fi
  case "$tool" in
    python3) python3 - "$user" "$ours_keys" "$1" <<'PY'
import json, sys, os
user, ours, mode = sys.argv[1], sys.argv[2], sys.argv[3]
data = json.load(open(user)) if os.path.exists(user) else {}
section = json.load(open(ours))["layout:empires"]
if mode == "remove":
    # Only our keys go (a key the person rebound stays); an empty section goes too.
    cur = data.get("layout:empires", {})
    gone = [k for k, v in section.items() if cur.get(k) == v]
    for k in gone:
        del cur[k]
    if "layout:empires" in data and not cur:
        del data["layout:empires"]
    print(f"install.sh: keys.json layout:empires: removed {len(gone)} of our keys")
else:
    cur = data.setdefault("layout:empires", {})
    added = [k for k in section if k not in cur]
    for k in added:
        cur[k] = section[k]
    kept = [k for k in section if k in cur and cur[k] != section[k]]
    print(f"install.sh: keys.json layout:empires: added {len(added)}, kept {len(kept)} of yours")
with open(user, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
    ;;
    node|bun) $tool -e '
const fs = require("fs"); const [user, ours, mode] = process.argv.slice(1);
const data = fs.existsSync(user) ? JSON.parse(fs.readFileSync(user, "utf8")) : {};
const section = JSON.parse(fs.readFileSync(ours, "utf8"))["layout:empires"];
if (mode === "remove") { const cur = data["layout:empires"] ?? {}; let gone = 0; for (const [k, v] of Object.entries(section)) if (cur[k] === v) { delete cur[k]; gone++; } if ("layout:empires" in data && !Object.keys(cur).length) delete data["layout:empires"]; console.log(`install.sh: keys.json layout:empires: removed ${gone} of our keys`); }
else { const cur = (data["layout:empires"] ??= {}); let added = 0, kept = 0; for (const [k, v] of Object.entries(section)) { if (!(k in cur)) { cur[k] = v; added++; } else if (cur[k] !== v) kept++; } console.log(`install.sh: keys.json layout:empires: added ${added}, kept ${kept} of yours`); }
fs.writeFileSync(user, JSON.stringify(data, null, 2) + "\n");' "$user" "$ours_keys" "$1" ;;
  esac
  if ! json_valid "$user"; then
    cp "$user.bak-$stamp" "$user"
    die "$user was invalid after the merge; restored from $user.bak-$stamp"
  fi
  say "wrote $user"
}

check_mod() {
  if command -v herdr-app >/dev/null 2>&1; then
    say "running: herdr-app check $home/mods/empires"
    HERDR_APP_HOME="$home" herdr-app check "$home/mods/empires" || say "WARNING: herdr-app check failed (see above)"
  else
    say "herdr-app not on PATH: skipped 'herdr-app check'. Run it yourself: HERDR_APP_HOME=$home herdr-app check $home/mods/empires"
  fi
}

do_switch() { # do_switch NAME
  if command -v herdr-app >/dev/null 2>&1; then
    say "running: herdr-app do layout.switch --name $1"
    HERDR_APP_HOME="$home" herdr-app do layout.switch --name "$1" 2>/dev/null || say "layout.switch failed (is Herdr running on this home?)"
  else
    say "herdr-app not on PATH: switch with ctrl-shift-l or Settings → Look"
  fi
}

shown_layout() {
  [ -f "$home/shared.json" ] || { echo ""; return; }
  case "$(json_tool)" in
    python3) python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("layout",""))' "$home/shared.json" 2>/dev/null ;;
    *) grep -o '"layout"[[:space:]]*:[[:space:]]*"[^"]*"' "$home/shared.json" | sed 's/.*"\([^"]*\)"$/\1/' ;;
  esac
}

install_templates() {
  tdir="${HERDR_CORE_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/herdr-core}/templates"
  say "Phase 2 unit templates go to $tdir. They are plain markdown instructions; here is each one in full:"
  for t in "$here"/templates/*.md; do
    [ -f "$t" ] || continue
    echo "----- $(basename "$t") -----"
    cat "$t"
  done
  echo "-----"
  printf 'install.sh: install these templates? [y/N] '
  read -r ans
  case "$ans" in
    y|Y|yes)
      mkdir -p "$tdir"
      for t in "$here"/templates/*.md; do
        [ -f "$t" ] || continue
        dst="$tdir/empires-$(basename "$t")"
        if [ -e "$dst" ] && ! grep -q 'herdr-empires' "$dst"; then say "skipped $dst (not ours)"; else cp "$t" "$dst" && say "wrote $dst"; fi
      done ;;
    *) say "templates not installed" ;;
  esac
}

remove_ours() { # remove_ours RELATIVE-FILE: delete one of our files, never a foreign one
  if [ -e "$home/$1" ]; then
    if ours "$home/$1"; then
      rm -f -- "${home:?}/${1:?}"
      say "removed $home/$1"
    else
      say "kept $home/$1 (not ours)"
    fi
  fi
}

# ---- commands

case "$cmd" in
  status)
    say "app home: $home"
    for f in layouts/empires.json layouts/empires.svg themes/empires.json themes/empires-parchment.json themes/empires-dusk.json mods/empires; do
      if [ -e "$home/$f" ]; then
        if ours "$home/$f"; then echo "  installed  $f"; else echo "  FOREIGN    $f (not ours; install would refuse)"; fi
      else echo "  missing    $f"; fi
    done
    [ -f "$home/mods/empires/.empires-version" ] && echo "  version    $(cat "$home/mods/empires/.empires-version") (repo: $version)"
    if grep -q '"layout:empires"' "$home/keys.json" 2>/dev/null; then echo "  keys       layout:empires present"; else echo "  keys       layout:empires absent"; fi
    if [ "$(shown_layout)" = "empires" ]; then echo "  shown      yes"; else echo "  shown      no"; fi
    ;;
  install|update)
    [ -d "$home" ] || { mkdir -p "$home" && say "created $home"; }
    say "app home: $home (Herdr Empires $version, $cmd)"
    copy_file "$here/layouts/empires.json" "$home/layouts/empires.json"
    copy_file "$here/layouts/empires.svg" "$home/layouts/empires.svg"
    for t in empires empires-parchment empires-dusk; do copy_file "$here/themes/$t.json" "$home/themes/$t.json"; done
    copy_mod
    merge_keys add
    check_mod
    [ "$templates" = 1 ] && install_templates
    [ "$switch" = 1 ] && do_switch empires
    say "done. Enter the theme with ctrl-shift-l, Settings → Look → Herdr Empires, or: herdr-app do layout.switch --name empires"
    ;;
  uninstall)
    say "app home: $home (uninstall)"
    [ "$(shown_layout)" = "empires" ] && do_switch main
    remove_ours layouts/empires.json
    remove_ours layouts/empires.svg
    remove_ours themes/empires.json
    remove_ours themes/empires-parchment.json
    remove_ours themes/empires-dusk.json
    if [ -d "$home/mods/empires" ]; then
      if ours "$home/mods/empires"; then
        rm -rf -- "${home:?}/mods/empires"
        say "removed $home/mods/empires/"
      else
        say "kept $home/mods/empires/ (not ours)"
      fi
    fi
    if [ -d "$home/data/empires" ]; then rm -rf -- "${home:?}/data/empires" && say "removed $home/data/empires/ (mod storage)"; fi
    if [ -f "$home/layouts/.state/empires.json" ]; then rm -f -- "${home:?}/layouts/.state/empires.json" && say "removed $home/layouts/.state/empires.json (clicks)"; fi
    if grep -q '"layout:empires"' "$home/keys.json" 2>/dev/null; then merge_keys remove; fi
    say "done. Herdr's own state files (shared.json, view.json, ...) were left alone; shared keys empires.* stay in shared.json until Herdr prunes them."
    ;;
esac
