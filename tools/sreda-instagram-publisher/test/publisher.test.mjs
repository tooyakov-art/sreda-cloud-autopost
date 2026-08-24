import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { InstagramClient } from "../src/instagram-client.mjs";
import { createMediaServer } from "../src/media-stage.mjs";
import { publishCarouselIdempotent, publishStoryIdempotent } from "../src/publisher.mjs";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch() {
  let nextId = 100;
  const statuses = new Map();
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const body = options.body ? Object.fromEntries(options.body.entries()) : {};
    calls.push({ url: parsed.toString(), method: options.method || "GET", body, authorization: options.headers?.Authorization });
    assert.equal(options.headers?.Authorization, "Bearer test-secret-token");
    assert.ok(!parsed.searchParams.has("access_token"));

    if ((options.method || "GET") === "GET") {
      const id = parsed.pathname.split("/").pop();
      return response({ id, status_code: statuses.get(id) || "FINISHED", status: "Ready" });
    }
    if (parsed.pathname.endsWith("/media_publish")) {
      statuses.set(body.creation_id, "PUBLISHED");
      return response({ id: String(nextId++) });
    }
    const id = String(nextId++);
    statuses.set(id, "FINISHED");
    return response({ id });
  };
  return { fetchImpl, calls };
}

test("Story creates, polls and publishes without leaking token in URL", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-ig-test-"));
  try {
    const ledgerFile = path.join(temp, "ledger.json");
    const mock = mockFetch();
    const client = new InstagramClient({
      accessToken: "test-secret-token",
      userId: "777",
      fetchImpl: mock.fetchImpl,
      pollIntervalMs: 1,
      pollTimeoutMs: 100,
    });
    const first = await publishStoryIdempotent({
      client,
      ledgerFile,
      key: "story-1",
      imageUrl: "https://media.example/story.jpg",
    });
    assert.ok(first.id);
    const callCount = mock.calls.length;
    const second = await publishStoryIdempotent({
      client,
      ledgerFile,
      key: "story-1",
      imageUrl: "https://media.example/story.jpg",
    });
    assert.equal(second.duplicatePrevented, true);
    assert.equal(mock.calls.length, callCount);
    assert.equal((await readFile(ledgerFile, "utf8")).includes("test-secret-token"), false);
    assert.equal(mock.calls[0].body.media_type, "STORIES");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Carousel creates children, parent and one publication", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-ig-test-"));
  try {
    const mock = mockFetch();
    const client = new InstagramClient({
      accessToken: "test-secret-token",
      userId: "777",
      fetchImpl: mock.fetchImpl,
      pollIntervalMs: 1,
      pollTimeoutMs: 100,
    });
    const result = await publishCarouselIdempotent({
      client,
      ledgerFile: path.join(temp, "ledger.json"),
      key: "carousel-1",
      items: [
        { url: "https://media.example/1.jpg", type: "IMAGE" },
        { url: "https://media.example/2.jpg", type: "IMAGE" },
      ],
      caption: "SREDA",
    });
    assert.ok(result.id);
    const posts = mock.calls.filter((call) => call.method === "POST");
    assert.equal(posts.length, 4);
    assert.equal(posts[0].body.is_carousel_item, "true");
    assert.equal(posts[2].body.media_type, "CAROUSEL");
    assert.equal(posts[2].body.caption, "SREDA");
    assert.equal(posts[3].body.creation_id, result.containerId);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Client rejects non-HTTPS media", async () => {
  const client = new InstagramClient({
    accessToken: "test-secret-token",
    userId: "777",
    fetchImpl: async () => response({}),
  });
  await assert.rejects(() => client.createStoryContainer("http://localhost/story.jpg"), /HTTPS/);
});

test("Known Meta 4xx is not retried", async () => {
  let calls = 0;
  const client = new InstagramClient({
    accessToken: "test-secret-token",
    userId: "777",
    fetchImpl: async () => {
      calls += 1;
      return response({ error: { message: "Bad permission", code: 10 } }, 400);
    },
  });
  await assert.rejects(() => client.createStoryContainer("https://media.example/story.jpg"), /Bad permission/);
  assert.equal(calls, 1);
});

test("Media server serves only exact staged filenames", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-stage-test-"));
  const publicDir = path.join(temp, "public");
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(publicDir, { recursive: true });
  await writeFile(path.join(publicDir, "safe-file.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const { server } = createMediaServer({ runtimeDir: temp, controlToken: "test-control" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const found = await fetch(`http://127.0.0.1:${port}/media/safe-file.jpg`);
    assert.equal(found.status, 200);
    assert.equal(found.headers.get("content-type"), "image/jpeg");
    const traversal = await fetch(`http://127.0.0.1:${port}/media/..%2Fsecret.txt`);
    assert.equal(traversal.status, 404);
    const listing = await fetch(`http://127.0.0.1:${port}/media/`);
    assert.equal(listing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true, force: true });
  }
});
