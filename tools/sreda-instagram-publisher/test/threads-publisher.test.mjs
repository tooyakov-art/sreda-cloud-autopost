import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ThreadsClient, ThreadsPublishUncertainError } from "../src/threads-client.mjs";
import { publishThreadsTextIdempotent } from "../src/threads-publisher.mjs";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Threads verifies /me, creates and publishes text without token in URL or ledger", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-threads-test-"));
  const calls = [];
  let nextId = 900;
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const body = options.body ? Object.fromEntries(options.body.entries()) : {};
    calls.push({ url: parsed.toString(), method: options.method || "GET", body });
    assert.equal(options.headers?.Authorization, "Bearer threads-test-secret");
    assert.ok(!parsed.searchParams.has("access_token"));
    if ((options.method || "GET") === "GET") {
      if (parsed.pathname.endsWith("/me")) return response({ id: "777", username: "sreda.astana" });
      return response({ id: parsed.pathname.split("/").pop(), status: "FINISHED" });
    }
    return response({ id: String(nextId++) });
  };

  try {
    const ledgerFile = path.join(temp, "ledger.json");
    const client = new ThreadsClient({ accessToken: "threads-test-secret", fetchImpl });
    const profile = await client.verifyProfile({ expectedUsername: "sreda.astana" });
    assert.deepEqual(profile, { id: "777", username: "sreda.astana" });
    const first = await publishThreadsTextIdempotent({
      client,
      ledgerFile,
      key: "threads-1",
      text: "SREDA test",
    });
    assert.equal(first.containerId, "900");
    assert.equal(first.id, "901");
    assert.equal(calls[1].url, "https://graph.threads.net/v1.0/777/threads");
    assert.deepEqual(calls[1].body, { media_type: "TEXT", text: "SREDA test" });
    assert.equal(calls[2].url, "https://graph.threads.net/v1.0/900?fields=id,status,error_message");
    assert.equal(calls[3].url, "https://graph.threads.net/v1.0/777/threads_publish");
    assert.equal(calls[3].body.creation_id, "900");

    const beforeDuplicate = calls.length;
    const duplicate = await publishThreadsTextIdempotent({
      client,
      ledgerFile,
      key: "threads-1",
      text: "SREDA test",
    });
    assert.equal(duplicate.duplicatePrevented, true);
    assert.equal(calls.length, beforeDuplicate);
    assert.equal((await readFile(ledgerFile, "utf8")).includes("threads-test-secret"), false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Threads uncertain publish is recorded and never retried automatically", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-threads-test-"));
  let publishCalls = 0;
  const client = {
    async createTextContainer() { return "800"; },
    async waitForContainer() { return { id: "800", status: "FINISHED" }; },
    async publishContainer() {
      publishCalls += 1;
      throw new ThreadsPublishUncertainError("800", new Error("connection lost"));
    },
  };
  const args = {
    client,
    ledgerFile: path.join(temp, "ledger.json"),
    key: "threads-uncertain",
    text: "SREDA test",
  };
  try {
    await assert.rejects(() => publishThreadsTextIdempotent(args), ThreadsPublishUncertainError);
    await assert.rejects(() => publishThreadsTextIdempotent(args), /автоматический повтор заблокирован/);
    assert.equal(publishCalls, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Threads auto_publish_text uses the current official flag", async () => {
  const calls = [];
  const client = new ThreadsClient({
    accessToken: "threads-test-secret",
    fetchImpl: async (url, options = {}) => {
      const body = options.body ? Object.fromEntries(options.body.entries()) : {};
      calls.push({ url, method: options.method || "GET", body });
      if ((options.method || "GET") === "GET") return response({ id: "777", username: "sreda.astana" });
      return response({ id: "999" });
    },
  });
  const result = await client.autoPublishText("SREDA test");
  assert.equal(result.id, "999");
  assert.equal(calls[1].body.auto_publish_text, "true");
});

