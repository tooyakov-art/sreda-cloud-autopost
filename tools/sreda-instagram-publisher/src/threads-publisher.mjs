import { PublicationLedger, fingerprint } from "./ledger.mjs";
import { ThreadsPublishUncertainError } from "./threads-client.mjs";

export async function publishThreadsTextIdempotent({
  client,
  ledgerFile,
  key,
  text,
}) {
  const ledger = new PublicationLedger(ledgerFile);
  const inputFingerprint = fingerprint({ kind: "threads-text", text });
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
      kind: "threads-text",
      inputFingerprint,
      text,
      createdAt: new Date().toISOString(),
    };

    if (!record.containerId) {
      record.containerId = await client.createTextContainer(record.text);
      await ledger.put(key, record);
    }

    const status = await client.waitForContainer(record.containerId);
    if (String(status.status || "").toUpperCase() === "PUBLISHED") {
      record.completed = true;
      record.result = { id: null, containerId: record.containerId, recovered: true };
      await ledger.put(key, record);
      return record.result;
    }

    try {
      const published = await client.publishContainer(record.containerId);
      record.completed = true;
      record.result = { ...published, containerId: record.containerId };
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
