import assert from "node:assert/strict";
import test from "node:test";
import { InstagramClient } from "../src/instagram-client.mjs";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("Conversations API uses official Instagram host and bearer header", async () => {
  const calls = [];
  const client = new InstagramClient({
    accessToken: "test-secret-token",
    userId: "777",
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(url);
      calls.push({ parsed, options });
      assert.equal(options.headers.Authorization, "Bearer test-secret-token");
      assert.equal(parsed.searchParams.has("access_token"), false);
      if (parsed.pathname.endsWith("/777/conversations")) {
        return response({ data: [{ id: "t_123" }] });
      }
      if (parsed.pathname.endsWith("/t_123")) {
        return response({ messages: { data: [{ id: "mid_1" }] } });
      }
      if (parsed.pathname.endsWith("/mid_1")) {
        return response({ id: "mid_1", message: "Привет", from: { id: "101" }, to: { id: "777" } });
      }
      return response({ error: { message: "unexpected" } }, 400);
    },
  });

  const conversations = await client.listConversations({ limit: 10, after: "cursor-1" });
  assert.equal(conversations.data[0].id, "t_123");
  assert.equal(calls[0].parsed.origin, "https://graph.instagram.com");
  assert.equal(calls[0].parsed.searchParams.get("platform"), "instagram");
  assert.equal(calls[0].parsed.searchParams.get("after"), "cursor-1");

  const messages = await client.listConversationMessages("t_123", { limit: 20 });
  assert.equal(messages.data[0].id, "mid_1");
  assert.match(calls[1].parsed.searchParams.get("fields"), /^messages\.limit\(20\)/);

  const detail = await client.getMessageDetails("mid_1");
  assert.equal(detail.message, "Привет");
  assert.match(calls[2].parsed.searchParams.get("fields"), /attachments/);
});

test("message details fall back to official core fields when attachments are unavailable", async () => {
  const fields = [];
  const client = new InstagramClient({
    accessToken: "test-secret-token",
    userId: "777",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      fields.push(parsed.searchParams.get("fields"));
      if (fields.length === 1) {
        return response({ error: { message: "Unknown field attachments", code: 100 } }, 400);
      }
      return response({ id: "mid_2", message: "Вопрос?", from: { id: "102" }, to: { id: "777" } });
    },
  });
  const detail = await client.getMessageDetails("mid_2");
  assert.equal(detail.id, "mid_2");
  assert.equal(fields.length, 2);
  assert.equal(fields[1], "id,created_time,from,to,message");
});

test("conversation and message IDs reject path injection", async () => {
  const client = new InstagramClient({
    accessToken: "test-secret-token",
    userId: "777",
    fetchImpl: async () => response({}),
  });
  await assert.rejects(() => client.listConversationMessages("../../me"), /недопустимые символы/);
  await assert.rejects(() => client.getMessageDetails("mid?access_token=leak"), /недопустимые символы/);
});