test("Threads waits for FINISHED before calling numeric user threads_publish", async () => {
  let statusCalls = 0;
  const calls = [];
  const client = new ThreadsClient({
    accessToken: "threads-test-secret",
    pollIntervalMs: 1,
    pollTimeoutMs: 100,
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(url);
      const body = options.body ? Object.fromEntries(options.body.entries()) : {};
      calls.push({ path: parsed.pathname, method: options.method || "GET", body });
      if ((options.method || "GET") === "GET" && parsed.pathname.endsWith("/me")) {
        return response({ id: "27792043467134953", username: "sreda.astana" });
      }
      if ((options.method || "GET") === "GET") {
        statusCalls += 1;
        return response({ id: "123", status: statusCalls === 1 ? "IN_PROGRESS" : "FINISHED" });
      }
      if (parsed.pathname.endsWith("/threads_publish")) return response({ id: "456" });
      return response({ id: "123" });
    },
  });
  await client.verifyProfile();
  const containerId = await client.createTextContainer("SREDA test");
  const ready = await client.waitForContainer(containerId);
  assert.equal(ready.status, "FINISHED");
  const published = await client.publishContainer(containerId);
  assert.equal(published.id, "456");
  assert.equal(calls.at(-1).path, "/v1.0/27792043467134953/threads_publish");
  assert.equal(statusCalls, 2);
});

test("Threads creates IMAGE container with HTTPS media and lists recent posts", async () => {
  const calls = [];
  const client = new ThreadsClient({
    accessToken: "threads-test-secret",
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(url);
      const body = options.body ? Object.fromEntries(options.body.entries()) : {};
      calls.push({ parsed, method: options.method || "GET", body });
      if (parsed.pathname.endsWith("/me")) return response({ id: "777", username: "sreda.astana" });
      if ((options.method || "GET") === "POST") return response({ id: "888" });
      return response({ data: [{ id: "999", text: "Recent", permalink: "https://threads.example/999" }] });
    },
  });
  await client.verifyProfile();
  const container = await client.createImageContainer({ imageUrl: "https://media.example/post.jpg", text: "Image post" });
  assert.equal(container, "888");
  assert.deepEqual(calls[1].body, {
    media_type: "IMAGE",
    image_url: "https://media.example/post.jpg",
    text: "Image post",
  });
  const recent = await client.listRecentThreads({ limit: 50 });
  assert.equal(recent[0].id, "999");
  assert.equal(calls[2].parsed.searchParams.get("limit"), "50");
  await assert.rejects(() => client.createImageContainer({ imageUrl: "http://unsafe.example/post.jpg", text: "No" }), /HTTPS/);
});

test("Threads creates ordered IMAGE children and a CAROUSEL parent", async () => {
  const calls = [];
  let nextId = 100;
  const client = new ThreadsClient({
    accessToken: "threads-test-secret",
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(url);
      const body = options.body ? Object.fromEntries(options.body.entries()) : {};
      calls.push({ parsed, method: options.method || "GET", body });
      if ((options.method || "GET") === "GET") {
        return response({ id: "777", username: "sreda.astana" });
      }
      return response({ id: String(nextId++) });
    },
  });
  await client.verifyProfile();
  const first = await client.createImageCarouselItemContainer({
    imageUrl: "https://media.example/first.jpg",
    altText: "Первый слайд",
  });
  const second = await client.createImageCarouselItemContainer({
    imageUrl: "https://media.example/second.jpg",
  });
  const carousel = await client.createCarouselContainer({
    childIds: [first, second],
    text: "Carousel text",
  });

  assert.equal(carousel, "102");
  assert.deepEqual(calls[1].body, {
    media_type: "IMAGE",
    image_url: "https://media.example/first.jpg",
    is_carousel_item: "true",
    alt_text: "Первый слайд",
  });
  assert.deepEqual(calls[2].body, {
    media_type: "IMAGE",
    image_url: "https://media.example/second.jpg",
    is_carousel_item: "true",
  });
  assert.deepEqual(calls[3].body, {
    media_type: "CAROUSEL",
    children: "100,101",
    text: "Carousel text",
  });
  await assert.rejects(
    () => client.createCarouselContainer({ childIds: ["100"], text: "Too short" }),
    /от 2 до 20/,
  );
  await assert.rejects(
    () => client.createImageCarouselItemContainer({ imageUrl: "http://unsafe.example/slide.jpg" }),
    /HTTPS/,
  );
});
