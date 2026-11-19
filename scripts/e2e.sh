#!/usr/bin/env bash
# The VS Code extension end to end, inside a real VS Code: the language
# server (symbols, hover, definition, diagnostics, formatting) and the debugger (breakpoint,
# stack, variables, evaluate, continue, program output), against each `auk` given.
#
#   scripts/e2e.sh [<auk>...]   (default: the auk on PATH)
#
# Needs VS Code ($VSCODE, default the macOS app). Opens a VS Code window for a few seconds per
# binary, with a throwaway user-data and extensions directory (your settings and extensions are
# not used or touched). Exit 1 if any binary fails; reports in .e2e/<n>.json.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VSCODE="${VSCODE:-/Applications/Visual Studio Code.app/Contents/MacOS/Code}"
[ -x "$VSCODE" ] || { echo "vscode_e2e: no VS Code at $VSCODE (set VSCODE)" >&2; exit 2; }
if [ "$#" = 0 ]; then set -- "$(command -v auk)"; fi
OUT="$ROOT/.e2e"
rm -rf "$OUT"; mkdir -p "$OUT"
status=0 n=0
for bin in "$@"; do
  n=$((n + 1))
  bin="$(cd "$(dirname "$bin")" && pwd)/$(basename "$bin")"
  ws="$OUT/ws$n"
  mkdir -p "$ws/.vscode"
  printf '{ "auk.path": "%s", "security.workspace.trust.enabled": false }\n' "$bin" > "$ws/.vscode/settings.json"
  cat > "$ws/prog.auk" <<'EOF'
fn add(a: int, b: int): int = a + b

fn main() {
  let x = 40
  let y = add(x, 2)
  print("y = {y}")
}
EOF
  printf 'fn main() {\n  let n: int = "text"\n  print(n)\n}\n' > "$ws/bad.auk"
  printf 'fn f(a:int):int{a+1}\n' > "$ws/messy.auk"
  report="$OUT/$n.json"
  AUK_E2E_OUT="$report" "$VSCODE" \
    --user-data-dir "$OUT/user$n" --extensions-dir "$OUT/ext$n" \
    --disable-workspace-trust --skip-welcome --skip-release-notes --new-window \
    --extensionDevelopmentPath="$ROOT" \
    --extensionTestsPath="$ROOT/test/e2e/index.js" \
    "$ws" > "$OUT/$n.log" 2>&1 || true
  if [ -f "$report" ] && grep -q '"ok": true' "$report" && ! grep -q '"ok": false' "$report"; then
    echo "vscode e2e $bin: ok ($(grep -c '"name"' "$report") checks)"
  else
    echo "vscode e2e $bin: FAILED (see $report, $OUT/$n.log)"
    [ -f "$report" ] && grep -A3 '"error"' "$report" | head -5
    status=1
  fi
done
exit "$status"
