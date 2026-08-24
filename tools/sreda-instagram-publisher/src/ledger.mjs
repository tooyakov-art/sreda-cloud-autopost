import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, file);
}

export class PublicationLedger {
  constructor(file) {
    this.file = path.resolve(file);
    this.lockFile = `${this.file}.lock`;
  }

  async withLock(callback, { waitMs = 20_000, staleMs = 15 * 60_000 } = {}) {
    await mkdir(path.dirname(this.file), { recursive: true });
    const deadline = Date.now() + waitMs;
    let handle;
    while (!handle) {
      try {
        handle = await open(this.lockFile, "wx", 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          const info = await stat(this.lockFile);
          if (Date.now() - info.mtimeMs > staleMs) {
            await rm(this.lockFile, { force: true });
            continue;
          }
        } catch (statError) {
          if (statError.code === "ENOENT") continue;
          throw statError;
        }
        if (Date.now() >= deadline) throw new Error("Журнал публикаций занят другим процессом");
        await sleep(250);
      }
    }
    try {
      return await callback();
    } finally {
      await handle.close().catch(() => {});
      await rm(this.lockFile, { force: true });
    }
  }

  async readAll() {
    return readJson(this.file, { version: 1, publications: {} });
  }

  async get(key) {
    const data = await this.readAll();
    return data.publications[key] ?? null;
  }

  async put(key, record) {
    const data = await this.readAll();
    data.publications[key] = {
      ...record,
      updatedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(this.file, data);
    return data.publications[key];
  }
}

export class DirectMessageLedger extends PublicationLedger {
  async readAll() {
    return readJson(this.file, { version: 1, messages: {} });
  }

  async get(key) {
    const data = await this.readAll();
    return data.messages[key] ?? null;
  }

  async put(key, record) {
    const data = await this.readAll();
    data.messages[key] = {
      ...record,
      updatedAt: new Date().toISOString(),
    };
    await writeJsonAtomic(this.file, data);
    return data.messages[key];
  }

  async putOnce(key, record) {
    return this.withLock(async () => {
      const existing = await this.get(key);
      if (existing) return { created: false, record: existing };
      return { created: true, record: await this.put(key, record) };
    });
  }
}
