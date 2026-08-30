#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stageMediaFile } from "./media-stage.mjs";
import { getRunningStage, publicUrlForRoute, startStage, stopStage } from "./stage-controller.mjs";
import { publishCarouselIdempotent } from "./publisher.mjs";
import { pollInstagramDirect } from "./direct-poller.mjs";
import { loadDirectConfig } from "./direct-router.mjs";
import { clientFromEnv } from "./secrets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = path.join(ROOT, ".runtime");
const LEDGER = path.join(RUNTIME, "publication-ledger.json");
const DEFAULT_CLOUDFLARED = "C:\\Users\\tuako\\.codex\\tools\\cloudflared\\cloudflared.exe";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { _: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (!value.startsWith("--")) {
      options._.push(value);
      continue;
    }
    const key = value.slice(2);
    if (["dry-run"].includes(key)) {
      options[key] = true;
      continue;
    }
    const next = rest[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`Нет значения для --${key}`);
    index += 1;
    if (["file", "item-url", "video-url"].includes(key)) {
      options[key] ??= [];
      options[key].push(next);
    } else {
      options[key] = next;
    }
  }
  return { command, options };
}

function requireOption(options, key) {
  const value = options[key];
  if (value === undefined || value === "") throw new Error(`Обязательный параметр: --${key}`);
  return value;
}

async function stageInputs(files = []) {
  const stage = await getRunningStage(RUNTIME);
  if (!stage) throw new Error("Для локальных файлов сначала выполните stage-start");
  const staged = [];
  for (const file of files) {
    const item = await stageMediaFile(file, RUNTIME);
    staged.push({
      ...item,
      url: await publicUrlForRoute(RUNTIME, item.route),
      identity: item.sourceHash,
    });
  }
  return staged;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command === "stage-start") {
    const state = await startStage({
      runtimeDir: RUNTIME,
      cloudflaredPath: options.cloudflared || process.env.SREDA_CLOUDFLARED || DEFAULT_CLOUDFLARED,
    });
    print({ ok: true, status: state.status, publicBaseUrl: state.publicBaseUrl, reused: state.reused, stateFile: path.join(RUNTIME, "stage-state.json") });
    return;
  }

  if (command === "stage-stop") {
    print({ ok: true, ...(await stopStage(RUNTIME)) });
    return;
  }

  if (command === "stage-add") {
    const input = requireOption(options, "input");
    const item = await stageMediaFile(input, RUNTIME);
    const stage = await getRunningStage(RUNTIME);
    print({
      ok: true,
      convertedToJpeg: path.extname(input).toLowerCase() === ".png",
      filePath: item.filePath,
      route: item.route,
      publicUrl: stage ? await publicUrlForRoute(RUNTIME, item.route) : null,
      tunnelRunning: Boolean(stage),
      reused: item.reused,
    });
    return;
  }

  if (command === "story") {
    const key = requireOption(options, "idempotency-key");
    let imageUrl = options["image-url"];
    let inputIdentity = imageUrl;
    if (options.file?.length) {
      if (options.file.length !== 1 || imageUrl) throw new Error("Для Story укажите либо один --file, либо --image-url");
      if (options["dry-run"]) {
        print({ ok: true, dryRun: true, action: "publish-story", sourceFile: path.resolve(options.file[0]), idempotencyKey: key, graphBase: "https://graph.instagram.com/v23.0" });
        return;
      }
      const [staged] = await stageInputs(options.file);
      imageUrl = staged.url;
      inputIdentity = staged.identity;
    }
    if (!imageUrl) throw new Error("Для Story укажите --file или --image-url");
    if (options["dry-run"]) {
      print({ ok: true, dryRun: true, action: "publish-story", imageUrl, idempotencyKey: key, graphBase: "https://graph.instagram.com/v23.0" });
      return;
    }
    throw new Error(
      "Live Story разрешена только через двухфазный GitHub workflow с durable pre-publish checkpoint",
    );
  }

  if (command === "carousel") {
    const key = requireOption(options, "idempotency-key");
    const staged = options.file?.length
      ? options["dry-run"] ? [] : await stageInputs(options.file)
      : [];
    const items = [
      ...(options["item-url"] || []).map((url) => ({ url, type: "IMAGE", identity: url })),
      ...(options["video-url"] || []).map((url) => ({ url, type: "VIDEO", identity: url })),
      ...staged.map((item) => ({ url: item.url, type: /\.(?:mp4|mov)$/i.test(item.fileName) ? "VIDEO" : "IMAGE", identity: item.identity })),
    ];
    if (options["dry-run"] && options.file?.length) {
      for (const file of options.file) items.push({ file: path.resolve(file), type: /\.(?:mp4|mov)$/i.test(file) ? "VIDEO" : "IMAGE" });
    }
    if (items.length < 2 || items.length > 10) throw new Error("Карусель должна содержать от 2 до 10 --file/--item-url/--video-url");
    const caption = options["caption-file"] ? await readFile(path.resolve(options["caption-file"]), "utf8") : (options.caption || "");
    if (options["dry-run"]) {
      print({ ok: true, dryRun: true, action: "publish-carousel", items, captionCharacters: caption.length, idempotencyKey: key, graphBase: "https://graph.instagram.com/v23.0" });
      return;
    }
    const apiItems = items.map(({ url, type }) => ({ url, type }));
    const identity = items.map(({ identity }) => identity);
    const result = await publishCarouselIdempotent({ client: await clientFromEnv(), ledgerFile: LEDGER, key, items: apiItems, caption, inputIdentity: identity });
    print({ ok: true, action: "publish-carousel", ...result });
    return;
  }

  if (command === "status") {
    const containerId = requireOption(options, "container-id");
    const status = await (await clientFromEnv()).getContainerStatus(containerId);
    print({ ok: true, containerId, statusCode: status.status_code, status: status.status });
    return;
  }

  if (command === "direct-poll") {
    if (!options["dry-run"]) {
      const liveGateOpen = options.mode === "live" && process.env.SREDA_IG_DIRECT_LIVE_ENABLED === "true";
      if (!liveGateOpen) {
        throw new Error("direct-poll безопасен по умолчанию: используйте --dry-run; live требует --mode live и SREDA_IG_DIRECT_LIVE_ENABLED=true");
      }
      throw new Error("Live-отправка Direct ещё не реализована и остаётся заблокированной");
    }
    const configFile = options.config || process.env.SREDA_IG_DIRECT_CONFIG;
    if (!configFile) throw new Error("Задайте --config или SREDA_IG_DIRECT_CONFIG");
    if (options.ledger) throw new Error("Для dry-run используйте отдельный --preview-ledger, не live ledger");
    const previewLedgerFile = path.resolve(
      options["preview-ledger"]
      || process.env.SREDA_IG_DIRECT_PREVIEW_LEDGER
      || path.join(RUNTIME, "direct-preview-ledger.json"),
    );
    const maxConversations = options.limit === undefined ? 25 : Number(options.limit);
    const result = await pollInstagramDirect({
      client: await clientFromEnv(),
      config: await loadDirectConfig(configFile),
      previewLedgerFile,
      maxConversations,
      mode: "dry-run",
    });
    print({ action: "direct-poll", previewLedgerFile, ...result });
    return;
  }

  throw new Error("Команды: stage-start, stage-stop, stage-add, story, carousel, status, direct-poll");
}

main().catch((error) => {
  // Значения секретов здесь никогда не печатаются.
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, name: error.name })}\n`);
  process.exitCode = 1;
});
