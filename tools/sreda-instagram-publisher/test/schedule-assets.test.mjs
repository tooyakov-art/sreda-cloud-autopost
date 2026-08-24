import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAROUSEL_SLOTS,
  STORY_TIMES,
  carouselFilesForAction,
  parseAt,
  resolveScheduledAction,
  storyFileForAction,
} from "../src/schedule.mjs";

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.resolve(MODULE_ROOT, "..", "..");
const CURRENT_ROOT = path.join(WORKSPACE, "current", "2026-08-22-31");
const STORIES_ROOT = path.join(CURRENT_ROOT, "stories");
const CAROUSELS_ROOT = path.join(CURRENT_ROOT, "carousels");

test("All 45 Story slots resolve to one of exactly five ordered assets", async () => {
  const seen = [];
  for (let day = 23; day <= 31; day += 1) {
    for (let index = 0; index < STORY_TIMES.length; index += 1) {
      const date = `2026-08-${String(day).padStart(2, "0")}T${STORY_TIMES[index]}`;
      const action = resolveScheduledAction(parseAt(date));
      assert.equal(action.kind, "story");
      const file = await storyFileForAction(action, STORIES_ROOT);
      assert.match(path.basename(file), new RegExp(`^0${index + 1}-`));
      seen.push(file);
    }
  }
  assert.equal(seen.length, 45);
  assert.equal(new Set(seen).size, 45);
});

test("All four carousel slots have 01–04 assets and embedded captions", async () => {
  for (const [slot, config] of CAROUSEL_SLOTS) {
    const action = resolveScheduledAction(parseAt(slot.replace(" ", "T")));
    assert.equal(action.kind, "carousel");
    const files = await carouselFilesForAction(action, CAROUSELS_ROOT);
    assert.deepEqual(files.map((file) => path.basename(file)), ["01.png", "02.png", "03.png", "04.png"]);
    const caption = config.caption;
    assert.ok(caption.length > 100);
    assert.match(caption, /\+7 706 600 83 82/);
  }
});
