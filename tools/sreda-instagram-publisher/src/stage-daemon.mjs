import { spawn } from "node:child_process";
import { mkdir, open, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createMediaServer } from "./media-stage.mjs";

const runtimeDir = path.resolve(process.env.SREDA_STAGE_RUNTIME || "");
const cloudflared = path.resolve(process.env.SREDA_CLOUDFLARED || "");
const launchId = process.env.SREDA_STAGE_LAUNCH_ID || "";
const stateFile = path.join(runtimeDir, "stage-state.json");
const logFile = path.join(runtimeDir, "cloudflared.log");
const controlToken = randomBytes(32).toString("hex");

if (!process.env.SREDA_STAGE_RUNTIME || !process.env.SREDA_CLOUDFLARED || !launchId) {
  process.exitCode = 2;
  throw new Error("SREDA_STAGE_RUNTIME, SREDA_CLOUDFLARED и SREDA_STAGE_LAUNCH_ID обязательны");
}

await mkdir(runtimeDir, { recursive: true });

async function writeState(value) {
  const temp = `${stateFile}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, stateFile);
}

const { server } = createMediaServer({ runtimeDir, controlToken });
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const port = server.address().port;

// Каждый запуск получает чистый лог: иначе URL прошлого Quick Tunnel можно
// ошибочно принять за адрес нового процесса.
const logHandle = await open(logFile, "w", 0o600);
const tunnel = spawn(cloudflared, [
  "tunnel",
  "--no-autoupdate",
  "--url",
  `http://127.0.0.1:${port}`,
], {
  windowsHide: true,
  stdio: ["ignore", logHandle.fd, logHandle.fd],
});

let state = {
  version: 1,
  launchId,
  status: "starting",
  daemonPid: process.pid,
  cloudflaredPid: tunnel.pid,
  port,
  controlToken,
  startedAt: new Date().toISOString(),
  publicBaseUrl: null,
};
await writeState(state);

const deadline = Date.now() + 45_000;
while (Date.now() < deadline && !state.publicBaseUrl) {
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    const text = await import("node:fs/promises").then(({ readFile }) => readFile(logFile, "utf8"));
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      state = { ...state, status: "ready", publicBaseUrl: match[0] };
      await writeState(state);
    }
  } catch {
    // Лог может ещё не существовать.
  }
  if (tunnel.exitCode !== null) break;
}

if (!state.publicBaseUrl) {
  state = { ...state, status: "error", error: "Cloudflare Quick Tunnel не вернул HTTPS URL" };
  await writeState(state);
  server.close();
  tunnel.kill();
  await logHandle.close();
  process.exit(1);
}

async function shutdown() {
  tunnel.kill();
  await new Promise((resolve) => server.close(resolve));
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

await new Promise((resolve) => server.once("close", resolve));
tunnel.kill();
await logHandle.close().catch(() => {});
await writeState({ ...state, status: "stopped", stoppedAt: new Date().toISOString() });
