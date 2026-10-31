#!/bin/sh
# Runs Herdr Empires in a clean demo profile under Xvfb with fake agents in
# every status and takes `herdr-app shot` screenshots into shots/ (gitignored).
# SPEC §9, §15: generic space names (demo-api, demo-web), a demo folder under a
# temporary HOME-relative path, no real terminal content.
#
# Needs: herdr-app and hc (herdr-core) on PATH, Xvfb, a Vulkan driver (the
# lavapipe software driver works: mesa-vulkan-drivers). Run from the repo root:
#
#   sh tools/demo/run-demo.sh            # shots/landscape.png, blocked.png, narrow.png, hud-hidden.png, menu.png
#   KEEP=1 sh tools/demo/run-demo.sh     # leave the app and the demo home running for a look
#
# Everything lives under a throwaway app home; the person's own Herdr is never touched.
set -u
cd "$(dirname "$0")/../.." || exit 2
say() { echo "run-demo: $*"; }
for tool in herdr-app hc Xvfb; do
  command -v "$tool" >/dev/null 2>&1 || { say "$tool is not on PATH; install Herdr (https://herdr.dev) and Xvfb first"; exit 2; }
done
mkdir -p shots
demo=$(mktemp -d)
export HERDR_APP_HOME="$demo/app-home"
export HERDR_CORE_HOME="${HERDR_CORE_HOME:-$demo/core-home}"
export XDG_CONFIG_HOME="$demo/config"
export DISPLAY="${DISPLAY_DEMO:-:99}"
mkdir -p "$HERDR_APP_HOME" "$demo/demo-api" "$demo/demo-web" "$XDG_CONFIG_HOME"
printf '{ "zoom": 1, "sounds": { "enabled": false }, "telemetry": false }\n' > "$HERDR_APP_HOME/settings.json"
(cd "$demo/demo-api" && git init -q && git commit -q --allow-empty -m "demo" && git branch -q -M main) 2>/dev/null
(cd "$demo/demo-web" && git init -q && git commit -q --allow-empty -m "demo" && git branch -q -M feat/hud) 2>/dev/null
fake=$(pwd)/tools/demo/fake-agent.sh

cleanup() {
  if [ "${KEEP:-0}" != 1 ]; then
    [ -n "${app_pid:-}" ] && kill "$app_pid" 2>/dev/null
    [ -n "${xvfb_pid:-}" ] && kill "$xvfb_pid" 2>/dev/null
    say "demo home was $demo (left in place; it is a temp dir)"
  else
    say "KEEP=1: app pid ${app_pid:-?}, Xvfb pid ${xvfb_pid:-?}, HERDR_APP_HOME=$HERDR_APP_HOME"
  fi
}
trap cleanup EXIT

say "installing the theme into $HERDR_APP_HOME"
sh tools/install.sh --home "$HERDR_APP_HOME" install >/dev/null || exit 1
Xvfb "$DISPLAY" -screen 0 1440x900x24 >/dev/null 2>&1 &
xvfb_pid=$!
sleep 1
say "starting herdr-app on $DISPLAY (log: $demo/herdr-app.log)"
HERDR_APP_NO_SOUND=1 herdr-app >"$demo/herdr-app.log" 2>&1 &
app_pid=$!
# Wait for the control socket.
i=0
until herdr-app status >/dev/null 2>&1 || [ $i -ge 60 ]; do sleep 1; i=$((i + 1)); done
herdr-app status >/dev/null 2>&1 || { say "herdr-app did not come up; see $demo/herdr-app.log"; exit 1; }
herdr-app do layout.switch --name empires >/dev/null
sleep 3

say "founding demo towns with fake agents in every status"
herdr-app do space.new --name demo-api --folder "$demo/demo-api" --argv "[\"sh\",\"$fake\",\"working\"]" >/dev/null
sleep 1
herdr-app do tab.new --name "fix login" --argv "[\"sh\",\"$fake\",\"working\"]" >/dev/null
herdr-app do pane.split --direction right >/dev/null
sleep 1
herdr-app do tab.new --name "review" --argv "[\"sh\",\"$fake\",\"blocked\"]" >/dev/null
herdr-app do space.new --name demo-web --folder "$demo/demo-web" --argv "[\"sh\",\"$fake\",\"done\"]" >/dev/null
sleep 1
herdr-app do tab.new --name "docs" --argv "[\"sh\",\"$fake\",\"idle\"]" >/dev/null
herdr-app do space.select --index 1 >/dev/null
herdr-app do tab.select --index 1 >/dev/null
sleep 4
# The loading screen closes itself within 2 s; wait it out before the first shot.
herdr-app shot shots/landscape.png
herdr-app do tab.select --index 2 >/dev/null; sleep 2
herdr-app shot shots/blocked.png
herdr-app do empires.menu >/dev/null 2>&1 || true; sleep 1
herdr-app shot shots/menu.png
herdr-app do overlay.close >/dev/null 2>&1 || true
herdr-app do layout.toggle --id hud >/dev/null; sleep 2
herdr-app shot shots/hud-hidden.png
herdr-app do layout.toggle --id hud >/dev/null
# Narrow: resize the X window to under 900 px if xdotool is around.
if command -v xdotool >/dev/null 2>&1; then
  wid=$(xdotool search --name "Herdr" | head -1)
  [ -n "$wid" ] && xdotool windowsize "$wid" 820 900 && sleep 3 && herdr-app shot shots/narrow.png && xdotool windowsize "$wid" 1440 900
fi
say "screenshots in shots/: $(ls shots)"
say "inspect every image at full size before sharing any of them (SPEC §15)"
