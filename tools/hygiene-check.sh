#!/bin/sh
# Herdr Empires public-repo hygiene guard (SPEC §15). Pre-commit hook + CI.
# Fails on: absolute home paths, email addresses (allow-list), IPv4 addresses,
# private-key headers, common token prefixes, files over 2 MB, and any tracked
# path matching the never-commit list. A local, uncommitted `.hygiene-local`
# (gitignored) adds a developer's own usernames/hostnames to scan for.
#
# Usage: tools/hygiene-check.sh [--staged]   (default: every tracked file)
set -u
cd "$(dirname "$0")/.." || exit 2
fail=0
mode="${1:-tracked}"
if [ "$mode" = "--staged" ]; then
  files=$(git diff --cached --name-only --diff-filter=ACMR)
else
  files=$(git ls-files)
fi
[ -z "$files" ] && { echo "hygiene: nothing to check"; exit 0; }

say() { echo "hygiene: $*" >&2; fail=1; }

# 1. Never-commit paths.
echo "$files" | grep -E '(^|/)(\.claude/|shared\.json$|view\.json$|session\.json$|window\.json$|windows\.json$|installed\.json$|seen\.json$|telemetry/|data/|layouts/\.state/|art/sources/|shots/|CLAUDE\.local\.md$|\.hygiene-local$|AGENTS\.md$|herdr\.d\.ts$|gpui-kit\.d\.ts$)|\.(jsonl|log|sock|error)$|\.(reset|bak|old|corrupt)-|\.([Ss][Mm][Xx]|[Ss][Ll][Dd]|[Ss][Ll][Pp]|[Dd][Rr][Ss]|[Dd][Dd][Ss])$|(^|/)empires-packs/' \
  | while read -r f; do say "never-commit path tracked: $f"; done
[ -n "$(echo "$files" | grep -E '(^|/)(\.claude/|shared\.json$|view\.json$|session\.json$|window\.json$|windows\.json$|installed\.json$|seen\.json$|telemetry/|data/|layouts/\.state/|art/sources/|shots/|CLAUDE\.local\.md$|\.hygiene-local$|AGENTS\.md$|herdr\.d\.ts$|gpui-kit\.d\.ts$)|\.(jsonl|log|sock|error)$|\.(reset|bak|old|corrupt)-|\.([Ss][Mm][Xx]|[Ss][Ll][Dd]|[Ss][Ll][Pp]|[Dd][Rr][Ss]|[Dd][Dd][Ss])$|(^|/)empires-packs/')" ] && fail=1

# 2. Size: nothing over 2 MB.
for f in $files; do
  [ -f "$f" ] || continue
  size=$(wc -c < "$f" | tr -d ' ')
  if [ "$size" -gt 2097152 ]; then say "file over 2 MB: $f ($size bytes)"; fi
done

# 3. Content scans on text files only.
text_files=""
for f in $files; do
  [ -f "$f" ] || continue
  case "$f" in
    *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.icns|*.ttf|*.otf|*.woff|*.woff2|*.mp3|*.ogg|*.wav) continue ;;
  esac
  text_files="$text_files $f"
done
scan() { # scan <label> <grep -E pattern> [exclude-pattern]
  label=$1; pat=$2; excl=${3:-'^$'}
  # shellcheck disable=SC2086
  hits=$(grep -HnE -- "$pat" $text_files 2>/dev/null | grep -vE -- "$excl")
  if [ -n "$hits" ]; then
    echo "$hits" | head -20 | sed "s/^/hygiene: $label: /" >&2
    fail=1
  fi
}
# Absolute home paths: only the literal placeholder <user> is allowed after the
# home prefix; everything else is a leak.
scan "absolute home path" '(/home/[A-Za-z0-9._-]+|/Users/[A-Za-z0-9._-]+|[A-Za-z]:\\\\Users\\\\[A-Za-z0-9._-]+)' '(/home/<user>|/Users/<user>|Users\\\\<user>|hygiene-check\.sh)'
# Email addresses, except the commit-trailer allow-list.
scan "email address" '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' '(noreply@anthropic\.com|users\.noreply\.github\.com|@example\.invalid|hygiene-check\.sh|@media|@font-face|@import|@2x|@1x)'
# IPv4 addresses (version numbers like 0.1.10 have only three parts; SVG viewBox digits are space-separated).
scan "IPv4 address" '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' '(hygiene-check\.sh|0\.0\.0\.0|127\.0\.0\.1)'
# Private keys and tokens.
scan "private key" '-----BEGIN [A-Z ]*PRIVATE KEY-----' 'hygiene-check\.sh'
scan "token" '(ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})' 'hygiene-check\.sh'
# Product strings must not name commercial games or their publishers (SPEC §1, §13).
scan "trademark" '(Age of Empires|AoE[2-4 ]|Ensemble Studios|Forgotten Empires|wololo)' '(SPEC\.md|hygiene-check\.sh|SPIKES\.md|tools/check\.ts|tools/aoe2de-import/|tests/aoe2de/)'
# Developer-local deny-list: one regex per line in .hygiene-local (gitignored).
if [ -f .hygiene-local ]; then
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    case "$pat" in \#*) continue ;; esac
    scan "local deny-list" "$pat"
  done < .hygiene-local
fi

if [ "$fail" -ne 0 ]; then
  echo "hygiene: FAILED" >&2
  exit 1
fi
echo "hygiene: ok ($(echo "$files" | wc -l | tr -d ' ') files)"
