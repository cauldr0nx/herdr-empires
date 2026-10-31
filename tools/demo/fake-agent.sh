#!/bin/sh
# A fake agent for demo profiles and screenshots (SPEC §9): reports statuses
# through OSC 7501, the Program Status Protocol herdr-core reads
# (`ESC ] 7501 ; state=<word>:app=<name> ESC \`), with no real agent involved.
#
#   fake-agent.sh working            hold one status forever
#   fake-agent.sh working 8 blocked  working for 8 s, then blocked forever
#   fake-agent.sh cycle              working 6 s → blocked 6 s → done 6 s → idle 6 s, repeat
#
# Prints only generic demo text (no paths, names or real terminal content).
set -u
app="${FAKE_AGENT_APP:-demo-agent}"
report() { printf '\033]7501;state=%s:app=%s\033\\' "$1" "$app"; }
say() { printf '%s\n' "$*"; }
trap 'report idle; exit 0' INT TERM
say "demo agent ($app): a stand-in that only reports status; it runs nothing."
if [ "${1:-}" = "cycle" ]; then
  while :; do
    for s in working blocked done idle; do
      report "$s"; say "status: $s"; sleep "${2:-6}"
    done
  done
fi
while [ $# -gt 0 ]; do
  s=$1; shift
  report "$s"; say "status: $s"
  if [ $# -gt 0 ]; then sleep "$1"; shift; else sleep 2147483647; fi
done
sleep 2147483647
