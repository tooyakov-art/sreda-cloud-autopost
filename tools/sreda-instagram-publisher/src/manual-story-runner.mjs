#!/usr/bin/env node
import path from "node:path";
import { appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { stageMediaFile } from "./media-stage.mjs";
import {
  prepareStoryIdempotent,
  publishReservedStory,
  reserveStoryPublication,
} from "./publisher.mjs";
import { clientFromEnv } from "./secrets.mjs";
import {
  publicUrlForRoute,
  startStage,
  stopStage,
} from "./stage-controller.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.resolve(ROOT, "..", "..");
const RUNTIME = path.join(ROOT, ".runtime");
const LEDGER = path.join(RUNTIME, "publication-ledger.json");
const CLOUDFLARED = process.env.SREDA_CLOUDFLARED;
const ONE_OFF_HARD_STOP = new Date("2026-08-31T01:04:00Z");

const APPROVED_STORIES = new Map([
  [
    "constitution-day-2026",
    {
      file: path.join(
        WORKSPACE,
        "content",
        "manual-stories",
        "constitution-day-2026.png",
      ),
      key: "sreda-manual-story-constitution-day-2026-bilingual-v1",
    },
  ],
]);

function parseArgs(argv) {
  const options = {
    storyId: null,
    phase: null,
    reservationId: null,
    publishDeadline: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (
      ![
        "--story-id",
        "--phase",
        "--reservation-id",
        "--publish-deadline",
      ].includes(option)
    ) {
      throw new Error(`Неизвестный аргумент: ${option}`);
    }
    if (!value) throw new Error(`Нет значения для ${option}`);
    index += 1;
    if (option === "--story-id") options.storyId = value;
    else if (option === "--phase") options.phase = value;
    else if (option === "--reservation-id") options.reservationId = value;
    else options.publishDeadline = value;
  }
  if (process.env.GITHUB_ACTIONS !== "true") {
    throw new Error("Live manual Story разрешена только в GitHub Actions");
  }
  if (!APPROVED_STORIES.has(options.storyId))
    throw new Error("Story не входит в approved one-off manifest");
  if (!["prepare", "reserve", "publish"].includes(options.phase)) {
    throw new Error("--phase должен быть prepare, reserve или publish");
  }
  if (
    ["reserve", "publish"].includes(options.phase) &&
    !options.reservationId
  ) {
    throw new Error("Для reserve/publish обязателен --reservation-id");
  }
  const deadline = new Date(options.publishDeadline);
  if (!options.publishDeadline || !Number.isFinite(deadline.getTime())) {
    throw new Error("Некорректный --publish-deadline");
  }
  if (deadline.getTime() !== ONE_OFF_HARD_STOP.getTime()) {
    throw new Error(
      "One-off Story разрешена только до зафиксированного hard stop",
    );
  }
  options.publishDeadline = deadline;
  return options;
}

async function writeGithubOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
  await appendFile(process.env.GITHUB_OUTPUT, lines, "utf8");
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const story = APPROVED_STORIES.get(options.storyId);

  if (options.phase === "reserve") {
    const result = await reserveStoryPublication({
      ledgerFile: LEDGER,
      key: story.key,
      reservationId: options.reservationId,
      publishDeadline: options.publishDeadline,
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          kind: "story",
          storyId: options.storyId,
          phase: "reserve",
          ...result,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (options.phase === "publish") {
    const client = await clientFromEnv();
    const result = await publishReservedStory({
      client,
      ledgerFile: LEDGER,
      key: story.key,
      reservationId: options.reservationId,
      publishDeadline: options.publishDeadline,
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          kind: "story",
          storyId: options.storyId,
          phase: "publish",
          ...result,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  if (!CLOUDFLARED) throw new Error("Задайте SREDA_CLOUDFLARED");
  let shouldStopStage = false;
  try {
    const client = await clientFromEnv();
    await client.verifyProfile({ expectedUsername: "sreda.astana" });
    const stage = await startStage({
      runtimeDir: RUNTIME,
      cloudflaredPath: CLOUDFLARED,
    });
    shouldStopStage = !stage.reused;
    const staged = await stageMediaFile(story.file, RUNTIME);
    const imageUrl = await publicUrlForRoute(RUNTIME, staged.route);
    const result = await prepareStoryIdempotent({
      client,
      ledgerFile: LEDGER,
      key: story.key,
      imageUrl,
      inputIdentity: staged.sourceHash,
      publishDeadline: options.publishDeadline,
    });
    await writeGithubOutputs({ needs_publish: result.needsPublish === true });
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          kind: "story",
          storyId: options.storyId,
          phase: "prepare",
          ...result,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (shouldStopStage) await stopStage(RUNTIME);
  }
}

run().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ ok: false, name: error.name, error: error.message })}\n`,
  );
  process.exitCode = 1;
});
