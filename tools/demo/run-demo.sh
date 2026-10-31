#!/bin/sh
# Runs Herdr Empires in a clean, fully private demo: a headless Herdr window (cage on
# wlroots' headless backend) with its OWN app home and its OWN herdr-core, fake agents in
# every status, and `herdr-app shot` screenshots into shots/ (gitignored).
# SPEC §9, §15, SPIKES "Testing in a sandbox": generic space names, demo folders under a
# temp dir, no real terminal content, and nothing reaches the person's Herdr or terminals.
#
# Needs: herdr-app and herdr-core installed (https://herdr.dev), cage (a wlroots kiosk
# compositor), a GPU or Mesa driver. Run from the repo root:
#
#   sh tools/demo/run-demo.sh            # shots/split.png, map.png, blocked.png, menu.png, terminals.png
#   KEEP=1 sh tools/demo/run-demo.sh     # leave the demo running for a look (prints how to reach it)
#
# Why a private XDG_RUNTIME_DIR: herdr-core's socket lives there. Sharing it would put the
# demo towns into the person's own Herdr. Why a short temp path: the window's control
# socket lives in the app home and Unix socket paths are short (SUN_LEN).
set -u
cd "$(dirname "$0")/../.." || exit 2
say() { echo "run-demo: $*"; }
for tool in herdr-app cage; do
  command -v "$tool" >/dev/null 2>&1 || { say "$tool is not on PATH; install Herdr (https://herdr.dev) and cage first"; exit 2; }
done
mkdir -p shots
demo=$(mktemp -d /tmp/hed.XXXXXX)
host_rt="${XDG_RUNTIME_DIR:-}"
export HERDR_APP_HOME="$demo/h"
export XDG_RUNTIME_DIR="$demo/rt"
export XDG_STATE_HOME="$demo/state"
mkdir -p "$HERDR_APP_HOME" "$XDG_RUNTIME_DIR" "$XDG_STATE_HOME" "$demo/demo-api" "$demo/demo-web" "$demo/demo-docs"
chmod 700 "$XDG_RUNTIME_DIR"
printf '{ "zoom": 1, "sounds": { "enabled": false }, "telemetry": false }\n' >"$HERDR_APP_HOME/settings.json"
printf '{ "frame.welcomed": "finished", "empires.boot": "off" }\n' >"$HERDR_APP_HOME/shared.json"
(cd "$demo/demo-api" && git init -q && git commit -q --allow-empty -m "demo" && git branch -q -M main) 2>/dev/null
(cd "$demo/demo-web" && git init -q && git commit -q --allow-empty -m "demo" && git branch -q -M feat/hud) 2>/dev/null
fake=$(pwd)/tools/demo/fake-agent.sh

cleanup() {
  if [ "${KEEP:-0}" = 1 ]; then
    say "KEEP=1: reach it with  env HERDR_APP_HOME=$HERDR_APP_HOME XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR XDG_STATE_HOME=$XDG_STATE_HOME herdr-app status"
    return
  fi
  # Stop everything that runs on the private runtime dir (cage, the app, the demo core).
  for p in $(pgrep -x cage) $(pgrep -x herdr-app) $(pgrep -x herdr-core); do
    tr '\0' '\n' </proc/"$p"/environ 2>/dev/null | grep -q "XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR" && kill "$p" 2>/dev/null
  done
  say "stopped; demo dir $demo left in place (a temp dir)"
}
trap cleanup EXIT

say "installing the theme into $HERDR_APP_HOME"
# `herdr-app check` opens a window, so it needs the host display, not the private runtime dir.
XDG_RUNTIME_DIR="$host_rt" sh tools/install.sh --home "$HERDR_APP_HOME" install >/dev/null || exit 1
say "starting a headless herdr-app (log: $demo/herdr-app.log)"
WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1 setsid cage -s -- herdr-app >"$demo/herdr-app.log" 2>&1 </dev/null &
i=0
until herdr-app status 2>/dev/null | grep -q '"layout"' || [ $i -ge 60 ]; do sleep 1; i=$((i + 1)); done
herdr-app status 2>/dev/null | grep -q '"layout"' || { say "herdr-app did not come up; see $demo/herdr-app.log"; exit 1; }
do_() { herdr-app do "$@" >/dev/null 2>&1; }

say "founding demo towns with fake agents in every status"
do_ space.new --name demo-api --folder "$demo/demo-api" --argv "[\"sh\",\"$fake\",\"working\"]"
do_ tab.new --name "fix login" --argv "[\"sh\",\"$fake\",\"working\"]"
do_ pane.split --direction right --argv "[\"sh\",\"$fake\",\"blocked\"]"
do_ tab.new --name "review" --argv "[\"sh\",\"$fake\",\"cycle\",\"8\"]"
do_ space.new --name demo-web --folder "$demo/demo-web" --argv "[\"sh\",\"$fake\",\"working\"]"
do_ tab.new --name "docs" --argv "[\"sh\",\"$fake\",\"done\"]"
do_ space.new --name demo-docs --folder "$demo/demo-docs" --argv "[\"sh\",\"$fake\",\"idle\"]"
do_ space.select --index 1
do_ layout.switch --name empires
sleep 8
do_ overlay.close
do_ empires.view_split; sleep 4
herdr-app shot shots/split.png >/dev/null
do_ empires.view_map; sleep 4
herdr-app shot shots/map.png >/dev/null
do_ tab.select --index 2; sleep 2
herdr-app shot shots/blocked.png >/dev/null
do_ empires.menu; sleep 1
herdr-app shot shots/menu.png >/dev/null
do_ overlay.close
do_ empires.view_terminals; sleep 3
herdr-app shot shots/terminals.png >/dev/null
do_ empires.view_split
say "screenshots in shots/: $(ls shots | tr '\n' ' ')"
say "inspect every image at full size before sharing any of them (SPEC §15)"
