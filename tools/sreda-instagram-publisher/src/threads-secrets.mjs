import { readFile } from "node:fs/promises";
import path from "node:path";
import { ThreadsClient } from "./threads-client.mjs";

export async function readThreadsAccessToken(env = process.env) {
  if (env.SREDA_THREADS_ACCESS_TOKEN) {
    const value = env.SREDA_THREADS_ACCESS_TOKEN.trim();
    if (value.startsWith("{")) {
      const parsed = JSON.parse(value);
      if (!parsed.access_token) throw new Error("В SREDA_THREADS_ACCESS_TOKEN нет поля access_token");
      return String(parsed.access_token).trim();
    }
    return value;
  }
  const file = env.SREDA_THREADS_ACCESS_TOKEN_FILE;
  if (!file) {
    throw new Error("Задайте SREDA_THREADS_ACCESS_TOKEN_FILE (рекомендуется) или SREDA_THREADS_ACCESS_TOKEN");
  }
  const content = (await readFile(path.resolve(file), "utf8")).trim();
  if (!content) throw new Error("Файл Threads token пуст");
  if (content.startsWith("{")) {
    const parsed = JSON.parse(content);
    if (!parsed.access_token) throw new Error("В JSON Threads token нет поля access_token");
    return String(parsed.access_token).trim();
  }
  return content;
}

export async function threadsClientFromEnv(env = process.env, options = {}) {
  return new ThreadsClient({
    accessToken: await readThreadsAccessToken(env),
    ...options,
  });
}
