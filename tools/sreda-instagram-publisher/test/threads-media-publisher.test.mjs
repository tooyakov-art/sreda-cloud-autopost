import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ThreadsPublishUncertainError } from "../src/threads-client.mjs";
import { publishThreadsPostIdempotent } from "../src/threads-media-publisher.mjs";

test("image Threads post is published once and persisted without temporary URL in fingerprint", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-threads-media-"));
  const calls = [];
  const client = {
    async listRecentThreads() { calls.push("list"); return []; },
    async createImageContainer(input) { calls.push(["create", input]); return "100"; },
    async waitForContainer(id) { calls.push(["wait", id]); return { id, status: "FINISHED" }; },
    async publishContainer(id) { calls.push(["publish", id]); return { id: "200" }; },
    async getThread(id) {
      calls.push(["verify", id]);
      return { id, text: "SREDA text", media_type: "IMAGE", permalink: "https://threads.example/200" };
    },
  };
  const args = {
    client,
    ledgerFile: path.join(temp, "ledger.json"),
    key: "sreda-th-01",
    text: "SREDA text",
    imageUrl: "https://temporary.example/media.jpg",
    inputIdentity: "stable-sha256",
  };
  try {
    const first = await publishThreadsPostIdempotent(args);
    assert.equal(first.id, "200");
    assert.equal(first.mediaType, "IMAGE");
    assert.equal(calls.filter((item) => Array.isArray(item) && item[0] === "publish").length, 1);
    const second = await publishThreadsPostIdempotent({ ...args, imageUrl: "https://another-tunnel.example/media.jpg" });
    assert.equal(second.duplicatePrevented, true);
    assert.equal(calls.filter((item) => Array.isArray(item) && item[0] === "publish").length, 1);
    const ledger = await readFile(args.ledgerFile, "utf8");
    assert.equal(ledger.includes("temporary.example"), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("lost ledger is recovered from exact public text before creating a container", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-threads-media-"));
  let creates = 0;
  const client = {
    async listRecentThreads() {
      return [{ id: "300", text: "Already live", permalink: "https://threads.example/300" }];
    },
    async createTextContainer() { creates += 1; return "never"; },
  };
  try {
    const result = await publishThreadsPostIdempotent({
      client,
      ledgerFile: path.join(temp, "ledger.json"),
      key: "sreda-th-02",
      text: "Already live",
    });
    assert.equal(result.id, "300");
    assert.equal(result.recoveredFromProfile, true);
    assert.equal(creates, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("uncertain image publish is never retried automatically", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-threads-media-"));
  let publishes = 0;
  const client = {
    async listRecentThreads() { return []; },
    async createImageContainer() { return "400"; },
    async waitForContainer() { return { id: "400", status: "FINISHED" }; },
    async publishContainer() {
      publishes += 1;
      throw new ThreadsPublishUncertainError("400", new Error("network lost"));
    },
  };
  const args = {
    client,
    ledgerFile: path.join(temp, "ledger.json"),
    key: "sreda-th-03",
    text: "Uncertain",
    imageUrl: "https://example.test/media.jpg",
    inputIdentity: "sha",
  };
  try {
    await assert.rejects(() => publishThreadsPostIdempotent(args), ThreadsPublishUncertainError);
    await assert.rejects(() => publishThreadsPostIdempotent(args), /автоматический повтор заблокирован/);
    assert.equal(publishes, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
