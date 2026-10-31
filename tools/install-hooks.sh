#!/bin/sh
# Installs the pre-commit hygiene hook for this clone (SPEC §15).
cd "$(dirname "$0")/.." || exit 1
mkdir -p .git/hooks
cat > .git/hooks/pre-commit <<'HOOK'
#!/bin/sh
exec sh tools/hygiene-check.sh --staged
HOOK
chmod +x .git/hooks/pre-commit
echo "pre-commit hook installed: tools/hygiene-check.sh --staged"
