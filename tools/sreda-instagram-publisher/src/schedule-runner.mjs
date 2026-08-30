#!/usr/bin/env node
import path from "node:path";
import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { stageMediaFile } from "./media-stage.mjs";
import {
  prepareStoryIdempotent,
  publishCarouselIdempotent,
  publishReservedStory,
  reserveStoryPublication,
} from "./publisher.mjs";
import {
  carouselFilesForAction,
  localSlot,
  parseAt,
  resolveScheduledAction,
  storyFileForAction,
  threadsAutopublishEnabled,
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
  const options = {
    dryRun: false,
    at: null,
    scheduledLocalTime: null,
    storyPhase: null,
    reservationId: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") options.dryRun = true;
    else if (argv[index] === "--at") {
      if (!argv[index + 1]) throw new Error("Нет значения для --at");
      options.at = argv[++index];
    } else if (argv[index] === "--scheduled-local-time") {
      if (!argv[index + 1]) throw new Error("Нет значения для --scheduled-local-time");
      options.scheduledLocalTime = argv[++index];
    } else if (argv[index] === "--story-phase") {
      if (!argv[index + 1]) throw new Error("Нет значения для --story-phase");
      options.storyPhase = argv[++index];
    } else if (argv[index] === "--reservation-id") {
      if (!argv[index + 1]) throw new Error("Нет значения для --reservation-id");
      options.reservationId = argv[++index];
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
  if (options.storyPhase && !["prepare", "reserve", "publish"].includes(options.storyPhase)) {
    throw new Error("--story-phase должен быть prepare, reserve или publish");
  }
  if (options.storyPhase && !options.scheduledLocalTime) {
    throw new Error("--story-phase разрешён только с --scheduled-local-time в GitHub Actions");
  }
  if (["reserve", "publish"].includes(options.storyPhase) && !options.reservationId) {
    throw new Error("Для reserve/publish обязателен --reservation-id");
  }
  return options;
}

async function writeGithubOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join("");
  await appendFile(process.env.GITHUB_OUTPUT, lines, "utf8");
}

function storyDeadline(plan) {
  return new Date(parseAt(plan.localSlot.replace(" ", "T")).getTime() + 15 * 60_000);
}

function describeStoryIdentity(action) {
  return {
    kind: "story",
    localSlot: action.local.key,
    idempotencyKey: `sreda-story-${action.local.date}-${action.local.time.replace(":", "")}-${String(action.storyIndex + 1).padStart(2, "0")}`,
  };
}

async function describeAction(action) {
  if (action.kind === "story") {
    const file = await storyFileForAction(action, STORIES_ROOT);
    return { ...describeStoryIdentity(action), file };
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

  if (action.kind === "threads-text" && !threadsAutopublishEnabled()) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      dryRun: options.dryRun,
      noOp: true,
      kind: "threads-text",
      localSlot: action.local.key,
      reason: "threads-autopublish-disabled",
    }, null, 2)}\n`);
    return;
  }

  // После удалённого сохранения durable-брони выполняем только неизбежные
  // локальные чтения журнала/секретов, проверку срока и единственный POST.
  // Файлы и профиль Meta уже проверены до брони на prepare-фазе.
  if (action.kind === "story" && ["reserve", "publish"].includes(options.storyPhase)) {
    const story = describeStoryIdentity(action);
    const publishDeadline = storyDeadline(story);
    if (options.storyPhase === "reserve") {
      const result = await reserveStoryPublication({
        ledgerFile: LEDGER,
        key: story.idempotencyKey,
        reservationId: options.reservationId,
        publishDeadline,
      });
      process.stdout.write(`${JSON.stringify({
        ok: true,
        kind: "story",
        phase: "reserve",
        localSlot: story.localSlot,
        ...result,
      }, null, 2)}\n`);
      return;
    }

    const client = await clientFromEnv();
    const result = await publishReservedStory({
      client,
      ledgerFile: LEDGER,
      key: story.idempotencyKey,
      reservationId: options.reservationId,
      publishDeadline,
    });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      kind: "story",
      phase: "publish",
      localSlot: story.localSlot,
      ...result,
    }, null, 2)}\n`);
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

  if (plan.kind === "story") {
    if (options.storyPhase !== "prepare") {
      throw new Error("Live Story требует prepare/reserve/publish workflow");
    }
    const publishDeadline = storyDeadline(plan);

    let shouldStopStoryStage = false;
    try {
      const client = await clientFromEnv();
      await client.verifyProfile({
        expectedUsername: process.env.SREDA_IG_USERNAME || "sreda.astana",
      });
      const stage = await startStage({ runtimeDir: RUNTIME, cloudflaredPath: CLOUDFLARED });
      shouldStopStoryStage = !stage.reused;
      const [item] = await stageFiles([plan.file]);
      const result = await prepareStoryIdempotent({
        client,
        ledgerFile: LEDGER,
        key: plan.idempotencyKey,
        imageUrl: item.url,
        inputIdentity: item.identity,
        publishDeadline,
      });
      await writeGithubOutputs({ needs_publish: result.needsPublish === true });
      process.stdout.write(`${JSON.stringify({
        ok: true,
        kind: "story",
        phase: "prepare",
        localSlot: plan.localSlot,
        file: plan.file,
        ...result,
      }, null, 2)}\n`);
      return;
    } finally {
      if (shouldStopStoryStage) await stopStage(RUNTIME);
    }
  }

  let shouldStopStage = false;
  try {
    const client = await clientFromEnv();
    await client.verifyProfile({
      expectedUsername: process.env.SREDA_IG_USERNAME || "sreda.astana",
    });
    const stage = await startStage({ runtimeDir: RUNTIME, cloudflaredPath: CLOUDFLARED });
    shouldStopStage = !stage.reused;
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
