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

function normalizeImageUrls({ imageUrl, imageUrls }) {
  const hasSingle = imageUrl !== null && imageUrl !== undefined;
  const hasCarousel = imageUrls !== null && imageUrls !== undefined;
  if (hasSingle && hasCarousel) {
    throw new TypeError("Передайте imageUrl либо imageUrls, но не оба поля одновременно");
  }
  if (hasCarousel) {
    if (!Array.isArray(imageUrls) || imageUrls.length < 2 || imageUrls.length > 20) {
      throw new TypeError("Threads-карусель должна содержать от 2 до 20 изображений");
    }
    return imageUrls.map((value, index) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new TypeError(`Threads imageUrls[${index}] не должен быть пустым`);
      }
      return value.trim();
    });
  }
  if (!hasSingle) return [];
  if (typeof imageUrl !== "string" || !imageUrl.trim()) {
    throw new TypeError("Threads imageUrl не должен быть пустым");
  }
  return [imageUrl.trim()];
}

function resultFromThread({ publishedId, containerId, verified, extra = {} }) {
  return {
    id: String(publishedId),
    containerId: String(containerId),
    permalink: verified.permalink || null,
    mediaType: verified.media_type || null,
    timestamp: verified.timestamp || null,
    ...extra,
  };
}

function assertExpectedText(thread, normalizedText) {
  if (normalizeText(thread?.text) !== normalizedText) {
    throw new Error(`Threads ${thread?.id || "без ID"} опубликован с неожиданным текстом`);
  }
}

export async function publishThreadsPostIdempotent({
  client,
  ledgerFile,
  key,
  text,
  imageUrl = null,
  imageUrls = null,
  inputIdentity,
}) {
  const normalizedText = normalizeText(text);
  if (!normalizedText) throw new TypeError("Текст Threads не должен быть пустым");
  const normalizedImageUrls = normalizeImageUrls({ imageUrl, imageUrls });
  const kind = normalizedImageUrls.length > 1
    ? "threads-carousel"
    : normalizedImageUrls.length === 1 ? "threads-image" : "threads-text";
  const normalizedIdentity = inputIdentity ?? (
    normalizedImageUrls.length === 0
      ? null
      : normalizedImageUrls.length === 1 ? normalizedImageUrls[0] : normalizedImageUrls
  );
  const inputFingerprint = fingerprint({ kind, text: normalizedText, inputIdentity: normalizedIdentity });
  const ledger = new PublicationLedger(ledgerFile);

  return ledger.withLock(async () => {
    let record = await ledger.get(key);
    if (record?.inputFingerprint !== undefined && record.inputFingerprint !== inputFingerprint) {
      throw new Error(`Ключ ${key} уже использован для другого Threads-поста`);
    }
    if (record?.completed) return { ...record.result, duplicatePrevented: true };

    if (record?.publishUncertain) {
      const existing = await findExistingByText(client, normalizedText);
      if (existing?.id) {
        record.completed = true;
        record.result = {
          id: String(existing.id),
          containerId: record.containerId || null,
          permalink: existing.permalink || null,
          mediaType: existing.media_type || null,
          timestamp: existing.timestamp || null,
          recoveredFromProfile: true,
          recoveredAfterUncertainPublish: true,
        };
        await ledger.put(key, record);
        return record.result;
      }
      throw new Error(`Публикация ${key} ранее получила неопределённый ответ; автоматический повтор заблокирован`);
    }

    record ??= {
      kind,
      inputFingerprint,
      text: normalizedText,
      inputIdentity: normalizedIdentity,
      mediaCount: normalizedImageUrls.length,
      createdAt: new Date().toISOString(),
    };

    // threads_publish уже мог вернуть ID, а проверочный GET — оборваться.
    // Сохранённый publishedId исключает второй publish POST при следующем запуске.
    if (record.publishedId) {
      const verified = await client.getThread(record.publishedId);
      assertExpectedText(verified, normalizedText);
      record.completed = true;
      record.result = resultFromThread({
        publishedId: record.publishedId,
        containerId: record.containerId,
        verified,
        extra: { recoveredAfterVerificationFailure: true },
      });
      await ledger.put(key, record);
      return record.result;
    }

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
      if (kind === "threads-carousel") {
        record.childContainerIds ??= [];
        if (record.childContainerIds.length > normalizedImageUrls.length) {
          throw new Error(`Журнал ${key} содержит лишние элементы Threads-карусели`);
        }
        for (let index = record.childContainerIds.length; index < normalizedImageUrls.length; index += 1) {
          const childId = await client.createImageCarouselItemContainer({
            imageUrl: normalizedImageUrls[index],
          });
          record.childContainerIds.push(String(childId));
          // Фиксируем каждый child отдельно: после сбоя уже созданные элементы
          // повторно не создаются, а порядок карусели остаётся стабильным.
          await ledger.put(key, record);
        }
        for (const childId of record.childContainerIds) {
          await client.waitForContainer(childId);
        }
        record.containerId = await client.createCarouselContainer({
          childIds: record.childContainerIds,
          text: normalizedText,
        });
      } else {
        record.containerId = kind === "threads-image"
          ? await client.createImageContainer({ imageUrl: normalizedImageUrls[0], text: normalizedText })
          : await client.createTextContainer(normalizedText);
      }
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
      record.publishedId = String(published.id);
      await ledger.put(key, record);
      const verified = await client.getThread(record.publishedId);
      assertExpectedText(verified, normalizedText);
      record.completed = true;
      record.result = resultFromThread({
        publishedId: record.publishedId,
        containerId: record.containerId,
        verified,
      });
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
