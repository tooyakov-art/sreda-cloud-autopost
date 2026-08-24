import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pollInstagramDirect } from "../src/direct-poller.mjs";
import {
  classifyDirectMessage,
  renderExactTemplate,
  routeDirectMessage,
  validateDirectConfig,
} from "../src/direct-router.mjs";

const config = {
  templates: {
    spss: "Здравствуйте! Благодарим за визит и отметку. До новых встреч!🤍",
    visual: "Здравствуйте! Очень красиво получилось, спасибо за отметку 🤍",
    nomer: "Здравствуйте! Просим написать/позвонить по номеру +7 706 600 8382 🤍",
    work: "Здравствуйте! Работаем каждый день с 08:00 до 23:00. Будем рады видеть вас! 🤍",
    address: "Здравствуйте! 📍Мы находимся по адресу ул. Бухар Жырау 26/1. Будем рады Вас видеть!🤍",
  },
  routes: {
    question: "nomer",
    story_mention_beautiful: "visual",
    story_mention_ordinary: "spss",
  },
};

test("question routing wins over a Story mention", () => {
  const message = {
    id: "m1",
    message: "А до скольки вы работаете?",
    attachments: [{ type: "story_mention" }],
  };
  assert.equal(classifyDirectMessage(message), "question");
});

test("common Russian and Kazakh intents are questions without a question mark", () => {
  const samples = [
    "Хочу забронировать столик",
    "Подскажите адрес",
    "Можно меню",
    "Интересует стоимость завтрака",
    "Ваш график работы",
    "Есть вакансия бариста",
    "Нужна доставка",
    "Предлагаем сотрудничество",
    "Оставьте номер телефона",
    "Үстелді брондау керек",
    "Мекенжай жіберіңіз",
    "Мәзір керек",
    "Бағасы қанша",
    "Жұмыс уақыты",
    "Бос орын бар ма",
    "Жеткізу керек",
    "Ынтымақтастық ұсынамыз",
    "Байланыс нөмірі",
  ];
  for (const message of samples) assert.equal(classifyDirectMessage({ message }), "question", message);
});

test("ambiguous punctuation is manual review, not an automatic question reply", () => {
  assert.equal(classifyDirectMessage({ message: "Спасибо за работу" }), "unhandled");
  assert.equal(classifyDirectMessage({ message: "Спасибо за работу?" }), "manual_review");
  assert.equal(classifyDirectMessage({ message: "Как дела" }), "manual_review");
  assert.equal(classifyDirectMessage({ message: "Привет?" }), "manual_review");
});

test("non-question non-Story messages abstain", () => {
  const routed = routeDirectMessage({
    conversationId: "c1",
    config,
    message: { id: "m-unhandled", message: "Привет", from: { id: "125" } },
  });
  assert.deepEqual(
    { route: routed.route, templateKey: routed.templateKey, reply: routed.reply },
    { route: "unhandled", templateKey: null, reply: null },
  );
});

test("Story mention is ordinary without verified vision", () => {
  const message = {
    id: "m2",
    message: "",
    attachments: [{ type: "story_mention", beautiful: true }],
  };
  assert.equal(classifyDirectMessage(message), "story_mention_ordinary");
  assert.equal(
    classifyDirectMessage(message, { vision: { verified: false, verdict: "beautiful" } }),
    "story_mention_ordinary",
  );
  assert.equal(
    classifyDirectMessage(message, { vision: { verified: true, verdict: "beautiful" } }),
    "story_mention_beautiful",
  );
});

test("exact templates only substitute documented placeholders", () => {
  assert.equal(
    renderExactTemplate("Привет, {{first_name}} — {{message_text}}", {
      first_name: "Айша",
      message_text: "Можно столик?",
    }),
    "Привет, Айша — Можно столик?",
  );
  assert.throws(() => renderExactTemplate("{{unknown}}", {}), /Неизвестный placeholder/);
});

test("ordinary Story template cannot claim beauty without vision", () => {
  assert.throws(() => validateDirectConfig({
    templates: {
      spss: "Очень красиво получилось",
      visual: "Красиво",
      nomer: "Позвоните",
    },
    routes: {
      question: "nomer",
      story_mention_beautiful: "visual",
      story_mention_ordinary: "spss",
    },
  }), /без vision-проверки/);
});

