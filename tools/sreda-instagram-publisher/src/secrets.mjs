import { readFile } from "node:fs/promises";
import path from "node:path";
import { InstagramClient } from "./instagram-client.mjs";

export async function readAccessToken(env = process.env) {
  if (env.SREDA_IG_ACCESS_TOKEN) {
    const value = env.SREDA_IG_ACCESS_TOKEN.trim();
    if (value.startsWith("{")) {
      const parsed = JSON.parse(value);
      if (!parsed.access_token) throw new Error("В SREDA_IG_ACCESS_TOKEN нет поля access_token");
      return String(parsed.access_token).trim();
    }
    return value;
  }
  const file = env.SREDA_IG_ACCESS_TOKEN_FILE;
  if (!file) throw new Error("Задайте SREDA_IG_ACCESS_TOKEN_FILE (рекомендуется) или SREDA_IG_ACCESS_TOKEN");
  const content = (await readFile(path.resolve(file), "utf8")).trim();
  if (!content) throw new Error("Файл Instagram token пуст");
  if (content.startsWith("{")) {
    const parsed = JSON.parse(content);
    if (!parsed.access_token) throw new Error("В JSON нет поля access_token");
    return String(parsed.access_token).trim();
  }
  return content;
}

export async function clientFromEnv(env = process.env, options = {}) {
  const userId = env.SREDA_IG_USER_ID;
  if (!userId) throw new Error("Задайте SREDA_IG_USER_ID");
  return new InstagramClient({
    accessToken: await readAccessToken(env),
    userId,
    ...options,
  });
}
