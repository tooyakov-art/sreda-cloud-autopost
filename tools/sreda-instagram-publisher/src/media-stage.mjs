import { randomBytes, createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import sharp from "sharp";

const MIME = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".mp4", "video/mp4"],
  [".mov", "video/quicktime"],
]);

async function sha256File(file) {
  const hash = createHash("sha256");
  const stream = createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
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
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temp, file);
}

function safeStem(file) {
  const stem = path.basename(file, path.extname(file))
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return stem || "media";
}

export async function stageMediaFile(inputFile, runtimeDir) {
  const source = path.resolve(inputFile);
  const info = await stat(source);
  if (!info.isFile()) throw new Error(`Не файл: ${source}`);
  const ext = path.extname(source).toLowerCase();
  if (!MIME.has(ext)) throw new Error(`Неподдерживаемый формат staging: ${ext || "без расширения"}`);

  const root = path.resolve(runtimeDir);
  const publicDir = path.join(root, "public");
  const manifestFile = path.join(root, "stage-manifest.json");
  await mkdir(publicDir, { recursive: true });
  const sourceHash = await sha256File(source);
  const outputExt = ext === ".png" ? ".jpg" : ext === ".jpeg" ? ".jpg" : ext;
  const manifest = await readJson(manifestFile, { version: 1, files: {} });
  const key = `${sourceHash}:${outputExt}`;
  let entry = manifest.files[key];

  if (entry) {
    const existing = path.join(publicDir, entry.fileName);
    try {
      if ((await stat(existing)).isFile()) {
        return { ...entry, filePath: existing, route: `/media/${entry.fileName}`, reused: true };
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const fileName = `${safeStem(source)}-${randomBytes(12).toString("hex")}${outputExt}`;
  const output = path.join(publicDir, fileName);
  if (ext === ".png") {
    await sharp(source)
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
      .toFile(output);
  } else {
    await copyFile(source, output);
  }

  entry = {
    fileName,
    sourceHash,
    sourceBytes: info.size,
    stagedAt: new Date().toISOString(),
    mimeType: MIME.get(outputExt),
  };
  manifest.files[key] = entry;
  await writeJsonAtomic(manifestFile, manifest);
  return { ...entry, filePath: output, route: `/media/${fileName}`, reused: false };
}

export function createMediaServer({ runtimeDir, controlToken = randomBytes(32).toString("hex") }) {
  const root = path.resolve(runtimeDir);
  const publicDir = path.join(root, "public");
  let stopRequested = false;

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && requestUrl.pathname === "/healthz") {
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end('{"ok":true}');
        return;
      }
      if (request.method === "POST" && requestUrl.pathname === "/__control/stop") {
        if (request.headers["x-sreda-control"] !== controlToken) {
          response.writeHead(403).end();
          return;
        }
        stopRequested = true;
        response.writeHead(202, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end('{"stopping":true}');
        setImmediate(() => server.close());
        return;
      }
      const match = requestUrl.pathname.match(/^\/media\/([a-zA-Z0-9_-]+\.(?:jpe?g|png|mp4|mov))$/i);
      if (request.method !== "GET" || !match) {
        response.writeHead(404, { "Cache-Control": "no-store" }).end();
        return;
      }
      const filename = match[1];
      const file = path.join(publicDir, filename);
      if (path.dirname(file) !== publicDir) {
        response.writeHead(404).end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) throw Object.assign(new Error("not found"), { code: "ENOENT" });
      response.writeHead(200, {
        "Content-Type": MIME.get(path.extname(file).toLowerCase()) || "application/octet-stream",
        "Content-Length": info.size,
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
      });
      createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Cache-Control": "no-store" }).end();
    }
  });

  return {
    server,
    controlToken,
    wasStopRequested: () => stopRequested,
  };
}
