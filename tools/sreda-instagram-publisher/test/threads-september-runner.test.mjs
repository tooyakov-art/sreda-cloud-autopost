import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolvePostAssetFiles } from "../src/threads-september-runner.mjs";

test("Threads runner resolves carousel assets in slide order and keeps single-asset compatibility", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-threads-runner-"));
  const design = path.join(temp, "design");
  await mkdir(design, { recursive: true });
  const refs = ["design/first.png", "design/second.png", "design/third.png"];
  for (const ref of refs) await writeFile(path.join(temp, ref), ref);
  try {
    const carousel = await resolvePostAssetFiles({ id: "TH-CAROUSEL", assets: refs }, temp);
    assert.deepEqual(carousel, refs.map((ref) => path.resolve(temp, ref)));
    const single = await resolvePostAssetFiles({ id: "TH-SINGLE", asset: refs[0] }, temp);
    assert.deepEqual(single, [path.resolve(temp, refs[0])]);
    assert.deepEqual(await resolvePostAssetFiles({ id: "TH-TEXT" }, temp), []);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Threads runner rejects ambiguous, invalid and escaping carousel assets", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sreda-threads-runner-invalid-"));
  try {
    await assert.rejects(
      () => resolvePostAssetFiles({ id: "TH-BOTH", asset: "one.png", assets: ["one.png", "two.png"] }, temp),
      /asset либо assets/,
    );
    await assert.rejects(
      () => resolvePostAssetFiles({ id: "TH-ONE", assets: ["one.png"] }, temp),
      /от 2 до 20/,
    );
    await assert.rejects(
      () => resolvePostAssetFiles({ id: "TH-ESCAPE", asset: "../outside.png" }, temp),
      /вышел за SREDA_THREADS_ROOT/,
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
