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

const ENTRY_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(ENTRY_FILE), "..");
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

function assetRefsForPost(post) {
  const hasSingle = post.asset !== null && post.asset !== undefined;
  const hasCarousel = post.assets !== null && post.assets !== undefined;
  if (hasSingle && hasCarousel) {
    throw new Error(`${post.id}: задайте asset либо assets, но не оба поля`);
  }
  if (hasCarousel) {
    if (!Array.isArray(post.assets) || post.assets.length < 2 || post.assets.length > 20) {
      throw new Error(`${post.id}: assets должен содержать от 2 до 20 изображений`);
    }
    return post.assets;
  }
  return hasSingle ? [post.asset] : [];
}

export async function resolvePostAssetFiles(post, threadsRootValue = process.env.SREDA_THREADS_ROOT) {
  const refs = assetRefsForPost(post);
  if (refs.length === 0) return [];
  if (!threadsRootValue) throw new Error("Для медиапоста задайте SREDA_THREADS_ROOT");
  const threadsRoot = path.resolve(threadsRootValue);
  const files = [];
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    if (typeof ref !== "string" || !ref.trim()) {
      throw new Error(`${post.id}: asset ${index + 1} не должен быть пустым`);
    }
    const file = path.resolve(threadsRoot, ref);
    const relative = path.relative(threadsRoot, file);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`${post.id}: asset вышел за SREDA_THREADS_ROOT`);
    }
    await access(file);
    files.push(file);
  }
  return files;
}

export async function main() {
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

  const assetFiles = await resolvePostAssetFiles(post);

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
      assetFile: assetFiles.length === 1 ? assetFiles[0] : null,
      assetFiles,
      mediaCount: assetFiles.length,
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
    let imageUrls = null;
    let inputIdentity = null;
    if (assetFiles.length > 0) {
      const cloudflaredPath = process.env.SREDA_CLOUDFLARED;
      if (!cloudflaredPath) throw new Error("Для медиапоста задайте SREDA_CLOUDFLARED");
      // stageMediaFile обновляет общий manifest, поэтому файлы готовим
      // последовательно, сохраняя порядок слайдов.
      const stagedMedia = [];
      for (const assetFile of assetFiles) {
        stagedMedia.push(await stageMediaFile(assetFile, RUNTIME));
      }
      await startStage({ runtimeDir: RUNTIME, cloudflaredPath });
      stageStarted = true;
      const publicUrls = [];
      for (const staged of stagedMedia) {
        publicUrls.push(await publicUrlForRoute(RUNTIME, staged.route));
      }
      if (publicUrls.length === 1) {
        [imageUrl] = publicUrls;
        inputIdentity = stagedMedia[0].sourceHash;
      } else {
        imageUrls = publicUrls;
        inputIdentity = stagedMedia.map((item) => item.sourceHash);
      }
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
      imageUrls,
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

if (process.argv[1] && path.resolve(process.argv[1]) === ENTRY_FILE) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, name: error.name })}\n`);
    process.exitCode = 1;
  });
}
