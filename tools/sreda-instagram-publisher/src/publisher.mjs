import { PublicationLedger, fingerprint } from "./ledger.mjs";

function normalizeStatus(status) {
  return String(status?.status_code || "").toUpperCase();
}

async function ensureReady(client, containerId) {
  const status = await client.getContainerStatus(containerId);
  if (normalizeStatus(status) === "PUBLISHED") return status;
  if (normalizeStatus(status) === "FINISHED") return status;
  return client.waitForContainer(containerId);
}

export async function publishStoryIdempotent({
  client,
  ledgerFile,
  key,
  imageUrl,
  inputIdentity = imageUrl,
}) {
  const ledger = new PublicationLedger(ledgerFile);
  const inputFingerprint = fingerprint({ kind: "story", inputIdentity });
  return ledger.withLock(async () => {
    let record = await ledger.get(key);
    if (record?.inputFingerprint !== undefined && record.inputFingerprint !== inputFingerprint) {
      throw new Error(`Ключ ${key} уже использован для другого Story`);
    }
    if (record?.completed) return { ...record.result, duplicatePrevented: true };
    record ??= { kind: "story", inputFingerprint, createdAt: new Date().toISOString() };
    record.imageUrl ??= imageUrl;

    if (!record.containerId) {
      record.containerId = await client.createStoryContainer(record.imageUrl);
      await ledger.put(key, record);
    }

    const status = await ensureReady(client, record.containerId);
    if (normalizeStatus(status) === "PUBLISHED") {
      record.completed = true;
      record.result = { id: null, containerId: record.containerId, recovered: true };
      await ledger.put(key, record);
      return record.result;
    }

    const published = await client.publishContainer(record.containerId);
    record.completed = true;
    record.result = { ...published, containerId: record.containerId };
    await ledger.put(key, record);
    return record.result;
  });
}

export async function publishCarouselIdempotent({
  client,
  ledgerFile,
  key,
  items,
  caption = "",
  inputIdentity = items,
}) {
  if (!Array.isArray(items) || items.length < 2 || items.length > 10) {
    throw new TypeError("Карусель должна содержать от 2 до 10 элементов");
  }
  const ledger = new PublicationLedger(ledgerFile);
  const inputFingerprint = fingerprint({ kind: "carousel", inputIdentity, caption });
  return ledger.withLock(async () => {
    let record = await ledger.get(key);
    if (record?.inputFingerprint !== undefined && record.inputFingerprint !== inputFingerprint) {
      throw new Error(`Ключ ${key} уже использован для другой карусели`);
    }
    if (record?.completed) return { ...record.result, duplicatePrevented: true };
    record ??= {
      kind: "carousel",
      inputFingerprint,
      items,
      childIds: [],
      caption,
      createdAt: new Date().toISOString(),
    };

    for (let index = 0; index < record.items.length; index += 1) {
      if (!record.childIds[index]) {
        // Quick Tunnel получает новый hostname после перезапуска. Для ещё не
        // созданного дочернего контейнера используем свежий URL текущего запуска;
        // уже созданные контейнеры остаются нетронутыми.
        record.items[index] = items[index];
        record.childIds[index] = await client.createCarouselItem(record.items[index]);
        await ledger.put(key, record);
      }
      await ensureReady(client, record.childIds[index]);
    }

    if (!record.containerId) {
      record.containerId = await client.createCarouselContainer(record.childIds, record.caption);
      await ledger.put(key, record);
    }

    const status = await ensureReady(client, record.containerId);
    if (normalizeStatus(status) === "PUBLISHED") {
      record.completed = true;
      record.result = { id: null, containerId: record.containerId, recovered: true };
      await ledger.put(key, record);
      return record.result;
    }

    const published = await client.publishContainer(record.containerId);
    record.completed = true;
    record.result = { ...published, containerId: record.containerId };
    await ledger.put(key, record);
    return record.result;
  });
}