test("route renders configured text exactly", () => {
  const routed = routeDirectMessage({
    conversationId: "c1",
    config,
    message: {
      id: "m3",
      message: "Можно забронировать?",
      from: { id: "123", username: "aisha", name: "Айша Н" },
    },
  });
  assert.deepEqual(
    { route: routed.route, templateKey: routed.templateKey, reply: routed.reply },
    {
      route: "question",
      templateKey: "nomer",
      reply: "Здравствуйте! Просим написать/позвонить по номеру +7 706 600 8382 🤍",
    },
  );
});

test("visual saved reply is reachable only with verified vision", () => {
  const message = {
    id: "m-visual",
    message: "",
    from: { id: "124", username: "guest" },
    attachments: [{ type: "story_mention" }],
  };
  const ordinary = routeDirectMessage({ message, conversationId: "c1", config });
  assert.equal(ordinary.templateKey, "spss");
  const visual = routeDirectMessage({
    message,
    conversationId: "c1",
    config,
    vision: { verified: true, verdict: "beautiful" },
  });
  assert.equal(visual.templateKey, "visual");
  assert.equal(visual.reply, "Здравствуйте! Очень красиво получилось, спасибо за отметку 🤍");
});

const NOW = new Date("2026-08-23T12:00:00.000Z");

function directMessage(id, createdTime, fromId, message = "", extra = {}) {
  return {
    id,
    created_time: createdTime,
    message,
    from: fromId ? { id: fromId, username: `user_${fromId}` } : undefined,
    ...extra,
  };
}

function mutableDirectClient(messages) {
  return {
    userId: "777",
    async listConversations() {
      return { data: [{ id: "c1" }] };
    },
    async listConversationMessages() {
      return {
        data: messages.slice(-20).map(({ id, created_time, is_unsupported }) => ({ id, created_time, is_unsupported })),
      };
    },
    async getMessageDetails(id) {
      return messages.find((message) => message.id === id);
    },
  };
}

async function dryPoll(client, previewLedgerFile, extra = {}) {
  return pollInstagramDirect({
    client,
    config,
    previewLedgerFile,
    mode: "dry-run",
    now: NOW,
    ...extra,
  });
}

