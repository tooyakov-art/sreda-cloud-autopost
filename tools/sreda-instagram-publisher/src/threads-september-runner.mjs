#!/usr/bin/env node
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stageMediaFile } from "./media-stage.mjs";
import { publicUrlForRoute, startStage, stopStage } from "./stage-controller.mjs";
import {
  getSeptemberThreadsPostByDate,
  getThreadsPostById,
  THREADS_LOCAL_TIME,
  THREADS_TIME_ZONE,
  validateThreadsSeptemberCalendar,
} from "./threads-september-calendar.mjs";
import { threadsClientFromEnv } from "./threads-secrets.mjs";
import { publishThreadsPostIdempotent } from "./threads-media-publisher.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = path.join(ROOT, ".runtime-threads");
const LEDGER = path.join(RUNTIME, "publication-ledger.json");

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) throw new Error(`Неожиданный аргумент: ${value}`);
    const key = value.slice(2);
    if (key === "dry-run") {
      options[key] = true;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Нет значения для --${key}`);
    options[key] = next;
    index += 1;
  }
  return options;
}

function localDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: THREADS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const validation = validateThreadsSeptemberCalendar();
  if (!validation.ok) throw new Error(`Некорректный календарь: ${validation.errors.join("; ")}`);

  const post = options["post-id"]
    ? getThreadsPostById(options["post-id"])
    : getSeptemberThreadsPostByDate(localDate());
  if (!post) {
    print({ ok: true, skipped: true, reason: options["post-id"] ? "unknown-post-id" : "no-post-for-local-date" });
    return;
  }
  if (options["scheduled-local-time"] && options["scheduled-local-time"] !== post.time) {
    throw new Error(`${post.id}: ожидалось время ${post.time}, получено ${options["scheduled-local-time"]}`);
  }

  const threadsRoot = path.resolve(process.env.SREDA_THREADS_ROOT || "");
  let assetFile = null;
  if (post.asset) {
    if (!process.env.SREDA_THREADS_ROOT) throw new Error("Для медиапоста задайте SREDA_THREADS_ROOT");
    assetFile = path.resolve(threadsRoot, post.asset);
    if (!assetFile.startsWith(`${threadsRoot}${path.sep}`)) throw new Error(`${post.id}: asset вышел за SREDA_THREADS_ROOT`);
    await access(assetFile);
  }

  const key = `sreda-${post.id.toLowerCase()}`;
  if (options["dry-run"]) {
    print({
      ok: true,
      dryRun: true,
      action: "publish-threads",
      postId: post.id,
      date: post.date,
      time: post.time,
      language: post.language,
      format: post.format,
      textCharacters: post.text.length,
      assetFile,
      idempotencyKey: key,
    });
    return;
  }
  if (process.env.SREDA_THREADS_AUTOPUBLISH_ENABLED !== "true") {
    throw new Error("Threads live-публикация требует SREDA_THREADS_AUTOPUBLISH_ENABLED=true");
  }

  await mkdir(RUNTIME, { recursive: true });
  let stageStarted = false;
  try {
    let imageUrl = null;
    let inputIdentity = null;
    if (assetFile) {
      const cloudflaredPath = process.env.SREDA_CLOUDFLARED;
      if (!cloudflaredPath) throw new Error("Для медиапоста задайте SREDA_CLOUDFLARED");
      const staged = await stageMediaFile(assetFile, RUNTIME);
      await startStage({ runtimeDir: RUNTIME, cloudflaredPath });
      stageStarted = true;
      imageUrl = await publicUrlForRoute(RUNTIME, staged.route);
      inputIdentity = staged.sourceHash;
    }

    const client = await threadsClientFromEnv();
    const profile = await client.verifyProfile({
      expectedUsername: process.env.SREDA_THREADS_USERNAME || "sreda.astana",
    });
    const result = await publishThreadsPostIdempotent({
      client,
      ledgerFile: LEDGER,
      key,
      text: post.text,
      imageUrl,
      inputIdentity,
    });
    print({
      ok: true,
      action: "publish-threads",
      postId: post.id,
      profile: profile.username,
      language: post.language,
      format: post.format,
      ...result,
    });
  } finally {
    if (stageStarted) await stopStage(RUNTIME).catch(() => {});
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, name: error.name })}\n`);
  process.exitCode = 1;
});
