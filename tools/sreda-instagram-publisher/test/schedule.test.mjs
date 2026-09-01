import assert from "node:assert/strict";
import test from "node:test";
import {
  CAROUSEL_SLOTS,
  STORY_RELEASE_STATUS,
  STORY_SLOTS,
  STORY_TIMES,
  THREADS_SLOTS,
  extractCarouselCaption,
  localSlot,
  parseAt,
  resolveScheduledAction,
  storyAutopublishApproved,
  threadsAutopublishEnabled,
} from "../src/schedule.mjs";

test("Exact 1 September V2 Story release is approved", () => {
  assert.equal(STORY_RELEASE_STATUS, "APPROVED");
  assert.equal(storyAutopublishApproved(), true);
});

test("Threads autopublishing is disabled unless explicitly enabled", () => {
  assert.equal(threadsAutopublishEnabled({}), false);
  assert.equal(
    threadsAutopublishEnabled({ SREDA_THREADS_AUTOPUBLISH_ENABLED: "false" }),
    false,
  );
  assert.equal(
    threadsAutopublishEnabled({ SREDA_THREADS_AUTOPUBLISH_ENABLED: "true" }),
    true,
  );
});

test("Qyzylorda exact Story slots contain only the ordered 1 September V2 set", () => {
  const first = resolveScheduledAction(parseAt("2026-09-01T15:20"));
  const last = resolveScheduledAction(parseAt("2026-09-01T16:40"));
  assert.equal(first.kind, "story");
  assert.equal(first.storyIndex, 0);
  assert.equal(first.asset, "2026-09-01-v2/01-information-guest.png");
  assert.equal(last.kind, "story");
  assert.equal(last.storyIndex, 4);
  assert.equal(last.asset, "2026-09-01-v2/05-information-omelette.png");
  assert.deepEqual(STORY_TIMES, ["15:20", "15:40", "16:00", "16:20", "16:40"]);
  assert.equal(STORY_SLOTS.size, 5);
  assert.equal(
    localSlot(parseAt("2026-09-01T10:20:00Z")).key,
    "2026-09-01 15:20",
  );
  assert.equal(resolveScheduledAction(parseAt("2026-09-01T14:30")), null);
  assert.equal(resolveScheduledAction(parseAt("2026-09-02T15:00")), null);
});

test("Carousel wins only at its exact minute", () => {
  const exact = resolveScheduledAction(parseAt("2026-08-24T11:00"));
  assert.equal(exact.kind, "carousel");
  assert.equal(exact.slug, "breakfast");
  assert.equal(resolveScheduledAction(parseAt("2026-08-24T11:01")), null);
  assert.equal(resolveScheduledAction(parseAt("2026-10-01T08:00")), null);
});

test("All 26 approved Threads texts have exact unique slots and 13 RU + 13 KZ", () => {
  assert.equal(THREADS_SLOTS.size, 26);
  const ids = [];
  const languages = { RU: 0, KZ: 0 };
  for (const [slot, config] of THREADS_SLOTS) {
    const exact = resolveScheduledAction(parseAt(slot.replace(" ", "T")));
    assert.equal(exact.kind, "threads-text");
    assert.equal(exact.id, config.id);
    assert.equal(exact.text, config.text);
    assert.ok(exact.text.length > 50);
    ids.push(exact.id);
    languages[exact.language] += 1;
  }
  assert.deepEqual(
    ids.sort(),
    Array.from(
      { length: 26 },
      (_, index) => `TH-${String(index + 5).padStart(2, "0")}`,
    ),
  );
  assert.deepEqual(languages, { RU: 13, KZ: 13 });

  assert.equal(THREADS_SLOTS.get("2026-08-28 15:30").id, "TH-05");
  assert.equal(THREADS_SLOTS.get("2026-08-29 15:30").id, "TH-06");
  assert.equal(THREADS_SLOTS.get("2026-08-30 15:30").id, "TH-07");
});

test("Threads slots do not collide with Stories or carousels", () => {
  const instagramSlots = new Set([
    ...CAROUSEL_SLOTS.keys(),
    ...STORY_SLOTS.keys(),
  ]);
  for (const slot of THREADS_SLOTS.keys())
    assert.equal(instagramSlots.has(slot), false, slot);
});

test("Caption is extracted only from its automation section", () => {
  const prompt = [
    "24.08.2026 11:00 — folder и опубликуй с подписью:",
    "CAPTION ONE",
    "",
    "26.08.2026 18:00 — folder и опубликуй с подписью:",
    "CAPTION TWO",
    "",
    "28.08.2026 18:00 — folder и опубликуй с подписью:",
    "CAPTION THREE",
    "",
    "31.08.2026 18:00 — folder и опубликуй с подписью:",
    "CAPTION FOUR",
    "",
    "3) THREADS. something",
  ].join("\n");
  assert.equal(
    extractCarouselCaption(prompt, "24.08.2026 11:00"),
    "CAPTION ONE",
  );
  assert.equal(
    extractCarouselCaption(prompt, "31.08.2026 18:00"),
    "CAPTION FOUR",
  );
});
