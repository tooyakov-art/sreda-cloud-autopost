import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withLaunchLock(runtimeDir, callback) {
  const lockFile = path.join(runtimeDir, "stage-launch.lock");
  const deadline = Date.now() + 60_000;
  let handle;
  while (!handle) {
    try {
      handle = await open(lockFile, "wx", 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const info = await stat(lockFile);
        if (Date.now() - info.mtimeMs > 2 * 60_000) {
          await rm(lockFile, { force: true });
          continue;
        }
      } catch (statError) {
        if (statError.code === "ENOENT") continue;
        throw statError;
      }
      if (Date.now() >= deadline) throw new Error("Другой процесс слишком долго запускает staging");
      await sleep(250);
    }
  }
  try {
    return await callback();
  } finally {
    await handle.close().catch(() => {});
    await rm(lockFile, { force: true });
  }
}

async function readState(runtimeDir) {
  try {
    return JSON.parse(await readFile(path.join(runtimeDir, "stage-state.json"), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function checkLocal(state) {
  if (!state?.port) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/healthz`, {
      signal: AbortSignal.timeout(1_500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getRunningStage(runtimeDir) {
  const state = await readState(runtimeDir);
  if (state?.status === "ready" && await checkLocal(state)) return state;
  return null;
}

export async function startStage({ runtimeDir, cloudflaredPath }) {
  const root = path.resolve(runtimeDir);
  await mkdir(root, { recursive: true });
  return withLaunchLock(root, async () => {
    const running = await getRunningStage(root);
    if (running) return { ...running, reused: true };
    await access(cloudflaredPath);
    const launchId = randomBytes(16).toString("hex");

    const daemon = spawn(process.execPath, [path.join(HERE, "stage-daemon.mjs")], {
      cwd: path.dirname(HERE),
      detached: true,
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        SREDA_STAGE_RUNTIME: root,
        SREDA_CLOUDFLARED: path.resolve(cloudflaredPath),
        SREDA_STAGE_LAUNCH_ID: launchId,
      },
    });
    daemon.unref();

    const deadline = Date.now() + 50_000;
    while (Date.now() < deadline) {
      await sleep(300);
      const state = await readState(root);
      if (state?.launchId !== launchId) continue;
      if (state.status === "ready" && await checkLocal(state)) return { ...state, reused: false };
      if (state.status === "error") throw new Error(state.error || "Не удалось запустить staging");
    }
    // Если daemon успел поднять loopback-сервер, но Quick Tunnel не подтвердился,
    // закрываем только процесс именно этого launchId.
    await stopStage(root, { expectedLaunchId: launchId }).catch(() => {});
    throw new Error("Staging не запустился за 50 секунд");
  });
}

export async function stopStage(runtimeDir, { expectedLaunchId } = {}) {
  const state = await readState(path.resolve(runtimeDir));
  if (!state || state.status === "stopped") return { stopped: true, alreadyStopped: true };
  if (expectedLaunchId && state.launchId !== expectedLaunchId) {
    return { stopped: false, alreadyStopped: false, launchMismatch: true };
  }
  if (!state.port || !state.controlToken) throw new Error("Повреждён stage-state.json");
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/__control/stop`, {
      method: "POST",
      headers: { "X-SREDA-Control": state.controlToken },
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    throw new Error(`Не удалось безопасно остановить staging: ${error.message}`);
  }
  return { stopped: true, alreadyStopped: false };
}

export async function publicUrlForRoute(runtimeDir, route) {
  const state = await getRunningStage(path.resolve(runtimeDir));
  if (!state) throw new Error("HTTPS staging не запущен. Выполните stage-start.");
  return new URL(route, `${state.publicBaseUrl}/`).toString();
}
