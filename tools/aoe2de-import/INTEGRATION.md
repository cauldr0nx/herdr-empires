# Integration snippets for tools/aoe2de-import

These are proposed edits to files outside this folder. They were not applied,
because another change is editing those files at the same time. Apply each by
hand.

## 1. `tools/install.sh`: `import-aoe2de` subcommand (SPEC §18.6)

Header usage block (add after the `status` line):

```sh
#   tools/install.sh [--home DIR] import-aoe2de [--source DIR] [--list] [--dry-run]
```

Variables (next to `templates=0`):

```sh
source_dir=""
importer_args=""
```

Argument loop: add these cases, and add `import-aoe2de` to the command list:

```sh
    --source) source_dir=$2; shift ;;
    --list|--dry-run|--no-shadow) importer_args="$importer_args $1" ;;
    install|update|uninstall|status|import-aoe2de) cmd=$1 ;;
```

Command dispatch: add a new branch to the final `case "$cmd" in`. `$home` is
already resolved at that point.

```sh
  import-aoe2de)
    # Builds empires-packs/aoe2de/ from the user's own game install. Never automatic.
    command -v bun >/dev/null 2>&1 || { echo "install.sh: import-aoe2de needs Bun (https://bun.sh)" >&2; exit 2; }
    set -- --home "$home"
    [ -n "$source_dir" ] && set -- "$@" --source "$source_dir"
    # shellcheck disable=SC2086
    exec bun "$here/tools/aoe2de-import/main.ts" "$@" $importer_args
    ;;
```

The importer prints every file it reads and writes. It exits with 2 when no
install is found.

(SPEC §18.4: `uninstall --purge` is the only command that may remove
`$home/empires-packs/`. That is separate from this change.)

## 2. `tools/hygiene-check.sh`

**a) Never-commit paths** (SPEC §18.6): fail on raw game formats and on any
`empires-packs/` path. Step 1 has the path regex twice (the `grep` that
reports and the `[ -n ... ]` that sets `fail`). Append this alternative to
**both** copies, just before the closing `'`:

```
|\.([Ss][Mm][Xx]|[Ss][Ll][Dd]|[Ss][Ll][Pp]|[Dd][Rr][Ss]|[Dd][Dd][Ss])$|(^|/)empires-packs/
```

For example, the end of the regex becomes:

```
...|\.(jsonl|log|sock|error)$|\.(reset|bak|old|corrupt)-|\.([Ss][Mm][Xx]|[Ss][Ll][Dd]|[Ss][Ll][Pp]|[Dd][Rr][Ss]|[Dd][Dd][Ss])$|(^|/)empires-packs/'
```

The importer's tests never write such files into the repo. They build
synthetic buffers in memory and in OS temp folders.

**b) Trademark scan:** the importer has to name the game's install folder
(`steamapps/common/AoE2DE`), and its README credits the game. That is not a
product string. Exempt the importer and its tests:

```sh
scan "trademark" '(Age of Empires|AoE[2-4 ]|Ensemble Studios|Forgotten Empires|wololo)' '(SPEC\.md|hygiene-check\.sh|SPIKES\.md|tools/check\.ts|tools/aoe2de-import/|tests/aoe2de/)'
```

The importer's own output (`pack.json` title) uses a neutral string,
"Local pack (imported from your own install)".

## 3. `.gitignore`

```gitignore
# Locally imported game art (SPEC §18.6): never committed
empires-packs/
*.smx
*.sld
*.slp
*.drs
*.dds
```

## 4. `package.json` scripts

```json
"import-aoe2de": "bun tools/aoe2de-import/main.ts",
"test:aoe2de": "bun test tests/aoe2de"
```

`bun test` (the existing `test` script) already picks up `tests/aoe2de/*.test.ts`.

## 5. Mod side (for whoever owns `mods/empires/`)

- Pack folder: `<app home>/empires-packs/aoe2de/pack.json`. The schema is
  SPEC §18.4, plus:
  - `dirOrder: ["s","sw","w","nw","n","ne","e","se"]`: sheet row order,
    clockwise on screen from facing the viewer.
  - `playerColorHex`: name → hex for the 8 colours.
  - `local: true`, `license: "LicenseRef-local-only"`.
- Nature entities (`tree`, `gold_mine`, `stone_mine`, `berry_bush`) have
  `image` (the first variant) and `variants`. Buildings have `image` with a
  `{color}` placeholder. Unit anims have `sheet` with `{color}`, plus `dirs`,
  `frames` (per direction) and `fps`.
- Entities not found in the install are left out of `entities`. The mod's
  fallback chain covers them.
- Options → "show the command": `tools/install.sh import-aoe2de` (optionally
  with `--source DIR`).
