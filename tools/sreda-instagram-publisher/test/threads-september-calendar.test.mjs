import assert from "node:assert/strict";
import test from "node:test";
import {
  getSeptemberThreadsPostByDate,
  getThreadsPostById,
  SEPTEMBER_THREADS_POSTS,
  THREADS_LAUNCH_POST,
  THREADS_TRIAL_POST,
  validateThreadsSeptemberCalendar,
} from "../src/threads-september-calendar.mjs";

test("September Threads calendar contains exactly 30 safe approved-style posts", () => {
  const validation = validateThreadsSeptemberCalendar();
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
  assert.equal(SEPTEMBER_THREADS_POSTS.length, 30);
  assert.deepEqual(validation.counts.languages, { KZ: 15, RU: 15 });
  assert.deepEqual(validation.counts.formats, {
    CAROUSEL: 10,
    LIVE: 7,
    AIR: 6,
    FOOD: 6,
    DESIGN: 1,
  });
  assert.equal(getSeptemberThreadsPostByDate("2026-09-01").id, "TH-SEP-01");
  assert.equal(getSeptemberThreadsPostByDate("2026-09-30").id, "TH-SEP-30");
  assert.equal(getSeptemberThreadsPostByDate("2026-10-01"), null);
});

test("Threads content follows Yasmin requirements", () => {
  for (const post of [THREADS_LAUNCH_POST, THREADS_TRIAL_POST, ...SEPTEMBER_THREADS_POSTS]) {
    assert.ok(post.text.includes("+7 706 600 83 82"), post.id);
    assert.ok(post.text.includes("26/1"), post.id);
    assert.equal(post.text.includes("#"), false, `${post.id}: hashtags`);
    assert.equal(post.text.includes("?"), false, `${post.id}: empty question`);
    assert.equal(/batch\s*brew|батч\s*брю/i.test(post.text), false, `${post.id}: batch brew`);
    assert.ok(post.text.length <= 500, `${post.id}: too long`);
  }
  assert.equal(getThreadsPostById("TH-LAUNCH-01"), THREADS_LAUNCH_POST);
  assert.equal(getThreadsPostById("TH-TRIAL-01"), THREADS_TRIAL_POST);
  assert.equal(THREADS_TRIAL_POST.assets.length, 3);
  assert.equal(THREADS_TRIAL_POST.format, "CAROUSEL");
  assert.match(THREADS_LAUNCH_POST.text, /Иногда для хорошего дня достаточно бельгийских вафель/);
});

test("September Threads use varied photographer media without repeated files", () => {
  const refs = SEPTEMBER_THREADS_POSTS.flatMap((post) => post.assets ?? [post.asset]);
  assert.equal(refs.length, 52);
  assert.equal(new Set(refs).size, refs.length);
  assert.equal(SEPTEMBER_THREADS_POSTS.some((post) => post.format === "TEXT"), false);
  assert.equal(SEPTEMBER_THREADS_POSTS.filter((post) => post.format === "CAROUSEL").length, 10);
  assert.ok(refs.filter((ref) => ref.startsWith("photographer/")).length >= 38);
});
