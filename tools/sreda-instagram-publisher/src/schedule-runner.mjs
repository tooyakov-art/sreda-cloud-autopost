#!/usr/bin/env node
import path from "node:path";
import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { stageMediaFile } from "./media-stage.mjs";
import { publishCarouselIdempotent, publishStoryIdempotent } from "./publisher.mjs";
import {
  carouselFilesForAction,
  localSlot,
  parseAt,
  resolveScheduledAction,
  storyFileForAction,
} from "./schedule.mjs";
import { clientFromEnv } from "./secrets.mjs";
import { publicUrlForRoute, startStage, stopStage } from "./stage-controller.mjs";
import { threadsClientFromEnv } from "./threads-secrets.mjs";
import { publishThreadsTextIdempotent } from "./threads-publisher.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.resolve(ROOT, "..", "..");
const RUNTIME = path.join(ROOT, ".runtime");
const LEDGER = path.join(RUNTIME, "publication-ledger.json");
const STORIES_ROOT = process.env.SREDA_STORIES_ROOT || path.join(WORKSPACE, "output", "sreda-daily-stories");
const CAROUSELS_ROOT = process.env.SREDA_CAROUSELS_ROOT || path.join(WORKSPACE, "output", "sreda-carousel-posts-august");
const CLOUDFLARED = process.env.SREDA_CLOUDFLARED || "C:\\Users\\tuako\\.codex\\tools\\cloudflared\\cloudflared.exe";

function parseArgs(argv) {
  const options = { dryRun: false, at: null, scheduledLocalTime: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") options.dryRun = true;
    else if (argv[index] === "--at") {
      if (!argv[index + 1]) throw new Error("Нет значения для --at");
      options.at = argv[++index];
    } else if (argv[index] === "--scheduled-local-time") {
      if (!argv[index + 1]) throw new Error("Нет значения для --scheduled-local-time");
      options.scheduledLocalTime = argv[++index];
    } else throw new Error(`Неизвестный аргумент: ${argv[index]}`);
  }
  if (options.at && !options.dryRun) {
    throw new Error("--at разрешён только вместе с --dry-run, чтобы исключить публикацию задним числом");
  }
  if (options.scheduledLocalTime) {
    if (process.env.GITHUB_ACTIONS !== "true") {
      throw new Error("--scheduled-local-time разрешён только в GitHub Actions");
    }
    if (!/^\d{2}:\d{2}$/.test(options.scheduledLocalTime)) {
      throw new Error("--scheduled-local-time должен иметь формат HH:MM");
    }
  }
  return options;
}

async function describeAction(action) {
  if (action.kind === "story") {
    const file = await storyFileForAction(action, STORIES_ROOT);
    return {
      kind: "story",
      localSlot: action.local.key,
      file,
      idempotencyKey: `sreda-story-${action.local.date}-${action.local.time.replace(":", "")}-${String(action.storyIndex + 1).padStart(2, "0")}`,
    };
  }
  if (action.kind === "threads-text") {
    return {
      kind: "threads-text",
      localSlot: action.local.key,
      text: action.text,
      idempotencyKey: `sreda-threads-${action.local.date}-${action.local.time.replace(":", "")}-${action.slug}`,
    };
  }
  const files = await carouselFilesForAction(action, CAROUSELS_ROOT);
  return {
    kind: "carousel",
    localSlot: action.local.key,
    files,
    caption: action.caption,
    idempotencyKey: `sreda-carousel-${action.local.date}-${action.local.time.replace(":", "")}-${action.slug}`,
  };
}

async function stageFiles(files) {
  const result = [];
  for (const file of files) {
    const staged = await stageMediaFile(file, RUNTIME);
    result.push({
      url: await publicUrlForRoute(RUNTIME, staged.route),
      type: /\.(?:mp4|mov)$/i.test(staged.fileName) ? "VIDEO" : "IMAGE",
      identity: staged.sourceHash,
    });
  }
  return result;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const now = options.scheduledLocalTime
    ? parseAt(`${localSlot(new Date()).date}T${options.scheduledLocalTime}`)
    : parseAt(options.at);
  let action = resolveScheduledAction(now);
  if (!action && !options.at) {
    for (let minutesLate = 1; minutesLate <= 5 && !action; minutesLate += 1) {
      action = resolveScheduledAction(new Date(now.getTime() - minutesLate * 60_000));
    }
  }
  if (!action) {
    if (options.dryRun) {
      process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, noOp: true, reason: "outside-exact-slot" }, null, 2)}\n`);
    }
    return;
  }

  const plan = await describeAction(action);
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      dryRun: true,
      noOp: false,
      ...plan,
      ...(plan.caption ? { captionCharacters: plan.caption.length, caption: undefined } : {}),
    }, null, 2)}\n`);
    return;
  }

  if (plan.kind === "threads-text") {
    const client = await threadsClientFromEnv();
    const profile = await client.verifyProfile({ expectedUsername: process.env.SREDA_THREADS_USERNAME || "sreda.astana" });
    const result = await publishThreadsTextIdempotent({
      client,
      ledgerFile: LEDGER,
      key: plan.idempotencyKey,
      text: plan.text,
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      kind: "threads-text",
      localSlot: plan.localSlot,
      username: profile.username,
      ...result,
    }, null, 2)}\n`);
    return;
  }

  let shouldStopStage = false;
  try {
    const stage = await startStage({ runtimeDir: RUNTIME, cloudflaredPath: CLOUDFLARED });
    shouldStopStage = !stage.reused;
    const client = await clientFromEnv();
    if (plan.kind === "story") {
      const [item] = await stageFiles([plan.file]);
      const result = await publishStoryIdempotent({
        client,
        ledgerFile: LEDGER,
        key: plan.idempotencyKey,
        imageUrl: item.url,
        inputIdentity: item.identity,
      });
      process.stdout.write(`${JSON.stringify({ ok: true, kind: "story", localSlot: plan.localSlot, file: plan.file, ...result }, null, 2)}\n`);
      return;
    }

    const items = await stageFiles(plan.files);
    const result = await publishCarouselIdempotent({
      client,
      ledgerFile: LEDGER,
      key: plan.idempotencyKey,
      items: items.map(({ url, type }) => ({ url, type })),
      inputIdentity: items.map(({ identity }) => identity),
      caption: plan.caption,
    });
    process.stdout.write(`${JSON.stringify({ ok: true, kind: "carousel", localSlot: plan.localSlot, files: plan.files, ...result }, null, 2)}\n`);
  } finally {
    if (shouldStopStage) await stopStage(RUNTIME);
  }
}

run().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, name: error.name })}\n`);
  appendFile(
    path.join(RUNTIME, "scheduler-errors.log"),
    `${new Date().toISOString()} ${error.name}: ${error.message}\n`,
    "utf8",
  ).catch(() => {});
  process.exitCode = 1;
});
