#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENT="$ROOT/remote/php-agent/agent.php"
FIXTURES="$ROOT/tests/fixtures/php-agent-configs"

if ! command -v php >/dev/null 2>&1; then
  echo "SKIP php-agent config fixture tests: php binary not found"
  if [ "${REQUIRE_PHP_AGENT_TESTS:-0}" = "1" ]; then
    exit 1
  fi
  exit 0
fi

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/typecho-mcp-php-fixtures.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

run_agent() {
  local case_name="$1"
  local method="$2"
  local case_root="$TMP_ROOT/$case_name"

  mkdir -p "$case_root/usr"
  cp "$FIXTURES/$case_name/config.inc.php" "$case_root/config.inc.php"
  : >"$case_root/index.php"

  printf '{"jsonrpc":"2.0","id":"fixture-%s-%s","method":"%s","params":{}}\n' "$case_name" "$method" "$method" \
    | TYPECHO_ROOT="$case_root" php "$AGENT"
}

assert_site_info() {
  local case_name="$1"
  local expected_adapter="$2"
  local expected_kind="$3"
  local expected_prefix="$4"
  local expected_supported="$5"

  local response
  response="$(run_agent "$case_name" "site.info")"

  RESPONSE="$response" CASE_NAME="$case_name" EXPECTED_ADAPTER="$expected_adapter" EXPECTED_KIND="$expected_kind" EXPECTED_PREFIX="$expected_prefix" EXPECTED_SUPPORTED="$expected_supported" node <<'NODE'
const payload = JSON.parse(process.env.RESPONSE);
const result = payload.result;
const name = process.env.CASE_NAME;
if (!result || payload.error) {
  throw new Error(`${name}: expected site.info result, got ${JSON.stringify(payload.error)}`);
}

const database = result.database || {};
const compatibility = database.compatibility || {};
const expectedSupported = process.env.EXPECTED_SUPPORTED === "true";
const checks = [
  ["adapter", database.adapter, process.env.EXPECTED_ADAPTER],
  ["kind", database.kind, process.env.EXPECTED_KIND],
  ["prefix", database.prefix, process.env.EXPECTED_PREFIX],
  ["compatibility.status", compatibility.status, expectedSupported ? "supported" : "unsupported"],
  ["compatibility.supported", compatibility.supported, expectedSupported],
  ["compatibility.readSupported", compatibility.readSupported, expectedSupported],
  ["compatibility.writeSupported", compatibility.writeSupported, expectedSupported],
  ["compatibility.supportedKinds", JSON.stringify(compatibility.supportedKinds), JSON.stringify(["sqlite"])],
];

for (const [label, actual, expected] of checks) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${label}=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

if (typeof compatibility.message !== "string" || compatibility.message.length === 0) {
  throw new Error(`${name}: compatibility.message must be a non-empty string`);
}

if (name === "sqlite") {
  if (database.fileExists !== false) {
    throw new Error(`${name}: expected fixture SQLite fileExists=false`);
  }
} else if (database.fileExists !== null) {
  throw new Error(`${name}: expected non-SQLite fileExists=null`);
}
NODE
}

assert_health_capabilities() {
  local case_name="$1"
  local expected_supported="$2"
  local response
  response="$(run_agent "$case_name" "system.health")"

  RESPONSE="$response" CASE_NAME="$case_name" EXPECTED_SUPPORTED="$expected_supported" node <<'NODE'
const payload = JSON.parse(process.env.RESPONSE);
const result = payload.result;
const name = process.env.CASE_NAME;
const expectedSupported = process.env.EXPECTED_SUPPORTED === "true";
if (!result || payload.error) {
  throw new Error(`${name}: expected system.health result, got ${JSON.stringify(payload.error)}`);
}

const database = result.capabilities?.database;
if (!database) {
  throw new Error(`${name}: expected capabilities.database`);
}

const booleanFields = ["supported", "readSupported", "writeSupported"];
for (const field of booleanFields) {
  if (database[field] !== expectedSupported) {
    throw new Error(`${name}: expected capabilities.database.${field}=${expectedSupported}, got ${database[field]}`);
  }
}

for (const [field, expected] of Object.entries({
  postsRead: expectedSupported,
  postsWrite: expectedSupported,
  mediaRead: expectedSupported,
  mediaWrite: expectedSupported,
  taxonomyRead: expectedSupported,
})) {
  if (result.capabilities[field] !== expected) {
    throw new Error(`${name}: expected capabilities.${field}=${expected}, got ${result.capabilities[field]}`);
  }
}
NODE
}

assert_database_not_supported() {
  local case_name="$1"
  local expected_adapter="$2"
  local expected_kind="$3"
  local operation="$4"
  local response
  response="$(run_agent "$case_name" "posts.list")"

  RESPONSE="$response" CASE_NAME="$case_name" EXPECTED_ADAPTER="$expected_adapter" EXPECTED_KIND="$expected_kind" EXPECTED_OPERATION="$operation" node <<'NODE'
const payload = JSON.parse(process.env.RESPONSE);
const error = payload.error || {};
const details = error.details || {};
const name = process.env.CASE_NAME;

const checks = [
  ["error.code", error.code, "DATABASE_NOT_SUPPORTED"],
  ["error.retryable", error.retryable, false],
  ["details.adapter", details.adapter, process.env.EXPECTED_ADAPTER],
  ["details.kind", details.kind, process.env.EXPECTED_KIND],
  ["details.operation", details.operation, process.env.EXPECTED_OPERATION],
  ["details.supportedKinds", JSON.stringify(details.supportedKinds), JSON.stringify(["sqlite"])],
];

for (const [label, actual, expected] of checks) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${label}=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}
NODE
}

assert_site_info sqlite SQLite sqlite typecho_ true
assert_site_info mysql Mysql mysql blog_ false
assert_site_info pdo-mysql Pdo_Mysql mysql pdo_ false
assert_site_info mysqli Mysqli mysql mysqli_ false
assert_site_info mariadb MariaDB mysql maria_ false
assert_site_info pgsql Pgsql pgsql pg_ false
assert_site_info unknown Typecho_Db_Adapter_Custom unknown custom_ false

assert_health_capabilities sqlite true
assert_health_capabilities mysql false
assert_health_capabilities pdo-mysql false
assert_health_capabilities mysqli false
assert_health_capabilities mariadb false
assert_health_capabilities pgsql false
assert_health_capabilities unknown false

assert_database_not_supported mysql Mysql mysql read
assert_database_not_supported pdo-mysql Pdo_Mysql mysql read
assert_database_not_supported mysqli Mysqli mysql read
assert_database_not_supported mariadb MariaDB mysql read
assert_database_not_supported pgsql Pgsql pgsql read
assert_database_not_supported unknown Typecho_Db_Adapter_Custom unknown read

echo "PASS php-agent config fixture tests"
