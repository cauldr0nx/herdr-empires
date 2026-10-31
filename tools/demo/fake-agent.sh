#!/bin/sh
# A fake agent for demo profiles and screenshots (SPEC §9): reports statuses
# through OSC 7501, the Program Status Protocol herdr-core reads
# (`ESC ] 7501 ; state=<word>:app=<name> ESC \`), with no real agent involved.
#
#   fake-agent.sh working            hold one status forever
#   fake-agent.sh working 8 blocked  working for 8 s, then blocked forever
#   fake-agent.sh cycle              working 6 s → blocked 6 s → done 6 s → idle 6 s, repeat
#   fake-agent.sh story [SEED]       a lifelike loop for showcases: works a while printing
#                                    generic activity, sometimes asks a question, finishes,
#                                    idles, repeats, with timings varied by SEED
#
# Prints only generic demo text (no paths, names or real terminal content).
set -u
app="${FAKE_AGENT_APP:-demo-agent}"
report() { printf '\033]7501;state=%s:app=%s\033\\' "$1" "$app"; }
say() { printf '%s\n' "$*"; }
trap 'report idle; exit 0' INT TERM
say "demo agent ($app): a stand-in that only reports status; it runs nothing."
if [ "${1:-}" = "story" ]; then
  # A tiny seeded generator (awk): rnd N sets R to 0..N-1. The counter lives in this shell,
  # so every draw differs; the seed keeps each agent's rhythm its own.
  base=${2:-$$}; k=0
  rnd() { k=$((k + 1)); R=$(awk -v s="$base" -v k="$k" 'BEGIN { srand(s * 7919 + k); print int(rand() * 1000000) }'); R=$((R % $1)); }
  set -- "Reading the project layout" "Searching for the failing test" "Editing the request handler" \
    "Running the test suite: 42 passed, 1 failed" "Fixing the edge case in the parser" "Running the test suite: 43 passed" \
    "Updating the changelog" "Reviewing the diff" "Refactoring the config loader" "Checking types: no errors" \
    "Writing a migration" "Profiling the slow query" "Adding a regression test" "Drafting the summary"
  lines=$#
  while :; do
    report working; rnd 90; say ""; say "> task $((R + 10)): working"
    rnd 5; n=$((R + 3))
    while [ "$n" -gt 0 ]; do
      rnd "$lines"; i=$((R + 1)); eval "say \"  … \${$i}\""
      rnd 4; sleep $((R + 2)); n=$((n - 1))
    done
    rnd 3
    if [ "$R" = 0 ]; then
      report blocked; say "? Should I also update the docs for this change? (waiting for you)"
      rnd 10; sleep $((R + 8))
      say "  (answered: yes)"; report working; rnd 4; sleep $((R + 3))
    fi
    rnd 5; report done; say "✓ Done: $((R + 1)) files changed, tests pass."
    rnd 8; sleep $((R + 6))
    report idle; rnd 6; sleep $((R + 3))
  done
fi
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
