#!/usr/bin/env bash
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
MODE="${1:-verify}"
EXCLUDED_LOGO_PATH="docs/brand/logo-ai-generations/**"
failure_status=0
official_status=0

cd "$ROOT_DIR" || exit 1

log() {
  printf '%s\n' "$*"
}

record_failure() {
  local status="$1"
  local message="$2"

  log "error: $message"
  if [ "$failure_status" -eq 0 ]; then
    failure_status="$status"
  fi
}

show_command() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    printf '%-10s %s\n' "$name" "$(command -v "$name")"
    case "$name" in
      node|npm|npx|corepack|cargo|rustc|tauri)
        "$name" --version 2>/dev/null | sed "s/^/  version: /" || true
        ;;
    esac
  else
    printf '%-10s %s\n' "$name" "not found"
  fi
}

check_required_command() {
  local name="$1"
  local detail="$2"
  if ! command -v "$name" >/dev/null 2>&1; then
    record_failure 127 "$detail"
  fi
}

check_required_path() {
  local path="$1"
  local detail="$2"
  if [ ! -e "$path" ]; then
    record_failure 1 "$detail"
  fi
}

run_step() {
  local label="$1"
  shift

  log ""
  log "== $label =="
  "$@"
  local status=$?
  if [ "$status" -ne 0 ]; then
    record_failure "$status" "$label failed with exit $status"
  fi
}

run_artifact_scan() {
  local pattern='(\.app/|\.dmg$|\.pkg$|\.p12$|\.pfx$|\.pem$|\.key$|\.crt$|\.cer$|\.mobileprovision$|\.provisionprofile$|(^|/)target/|(^|/)gen/|(^|/)dist/|(^|/)coverage/|debug-bundle|\.log$|(^|/)\.env($|\.))'
  local tracked_matches
  local status_matches

  tracked_matches="$(git ls-files -- ":!$EXCLUDED_LOGO_PATH" | rg -n "$pattern" || true)"
  if [ -n "$tracked_matches" ]; then
    log "$tracked_matches"
    record_failure 1 "tracked forbidden artifact or local material path detected"
  fi

  status_matches="$(git status --short --untracked-files=all -- ":!$EXCLUDED_LOGO_PATH" | rg -n "$pattern" || true)"
  if [ -n "$status_matches" ]; then
    log "$status_matches"
    record_failure 1 "working tree contains forbidden artifact or local material path"
  fi
}

run_secret_scan() {
  local secret_pattern='BEGIN (RSA|OPENSSH|PRIVATE) KEY|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]+|gh[pousr]_[A-Za-z0-9_]+'
  local matches

  matches="$(rg -n -i "$secret_pattern" \
    --glob "!$EXCLUDED_LOGO_PATH" \
    --glob '!node_modules/**' \
    --glob '!dist/**' \
    --glob '!coverage/**' \
    --glob '!target/**' \
    --glob '!gen/**' \
    --glob '!*.lock' \
    . || true)"
  if [ -n "$matches" ]; then
    log "$matches"
    record_failure 1 "secret-like material detected"
  fi
}

run_status_summary() {
  git status --short --branch --untracked-files=all -- ":!$EXCLUDED_LOGO_PATH"
}

run_confirm_grep() {
  rg -n "confirm[=]true|confirm:\\s*true" apps/desktop apps/web-console/public || true
}

run_official_bundle_attempt() {
  if ! command -v npm >/dev/null 2>&1; then
    log "Official Tauri bundle attempt: npm run desktop:build"
    log "classification: tooling limitation"
    log "exit: 127"
    log "reason: npm not found in PATH. The Codex bundled Node may provide node without npm/npx/corepack; install or repair a system Node LTS toolchain, then install project dependencies for the repo-local Tauri CLI."
    official_status=127
    return 127
  fi

  log "Official Tauri bundle attempt: npm run desktop:build"
  npm run desktop:build
  official_status=$?
  if [ "$official_status" -ne 0 ]; then
    log "classification: dependency/toolchain or bundle failure; inspect npm/Tauri output above"
    log "exit: $official_status"
    return "$official_status"
  fi

  log "classification: official Tauri bundle passed"
  return 0
}

log "Desktop bundle hygiene verification"
log "repo: $ROOT_DIR"
log "mode: $MODE"
log ""

show_command node
show_command npm
show_command npx
show_command corepack
show_command cargo
show_command rustc
show_command tauri
log "PATH=$PATH"

check_required_command node "node not found in PATH. Install or repair a system Node LTS distribution before desktop bundle verification."
check_required_command npm "npm not found in PATH. The Codex bundled Node may provide node without npm/npx/corepack; install or repair a system Node LTS distribution that provides npm."
check_required_command cargo "cargo not found in PATH. Install or activate the Rust toolchain before desktop bundle verification."

check_required_path "package.json" "root package.json is missing"
check_required_path "apps/desktop/package.json" "desktop package.json is missing"
check_required_path "apps/desktop/src-tauri/tauri.conf.json" "Tauri config is missing"
check_required_path "apps/desktop/src-tauri/Cargo.toml" "Tauri Cargo.toml is missing"
check_required_path "apps/web-console/public/index.html" "bundled renderer index.html is missing"
check_required_path "apps/desktop/src-tauri/icons/icon.png" "Tauri icon is missing"

if [ ! -f "package-lock.json" ]; then
  log "warning: package-lock.json is not present. Running npm install may create a reviewable package-lock.json; do not commit node_modules or npm cache."
fi

if [ ! -x "node_modules/.bin/tauri" ]; then
  log "warning: repo-local Tauri CLI is not installed at node_modules/.bin/tauri. Install project dependencies after npm is available."
fi

run_step "git status summary" run_status_summary
run_step "tracked/status artifact scan" run_artifact_scan
run_step "secret-like material scan" run_secret_scan

if [ "$MODE" = "--preflight" ] || [ "$MODE" = "preflight" ]; then
  if [ "$failure_status" -ne 0 ]; then
    log ""
    log "Preflight completed with failures; exit $failure_status."
    exit "$failure_status"
  fi
  log ""
  log "Preflight passed."
  exit 0
fi

run_step "node --check apps/web-console/public/backend.js" node --check apps/web-console/public/backend.js
run_step "node --check apps/web-console/public/main.js" node --check apps/web-console/public/main.js
run_step "bash tests/smoke.sh" bash tests/smoke.sh
run_step "git diff --check" git diff --check
run_step "cargo fmt --check" cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
run_step "cargo check" cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
run_step "cargo test" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
run_step "official Tauri bundle attempt" run_official_bundle_attempt
run_step "confirm grep" run_confirm_grep
run_step "final artifact scan" run_artifact_scan
run_step "final secret-like material scan" run_secret_scan
run_step "final git status summary" run_status_summary

log ""
if [ "$failure_status" -ne 0 ]; then
  log "Desktop bundle hygiene verification completed with failures; exit $failure_status."
  if [ "$official_status" -eq 127 ]; then
    log "Official bundle residual risk: current shell lacks npm, so Tauri did not start."
  fi
  exit "$failure_status"
fi

log "Desktop bundle hygiene verification passed."
