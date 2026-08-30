#!/usr/bin/env node
import { access, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  listAllThreadsPosts,
  SEPTEMBER_THREADS_POSTS,
  validateThreadsSeptemberCalendar,
} from "./threads-september-calendar.mjs";
import { threadsClientFromEnv } from "./threads-secrets.mjs";

async function main() {
  const validation = validateThreadsSeptemberCalendar();
  if (!validation.ok) throw new Error(validation.errors.join("; "));
  if (!process.env.SREDA_THREADS_ROOT) throw new Error("Задайте SREDA_THREADS_ROOT");
  const root = path.resolve(process.env.SREDA_THREADS_ROOT);
  const assets = [...new Set(listAllThreadsPosts().map((item) => item.asset).filter(Boolean))];
  const checked = [];
  for (const relative of assets) {
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error(`Asset вышел за root: ${relative}`);
    await access(file);
    const fileStat = await stat(file);
    const metadata = await sharp(file).metadata();
    if (!metadata.width || !metadata.height) throw new Error(`Не удалось прочитать изображение: ${relative}`);
    if (metadata.width < 320 || metadata.height < 320) throw new Error(`Слишком маленькое изображение: ${relative}`);
    checked.push({ file: relative, bytes: fileStat.size, width: metadata.width, height: metadata.height });
  }
  const client = await threadsClientFromEnv();
  const profile = await client.verifyProfile({ expectedUsername: process.env.SREDA_THREADS_USERNAME || "sreda.astana" });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    profile: profile.username,
    posts: SEPTEMBER_THREADS_POSTS.length,
    counts: validation.counts,
    uniqueAssets: checked.length,
    assets: checked,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error.message, name: error.name })}\n`);
  process.exitCode = 1;
});
