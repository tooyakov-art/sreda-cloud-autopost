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

test("carousel children stay ordered and the post is published only once across tunnel URLs", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-threads-carousel-"));
  const calls = [];
  let childNumber = 0;
  const client = {
    async listRecentThreads() { calls.push("list"); return []; },
    async createImageCarouselItemContainer(input) {
      calls.push(["create-child", input]);
      childNumber += 1;
      return String(100 + childNumber);
    },
    async waitForContainer(id) { calls.push(["wait", id]); return { id, status: "FINISHED" }; },
    async createCarouselContainer(input) { calls.push(["create-carousel", input]); return "500"; },
    async publishContainer(id) { calls.push(["publish", id]); return { id: "600" }; },
    async getThread(id) {
      calls.push(["verify", id]);
      return {
        id,
        text: "SREDA carousel",
        media_type: "CAROUSEL",
        permalink: "https://threads.example/600",
      };
    },
  };
  const args = {
    client,
    ledgerFile: path.join(temp, "ledger.json"),
    key: "sreda-th-carousel",
    text: "SREDA carousel",
    imageUrls: [
      "https://temporary.example/slide-1.jpg",
      "https://temporary.example/slide-2.jpg",
      "https://temporary.example/slide-3.jpg",
    ],
    inputIdentity: ["sha-1", "sha-2", "sha-3"],
  };
  try {
    const first = await publishThreadsPostIdempotent(args);
    assert.equal(first.id, "600");
    assert.equal(first.mediaType, "CAROUSEL");
    assert.deepEqual(
      calls.filter((item) => Array.isArray(item) && item[0] === "create-child").map((item) => item[1].imageUrl),
      args.imageUrls,
    );
    assert.deepEqual(
      calls.find((item) => Array.isArray(item) && item[0] === "create-carousel")[1],
      { childIds: ["101", "102", "103"], text: "SREDA carousel" },
    );
    assert.equal(calls.filter((item) => Array.isArray(item) && item[0] === "publish").length, 1);

    const duplicate = await publishThreadsPostIdempotent({
      ...args,
      imageUrls: [
        "https://another-tunnel.example/slide-1.jpg",
        "https://another-tunnel.example/slide-2.jpg",
        "https://another-tunnel.example/slide-3.jpg",
      ],
    });
    assert.equal(duplicate.duplicatePrevented, true);
    assert.equal(calls.filter((item) => Array.isArray(item) && item[0] === "publish").length, 1);
    const ledger = await readFile(args.ledgerFile, "utf8");
    assert.equal(ledger.includes("temporary.example"), false);
    assert.equal(ledger.includes("another-tunnel.example"), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("carousel resumes from persisted child IDs after a creation failure", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-threads-carousel-resume-"));
  const createdUrls = [];
  let failSecondOnce = true;
  let nextChild = 700;
  const client = {
    async listRecentThreads() { return []; },
    async createImageCarouselItemContainer({ imageUrl }) {
      createdUrls.push(imageUrl);
      if (imageUrl.endsWith("second.jpg") && failSecondOnce) {
        failSecondOnce = false;
        throw new Error("temporary create failure");
      }
      nextChild += 1;
      return String(nextChild);
    },
    async waitForContainer(id) { return { id, status: "FINISHED" }; },
    async createCarouselContainer({ childIds }) {
      assert.deepEqual(childIds, ["701", "702", "703"]);
      return "800";
    },
    async publishContainer() { return { id: "900" }; },
    async getThread(id) { return { id, text: "Resume carousel", media_type: "CAROUSEL" }; },
  };
  const args = {
    client,
    ledgerFile: path.join(temp, "ledger.json"),
    key: "sreda-th-carousel-resume",
    text: "Resume carousel",
    imageUrls: [
      "https://media.example/first.jpg",
      "https://media.example/second.jpg",
      "https://media.example/third.jpg",
    ],
    inputIdentity: ["sha-1", "sha-2", "sha-3"],
  };
  try {
    await assert.rejects(() => publishThreadsPostIdempotent(args), /temporary create failure/);
    const result = await publishThreadsPostIdempotent(args);
    assert.equal(result.id, "900");
    assert.equal(createdUrls.filter((url) => url.endsWith("first.jpg")).length, 1);
    assert.equal(createdUrls.filter((url) => url.endsWith("second.jpg")).length, 2);
    assert.equal(createdUrls.filter((url) => url.endsWith("third.jpg")).length, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("published ID prevents a second publish when verification fails", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-threads-verify-resume-"));
  let publishes = 0;
  let verifies = 0;
  const client = {
    async listRecentThreads() { return []; },
    async createImageContainer() { return "910"; },
    async waitForContainer() { return { id: "910", status: "FINISHED" }; },
    async publishContainer() { publishes += 1; return { id: "920" }; },
    async getThread(id) {
      verifies += 1;
      if (verifies === 1) throw new Error("verification network failure");
      return { id, text: "Verify once", media_type: "IMAGE" };
    },
  };
  const args = {
    client,
    ledgerFile: path.join(temp, "ledger.json"),
    key: "sreda-th-verify-resume",
    text: "Verify once",
    imageUrl: "https://media.example/post.jpg",
    inputIdentity: "stable-sha",
  };
  try {
    await assert.rejects(() => publishThreadsPostIdempotent(args), /verification network failure/);
    const result = await publishThreadsPostIdempotent(args);
    assert.equal(result.id, "920");
    assert.equal(result.recoveredAfterVerificationFailure, true);
    assert.equal(publishes, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
