import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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

const APPROVED_STORY_HASHES = new Map([
  ["2026-09-01-v2/01-information-guest.png", "997b387c3df3d9a951f3d1ffbd4ce4a31558021dd3f882dac3bdac0a553bc80b"],
  ["2026-09-01-v2/02-air-balloons.png", "76d6e04e93730592a32d25bd9fd41b286114f310ec13908880f6d0a7f26ec7fb"],
  ["2026-09-01-v2/03-live-editorial.png", "dfc7d5fbb38670872a125321ae14de1f9dde493278084e8bb7e0ca07516be07c"],
  ["2026-09-01-v2/04-air-ivory.png", "9d0baca16a64eab419d951ec127f9090109ec3b4b19b6f9658b78190da632402"],
  ["2026-09-01-v2/05-information-omelette.png", "b29199b3177e26bd77a82841fec1924cf5cf6d52263479448fa54ec0932639c0"],
]);

test("All five approved 1 September V2 Story slots resolve to 1080x1920 assets", {
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
    const hash = createHash("sha256").update(await readFile(file)).digest("hex");
    assert.equal(hash, APPROVED_STORY_HASHES.get(action.asset), file);
    seen.push(file);
  }
  assert.equal(seen.length, 5);
  assert.equal(new Set(seen).size, 5);
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
