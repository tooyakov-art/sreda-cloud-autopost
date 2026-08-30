import assert from "node:assert/strict";
import test from "node:test";
import {
  getSeptemberThreadsPostByDate,
  getThreadsPostById,
  SEPTEMBER_THREADS_POSTS,
  THREADS_LAUNCH_POST,
  validateThreadsSeptemberCalendar,
} from "../src/threads-september-calendar.mjs";

test("September Threads calendar contains exactly 30 safe approved-style posts", () => {
  const validation = validateThreadsSeptemberCalendar();
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.ok, true);
  assert.equal(SEPTEMBER_THREADS_POSTS.length, 30);
  assert.deepEqual(validation.counts.languages, { KZ: 15, RU: 15 });
  assert.deepEqual(validation.counts.formats, { PHOTO: 12, DESIGN: 8, TEXT: 10 });
  assert.equal(getSeptemberThreadsPostByDate("2026-09-01").id, "TH-SEP-01");
  assert.equal(getSeptemberThreadsPostByDate("2026-09-30").id, "TH-SEP-30");
  assert.equal(getSeptemberThreadsPostByDate("2026-10-01"), null);
});

test("Threads content follows Yasmin requirements", () => {
  for (const post of [THREADS_LAUNCH_POST, ...SEPTEMBER_THREADS_POSTS]) {
    assert.ok(post.text.includes("+7 706 600 83 82"), post.id);
    assert.ok(post.text.includes("26/1"), post.id);
    assert.equal(post.text.includes("#"), false, `${post.id}: hashtags`);
    assert.equal(post.text.includes("?"), false, `${post.id}: empty question`);
    assert.equal(/batch\s*brew|батч\s*брю/i.test(post.text), false, `${post.id}: batch brew`);
    assert.ok(post.text.length <= 500, `${post.id}: too long`);
  }
  assert.equal(getThreadsPostById("TH-LAUNCH-01"), THREADS_LAUNCH_POST);
  assert.match(THREADS_LAUNCH_POST.text, /Иногда для хорошего дня достаточно бельгийских вафель/);
});
