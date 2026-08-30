import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  InstagramApiError,
  InstagramClient,
  PublishUncertainError,
} from "../src/instagram-client.mjs";
import { createMediaServer } from "../src/media-stage.mjs";
import {
  prepareStoryIdempotent,
  PublicationNeedsReconciliationError,
  publishCarouselIdempotent,
  publishReservedStory,
  reserveStoryPublication,
} from "../src/publisher.mjs";

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

async function publishStoryInPhases(options, reservationId = "test-run") {
  const prepared = await prepareStoryIdempotent(options);
  if (!prepared.needsPublish) return prepared;
  await reserveStoryPublication({
    ledgerFile: options.ledgerFile,
    key: options.key,
    reservationId,
    publishDeadline: options.publishDeadline,
  });
  return publishReservedStory({
    client: options.client,
    ledgerFile: options.ledgerFile,
    key: options.key,
    reservationId,
    publishDeadline: options.publishDeadline,
  });
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
    const story = {
      client,
      ledgerFile,
      key: "story-1",
      imageUrl: "https://media.example/story.jpg",
    };
    const prepared = await prepareStoryIdempotent(story);
    assert.equal(prepared.needsPublish, true);
    await reserveStoryPublication({
      ledgerFile,
      key: story.key,
      reservationId: "run-1",
    });
    const reservedLedger = JSON.parse(await readFile(ledgerFile, "utf8"));
    assert.ok(reservedLedger.publications[story.key].publishAttemptedAt);
    assert.equal(reservedLedger.publications[story.key].publishReservationId, "run-1");
    assert.equal(mock.calls.filter((call) => call.url.includes("media_publish")).length, 0);
    const first = await publishReservedStory({
      client,
      ledgerFile,
      key: story.key,
      reservationId: "run-1",
    });
    assert.ok(first.id);
    const callCount = mock.calls.length;
    const second = await prepareStoryIdempotent(story);
    assert.equal(second.duplicatePrevented, true);
    assert.equal(mock.calls.length, callCount);
    assert.equal((await readFile(ledgerFile, "utf8")).includes("test-secret-token"), false);
    assert.equal(mock.calls[0].body.media_type, "STORIES");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Story retries propagation when Meta cannot find a new container", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-ig-test-"));
  let statusCalls = 0;
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const method = options.method || "GET";
    const body = options.body ? Object.fromEntries(options.body.entries()) : {};
    calls.push({ method, path: parsed.pathname, body });
    if (method === "GET" && parsed.pathname.endsWith("/200") && statusCalls++ === 0) {
      return response({ error: { message: "The media with 200 cannot be found.", code: 100 } }, 400);
    }
    if (method === "GET") return response({ status_code: "FINISHED" });
    if (parsed.pathname.endsWith("/media_publish")) return response({ id: "999" });
    return response({ id: "200" });
  };
  try {
    const client = new InstagramClient({
      accessToken: "test-secret-token",
      userId: "777",
      fetchImpl,
      pollIntervalMs: 1,
      pollTimeoutMs: 100,
    });
    const result = await publishStoryInPhases({
      client,
      ledgerFile: path.join(temp, "ledger.json"),
      key: "story-recover-container",
      imageUrl: "https://media.example/story.jpg",
    });
    assert.equal(result.id, "999");
    assert.equal(calls.filter((call) => call.method === "POST" && call.path.endsWith("/media")).length, 1);
    assert.equal(calls.filter((call) => call.method === "GET" && call.path.endsWith("/200")).length, 2);
    assert.equal(calls.filter((call) => call.path.endsWith("/media_publish")).length, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Story never repeats an uncertain media_publish POST", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-ig-test-"));
  let publishCalls = 0;
  const client = {
    createStoryContainer: async () => "300",
    getContainerStatus: async () => ({ status_code: "FINISHED" }),
    waitForContainer: async () => ({ status_code: "FINISHED" }),
    publishContainer: async () => {
      publishCalls += 1;
      throw new PublishUncertainError("300", new Error("network response lost"));
    },
  };
  try {
    const options = {
      client,
      ledgerFile: path.join(temp, "ledger.json"),
      key: "story-uncertain",
      imageUrl: "https://media.example/story.jpg",
    };
    await prepareStoryIdempotent(options);
    await reserveStoryPublication({
      ledgerFile: options.ledgerFile,
      key: options.key,
      reservationId: "run-uncertain",
    });
    await assert.rejects(
      () => publishReservedStory({
        client,
        ledgerFile: options.ledgerFile,
        key: options.key,
        reservationId: "run-uncertain",
      }),
      PublishUncertainError,
    );
    await assert.rejects(() => prepareStoryIdempotent(options), PublishUncertainError);
    assert.equal(publishCalls, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Story safely releases a definitively rejected publish for a fresh reservation", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-ig-test-"));
  let publishCalls = 0;
  let rejectPublish = true;
  const client = {
    createStoryContainer: async () => "325",
    getContainerStatus: async () => ({ status_code: "FINISHED" }),
    waitForContainer: async () => ({ status_code: "FINISHED" }),
    publishContainer: async () => {
      publishCalls += 1;
      if (rejectPublish) {
        throw new InstagramApiError("Meta rejected the request", { status: 400, code: 100 });
      }
      return { id: "326", recovered: false };
    },
  };
  try {
    const options = {
      client,
      ledgerFile: path.join(temp, "ledger.json"),
      key: "story-definitive-rejection",
      imageUrl: "https://media.example/story.jpg",
    };
    await prepareStoryIdempotent(options);
    await reserveStoryPublication({
      ledgerFile: options.ledgerFile,
      key: options.key,
      reservationId: "run-rejected",
    });
    await assert.rejects(
      () => publishReservedStory({
        client,
        ledgerFile: options.ledgerFile,
        key: options.key,
        reservationId: "run-rejected",
      }),
      /Meta rejected/,
    );
    const rejectedLedger = JSON.parse(await readFile(options.ledgerFile, "utf8"));
    const rejected = rejectedLedger.publications[options.key];
    assert.equal(rejected.publishAttemptedAt, undefined);
    assert.equal(rejected.publishReservationId, undefined);
    assert.equal(rejected.publicationUncertain, false);
    assert.ok(rejected.publishRejectedAt);

    rejectPublish = false;
    const preparedAgain = await prepareStoryIdempotent(options);
    assert.equal(preparedAgain.needsPublish, true);
    await reserveStoryPublication({
      ledgerFile: options.ledgerFile,
      key: options.key,
      reservationId: "run-retry",
    });
    const result = await publishReservedStory({
      client,
      ledgerFile: options.ledgerFile,
      key: options.key,
      reservationId: "run-retry",
    });
    assert.equal(result.id, "326");
    assert.equal(publishCalls, 2);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Story can publish only from the run that owns the durable reservation", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-ig-test-"));
  let publishCalls = 0;
  const client = {
    createStoryContainer: async () => "350",
    getContainerStatus: async () => ({ status_code: "FINISHED" }),
    waitForContainer: async () => ({ status_code: "FINISHED" }),
    publishContainer: async () => {
      publishCalls += 1;
      return { id: "351", recovered: false };
    },
  };
  try {
    const ledgerFile = path.join(temp, "ledger.json");
    await prepareStoryIdempotent({
      client,
      ledgerFile,
      key: "story-reservation-owner",
      imageUrl: "https://media.example/story.jpg",
    });
    await reserveStoryPublication({
      ledgerFile,
      key: "story-reservation-owner",
      reservationId: "run-owner",
    });
    await assert.rejects(
      () => publishReservedStory({
        client,
        ledgerFile,
        key: "story-reservation-owner",
        reservationId: "run-other",
      }),
      PublishUncertainError,
    );
    assert.equal(publishCalls, 0);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Story with no actual Meta publication ID fails closed for reconciliation", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-ig-test-"));
  let publishCalls = 0;
  const client = {
    createStoryContainer: async () => "360",
    getContainerStatus: async () => ({ status_code: "FINISHED" }),
    waitForContainer: async () => ({ status_code: "FINISHED" }),
    publishContainer: async () => {
      publishCalls += 1;
      return { id: null, recovered: true };
    },
  };
  try {
    const options = {
      client,
      ledgerFile: path.join(temp, "ledger.json"),
      key: "story-needs-reconciliation",
      imageUrl: "https://media.example/story.jpg",
    };
    await prepareStoryIdempotent(options);
    await reserveStoryPublication({
      ledgerFile: options.ledgerFile,
      key: options.key,
      reservationId: "run-reconcile",
    });
    await assert.rejects(
      () => publishReservedStory({
        client,
        ledgerFile: options.ledgerFile,
        key: options.key,
        reservationId: "run-reconcile",
      }),
      PublicationNeedsReconciliationError,
    );
    await assert.rejects(
      () => prepareStoryIdempotent(options),
      PublicationNeedsReconciliationError,
    );
    assert.equal(publishCalls, 1);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Story refuses to start after its hard publication deadline", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-ig-test-"));
  let createCalls = 0;
  const client = {
    createStoryContainer: async () => {
      createCalls += 1;
      return "400";
    },
  };
  try {
    await assert.rejects(
      () => prepareStoryIdempotent({
        client,
        ledgerFile: path.join(temp, "ledger.json"),
        key: "story-expired",
        imageUrl: "https://media.example/story.jpg",
        publishDeadline: new Date(Date.now() - 1),
      }),
      /15-минутное окно/,
    );
    assert.equal(createCalls, 0);
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

test("Client verifies the exact Instagram profile before live publishing", async () => {
  const client = new InstagramClient({
    accessToken: "test-secret-token",
    userId: "777",
    fetchImpl: async () => response({ id: "777", username: "sreda.astana" }),
  });
  assert.deepEqual(
    await client.verifyProfile({ expectedUsername: "@sreda.astana" }),
    { id: "777", username: "sreda.astana" },
  );
  await assert.rejects(
    () => client.verifyProfile({ expectedUsername: "wrong.account" }),
    /ожидался @wrong\.account/,
  );
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
