import assert from "node:assert/strict";
import test from "node:test";
import {
  CAROUSEL_SLOTS,
  STORY_TIMES,
  THREADS_SLOTS,
  extractCarouselCaption,
  localSlot,
  parseAt,
  resolveScheduledAction,
} from "../src/schedule.mjs";

test("Qyzylorda exact Story slots map to correct daily index", () => {
  const morning = resolveScheduledAction(parseAt("2026-08-23T08:00"));
  const evening = resolveScheduledAction(parseAt("2026-08-31T21:00"));
  assert.equal(morning.kind, "story");
  assert.equal(morning.storyIndex, 0);
  assert.equal(evening.kind, "story");
  assert.equal(evening.storyIndex, 4);
  assert.equal(localSlot(parseAt("2026-08-23T03:00:00Z")).key, "2026-08-23 08:00");
});

test("Carousel wins only at its exact minute", () => {
  const exact = resolveScheduledAction(parseAt("2026-08-24T11:00"));
  assert.equal(exact.kind, "carousel");
  assert.equal(exact.slug, "breakfast");
  assert.equal(resolveScheduledAction(parseAt("2026-08-24T11:01")), null);
  assert.equal(resolveScheduledAction(parseAt("2026-09-01T08:00")), null);
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
  assert.deepEqual(ids.sort(), Array.from({ length: 26 }, (_, index) => `TH-${String(index + 5).padStart(2, "0")}`));
  assert.deepEqual(languages, { RU: 13, KZ: 13 });

  assert.equal(THREADS_SLOTS.get("2026-08-28 15:30").id, "TH-05");
  assert.equal(THREADS_SLOTS.get("2026-08-29 15:30").id, "TH-06");
  assert.equal(THREADS_SLOTS.get("2026-08-30 15:30").id, "TH-07");
});

test("Threads slots do not collide with Stories or carousels", () => {
  const instagramSlots = new Set(CAROUSEL_SLOTS.keys());
  for (let day = 23; day <= 31; day += 1) {
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    for (const time of STORY_TIMES) instagramSlots.add(`${date} ${time}`);
  }
  for (const slot of THREADS_SLOTS.keys()) assert.equal(instagramSlots.has(slot), false, slot);
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
  assert.equal(extractCarouselCaption(prompt, "24.08.2026 11:00"), "CAPTION ONE");
  assert.equal(extractCarouselCaption(prompt, "31.08.2026 18:00"), "CAPTION FOUR");
});
