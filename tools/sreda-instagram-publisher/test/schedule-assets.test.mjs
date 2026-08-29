import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  CAROUSEL_SLOTS,
  STORY_SLOTS,
  carouselFilesForAction,
  parseAt,
  resolveScheduledAction,
  storyFileForAction,
} from "../src/schedule.mjs";

const MODULE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.resolve(MODULE_ROOT, "..", "..");
const CURRENT_ROOT = process.env.SREDA_CURRENT_ROOT
  ? path.resolve(process.env.SREDA_CURRENT_ROOT)
  : path.join(WORKSPACE, "current", "2026-08-22-31");
const STORIES_ROOT = process.env.SREDA_STORIES_ROOT
  ? path.resolve(process.env.SREDA_STORIES_ROOT)
  : path.join(CURRENT_ROOT, "stories");
const CAROUSELS_ROOT = path.join(CURRENT_ROOT, "carousels");
const STORIES_AVAILABLE = existsSync(STORIES_ROOT);
const CAROUSELS_AVAILABLE = existsSync(CAROUSELS_ROOT);

test("All 165 Story slots resolve to curated 1080x1920 assets", {
  skip: !STORIES_AVAILABLE && "Encrypted assets are not decrypted in the public checkout",
}, async () => {
  const seen = [];
  for (const slot of STORY_SLOTS.keys()) {
    const action = resolveScheduledAction(parseAt(slot.replace(" ", "T")));
    assert.equal(action.kind, "story");
    const file = await storyFileForAction(action, STORIES_ROOT);
    assert.doesNotMatch(file, /DRAFT/i);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, 1080, file);
    assert.equal(metadata.height, 1920, file);
    seen.push(file);
  }
  assert.equal(seen.length, 165);
  assert.ok(new Set(seen).size >= 40);
});

test("All four carousel slots have 01–04 assets and embedded captions", {
  skip: !CAROUSELS_AVAILABLE && "Encrypted assets are not decrypted in the public checkout",
}, async () => {
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
