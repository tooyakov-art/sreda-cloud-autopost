#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clientFromEnv } from "./secrets.mjs";
import { threadsClientFromEnv } from "./threads-secrets.mjs";
import { startStage, stopStage } from "./stage-controller.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME = path.join(ROOT, ".runtime");
const cloudflaredPath = process.env.SREDA_CLOUDFLARED;

if (!cloudflaredPath) throw new Error("Задайте SREDA_CLOUDFLARED");

let stage;
try {
  const instagram = await clientFromEnv();
  const instagramProfile = await instagram.request(`${instagram.userId}?fields=id,username`);
  if (instagramProfile.username !== "sreda.astana") {
    throw new Error(`Instagram-профиль не совпал: ${instagramProfile.username || "unknown"}`);
  }

  const threads = await threadsClientFromEnv();
  const threadsProfile = await threads.verifyProfile({
    expectedUsername: process.env.SREDA_THREADS_USERNAME || "sreda.astana",
  });

  stage = await startStage({ runtimeDir: RUNTIME, cloudflaredPath });
  const response = await fetch(new URL("healthz", `${stage.publicBaseUrl}/`), {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Публичный staging вернул HTTP ${response.status}`);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    instagram: instagramProfile.username,
    threads: threadsProfile.username,
    staging: "ready",
  })}\n`);
} finally {
  if (stage && !stage.reused) await stopStage(RUNTIME).catch(() => {});
}