test("first poll bootstraps a cutover and produces zero proposals", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-direct-bootstrap-"));
  try {
    const previewLedgerFile = path.join(temp, "direct-preview-ledger.json");
    const liveLedgerFile = path.join(temp, "direct-live-ledger.json");
    await writeFile(liveLedgerFile, "LIVE-SENTINEL", "utf8");
    const messages = [directMessage("old-1", "2026-08-23T10:00:00.000Z", "101", "Адрес")];
    const client = mutableDirectClient(messages);

    const first = await dryPoll(client, previewLedgerFile);
    assert.equal(first.bootstrapCount, 1);
    assert.equal(first.proposals.length, 0);
    assert.equal(first.abstained[0].reason, "bootstrap_cutover");

    const second = await dryPoll(client, previewLedgerFile);
    assert.equal(second.proposals.length, 0);
    assert.equal(second.abstained[0].reason, "no_new_inbound");
    assert.equal(await readFile(liveLedgerFile, "utf8"), "LIVE-SENTINEL");
    assert.match(await readFile(previewLedgerFile, "utf8"), /conversation:c1:cutover/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("only the inbound suffix is grouped into one proposal per business boundary", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-direct-burst-"));
  try {
    const previewLedgerFile = path.join(temp, "preview.json");
    const messages = [
      directMessage("echo-0", "2026-08-23T10:00:00.000Z", "101", "Исходящий ответ", { is_echo: true }),
    ];
    const client = mutableDirectClient(messages);
    await dryPoll(client, previewLedgerFile);

    messages.push(
      directMessage("in-1", "2026-08-23T10:10:00.000Z", "101", "Хочу забронировать столик"),
      directMessage("in-2", "2026-08-23T10:11:00.000Z", "101", "На завтра"),
    );
    const grouped = await dryPoll(client, previewLedgerFile);
    assert.equal(grouped.proposals.length, 1);
    assert.deepEqual(grouped.proposals[0].messageIds, ["in-1", "in-2"]);
    assert.equal(grouped.proposals[0].route, "question");

    messages.push(directMessage("in-3", "2026-08-23T10:12:00.000Z", "101", "И на двоих"));
    const sameBurst = await dryPoll(client, previewLedgerFile);
    assert.equal(sameBurst.proposals.length, 0);
    assert.equal(sameBurst.abstained[0].reason, "burst_already_planned");

    messages.push(
      directMessage("business-1", "2026-08-23T10:20:00.000Z", "777", "Ответили"),
      directMessage("story-1", "2026-08-23T10:21:00.000Z", "102", "", {
        attachments: [{ type: "story_mention", beautiful: true }],
      }),
    );
    const nextBurst = await dryPoll(client, previewLedgerFile);
    assert.equal(nextBurst.proposals.length, 1);
    assert.equal(nextBurst.proposals[0].route, "story_mention_ordinary");
    assert.equal(nextBurst.proposals[0].templateKey, "spss");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("latest business-authored message blocks a proposal", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-direct-latest-"));
  try {
    const previewLedgerFile = path.join(temp, "preview.json");
    const messages = [directMessage("business-0", "2026-08-23T10:00:00.000Z", "777", "Ответ")];
    const client = mutableDirectClient(messages);
    await dryPoll(client, previewLedgerFile);
    messages.push(
      directMessage("in-1", "2026-08-23T10:10:00.000Z", "101", "Адрес"),
      directMessage("business-1", "2026-08-23T10:11:00.000Z", "777", "Уже ответили"),
    );
    const result = await dryPoll(client, previewLedgerFile);
    assert.equal(result.proposals.length, 0);
    assert.equal(result.abstained[0].reason, "latest_not_inbound");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("messages outside the 24 hour window abstain", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-direct-age-"));
  try {
    const previewLedgerFile = path.join(temp, "preview.json");
    const messages = [directMessage("business-0", "2026-08-20T10:00:00.000Z", "777", "Ответ")];
    const client = mutableDirectClient(messages);
    await dryPoll(client, previewLedgerFile);
    messages.push(directMessage("old-inbound", "2026-08-21T10:00:00.000Z", "101", "Адрес"));
    const result = await dryPoll(client, previewLedgerFile);
    assert.equal(result.proposals.length, 0);
    assert.equal(result.abstained[0].reason, "outside_24h");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("saturated history without a business boundary or cutover evidence abstains", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-direct-history-"));
  try {
    const previewLedgerFile = path.join(temp, "preview.json");
    const messages = Array.from({ length: 20 }, (_, index) => directMessage(
      `in-${index}`,
      `2026-08-23T10:${String(index).padStart(2, "0")}:00.000Z`,
      "101",
      "Адрес",
    ));
    const result = await dryPoll(mutableDirectClient(messages), previewLedgerFile);
    assert.equal(result.proposals.length, 0);
    assert.equal(result.abstained[0].reason, "insufficient_history");
    assert.equal(result.abstained[0].bootstrap, true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("unhandled and manual-review bursts remain visible on later polls", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-direct-review-"));
  try {
    const previewLedgerFile = path.join(temp, "preview.json");
    const messages = [directMessage("business-0", "2026-08-23T10:00:00.000Z", "777", "Ответ")];
    const client = mutableDirectClient(messages);
    await dryPoll(client, previewLedgerFile);

    messages.push(directMessage("plain-1", "2026-08-23T10:10:00.000Z", "101", "Привет"));
    assert.equal((await dryPoll(client, previewLedgerFile)).unhandled.length, 1);
    assert.equal((await dryPoll(client, previewLedgerFile)).unhandled.length, 1);

    messages.push(directMessage("ambiguous-1", "2026-08-23T10:11:00.000Z", "101", "Спасибо за работу?"));
    assert.equal((await dryPoll(client, previewLedgerFile)).manualReview[0].reason, "ambiguous_question");
    assert.equal((await dryPoll(client, previewLedgerFile)).manualReview[0].reason, "ambiguous_question");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("poller rejects live mode before reading conversations", async () => {
  let calls = 0;
  await assert.rejects(() => pollInstagramDirect({
    client: {
      userId: "777",
      async listConversations() {
        calls += 1;
        return { data: [] };
      },
    },
    config,
    previewLedgerFile: "unused-preview.json",
    mode: "live",
  }), /Live-отправка Direct отключена/);
  assert.equal(calls, 0);
});
