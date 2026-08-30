import { PublicationLedger, fingerprint } from "./ledger.mjs";
import { ThreadsPublishUncertainError } from "./threads-client.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

async function findExistingByText(client, text) {
  const expected = normalizeText(text);
  const recent = await client.listRecentThreads({ limit: 50 });
  return recent.find((item) => normalizeText(item.text) === expected) ?? null;
}

export async function publishThreadsPostIdempotent({
  client,
  ledgerFile,
  key,
  text,
  imageUrl = null,
  inputIdentity = imageUrl,
}) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) throw new TypeError("Текст Threads не должен быть пустым");
  const kind = imageUrl ? "threads-image" : "threads-text";
  const inputFingerprint = fingerprint({ kind, text: normalizedText, inputIdentity });
  const ledger = new PublicationLedger(ledgerFile);

  return ledger.withLock(async () => {
    let record = await ledger.get(key);
    if (record?.inputFingerprint !== undefined && record.inputFingerprint !== inputFingerprint) {
      throw new Error(`Ключ ${key} уже использован для другого Threads-поста`);
    }
    if (record?.completed) return { ...record.result, duplicatePrevented: true };
    if (record?.publishUncertain) {
      throw new Error(`Публикация ${key} ранее получила неопределённый ответ; автоматический повтор заблокирован`);
    }

    record ??= {
      kind,
      inputFingerprint,
      text: normalizedText,
      inputIdentity,
      createdAt: new Date().toISOString(),
    };

    // Cache может исчезнуть вместе с GitHub runner. Перед созданием контейнера
    // проверяем публичные Threads по точному тексту и восстанавливаем результат.
    if (!record.containerId) {
      const existing = await findExistingByText(client, normalizedText);
      if (existing?.id) {
        record.completed = true;
        record.result = {
          id: String(existing.id),
          permalink: existing.permalink || null,
          recoveredFromProfile: true,
        };
        await ledger.put(key, record);
        return record.result;
      }
    }

    if (!record.containerId) {
      record.containerId = imageUrl
        ? await client.createImageContainer({ imageUrl, text: normalizedText })
        : await client.createTextContainer(normalizedText);
      await ledger.put(key, record);
    }

    const status = await client.waitForContainer(record.containerId);
    if (String(status.status || "").toUpperCase() === "PUBLISHED") {
      record.completed = true;
      record.result = { id: record.containerId, containerId: record.containerId, recovered: true };
      await ledger.put(key, record);
      return record.result;
    }

    try {
      const published = await client.publishContainer(record.containerId);
      const verified = await client.getThread(published.id);
      if (normalizeText(verified.text) !== normalizedText) {
        throw new Error(`Threads ${published.id} опубликован с неожиданным текстом`);
      }
      record.completed = true;
      record.result = {
        ...published,
        containerId: record.containerId,
        permalink: verified.permalink || null,
        mediaType: verified.media_type || null,
        timestamp: verified.timestamp || null,
      };
      await ledger.put(key, record);
      return record.result;
    } catch (error) {
      if (error instanceof ThreadsPublishUncertainError) {
        record.publishUncertain = true;
        await ledger.put(key, record);
      }
      throw error;
    }
  });
}
