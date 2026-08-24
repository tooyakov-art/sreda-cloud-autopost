import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "src", "cli.mjs");
const CONFIG = path.join(ROOT, "config", "direct-replies.example.json");

function run(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ...env },
  });
}

test("Direct live mode needs both gates and still cannot send", () => {
  const withoutEnvGate = run(["direct-poll", "--mode", "live", "--config", CONFIG]);
  assert.equal(withoutEnvGate.status, 1);
  assert.match(withoutEnvGate.stderr, /--mode live и SREDA_IG_DIRECT_LIVE_ENABLED=true/);

  const withBothGates = run(
    ["direct-poll", "--mode", "live", "--config", CONFIG],
    { SREDA_IG_DIRECT_LIVE_ENABLED: "true" },
  );
  assert.equal(withBothGates.status, 1);
  assert.match(withBothGates.stderr, /не реализована и остаётся заблокированной/);
  assert.doesNotMatch(withBothGates.stderr, /access token|SREDA_IG_USER_ID/i);
});

test("Direct dry-run refuses a live ledger option before API access", () => {
  const result = run([
    "direct-poll",
    "--dry-run",
    "--config",
    CONFIG,
    "--ledger",
    path.join(ROOT, ".runtime", "direct-live-ledger.json"),
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /отдельный --preview-ledger/);
  assert.doesNotMatch(result.stderr, /access token|SREDA_IG_USER_ID/i);
});
