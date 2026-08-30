import { PublicationLedger, fingerprint } from "./ledger.mjs";
import { InstagramApiError, PublishUncertainError } from "./instagram-client.mjs";

function normalizeStatus(status) {
  return String(status?.status_code || "").toUpperCase();
}

async function ensureReady(client, containerId) {
  const status = await client.getContainerStatus(containerId);
  if (normalizeStatus(status) === "PUBLISHED") return status;
  if (normalizeStatus(status) === "FINISHED") return status;
  return client.waitForContainer(containerId);
}

function isMissingContainerError(error) {
  return error?.name === "InstagramApiError"
    && /media with [\d,\s]+ cannot be found/i.test(String(error.message));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureStoryReady(client, containerId) {
  const attempts = 6;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await ensureReady(client, containerId);
    } catch (error) {
      if (!isMissingContainerError(error) || attempt === attempts) throw error;
      await sleep(2_000);
    }
  }
  throw new Error(`Контейнер ${containerId} не удалось проверить`);
}

function assertBeforePublishDeadline(publishDeadline) {
  if (!publishDeadline) return;
  const deadline = publishDeadline instanceof Date
    ? publishDeadline.getTime()
    : new Date(publishDeadline).getTime();
  if (!Number.isFinite(deadline)) throw new TypeError("Некорректный крайний срок Story");
  // Оставляем небольшой запас, чтобы сам HTTPS POST не пересёк границу окна
  // между локальной проверкой времени и приёмом запроса Meta.
  if (Date.now() + 5_000 >= deadline) {
    throw new Error("Безопасное 15-минутное окно Story уже закрыто; публикация запрещена");
  }
}

export class PublicationNeedsReconciliationError extends Error {
  constructor(containerId) {
    super(
      `Story-контейнер ${containerId} опубликован, но фактический Meta publication ID не получен. Автоматический повтор запрещён; нужна read-only сверка.`,
    );
    this.name = "PublicationNeedsReconciliationError";
    this.containerId = String(containerId);
  }
}

async function reconcileReservedStory({ client, ledger, key, record }) {
  try {
    const status = await ensureReady(client, record.containerId);
    if (normalizeStatus(status) === "PUBLISHED") {
      record.completed = true;
      record.publicationUncertain = true;
      record.result = {
        id: null,
        containerId: record.containerId,
        recovered: true,
        needsReconciliation: true,
      };
      await ledger.put(key, record);
      throw new PublicationNeedsReconciliationError(record.containerId);
    }
    record.publicationUncertain = true;
    await ledger.put(key, record);
    throw new PublishUncertainError(
      record.containerId,
      new Error(`Контейнер остался в статусе ${normalizeStatus(status) || "UNKNOWN"}`),
    );
  } catch (error) {
    if (
      error instanceof PublishUncertainError
      || error instanceof PublicationNeedsReconciliationError
    ) throw error;
    record.publicationUncertain = true;
    await ledger.put(key, record);
    throw new PublishUncertainError(record.containerId, error);
  }
}

export async function prepareStoryIdempotent({
  client,
  ledgerFile,
  key,
  imageUrl,
  inputIdentity = imageUrl,
  publishDeadline,
}) {
  const ledger = new PublicationLedger(ledgerFile);
  const inputFingerprint = fingerprint({ kind: "story", inputIdentity });
  return ledger.withLock(async () => {
    let record = await ledger.get(key);
    if (record?.inputFingerprint !== undefined && record.inputFingerprint !== inputFingerprint) {
      throw new Error(`Ключ ${key} уже использован для другого Story`);
    }
    if (record?.completed) {
      if (!record.result?.id) throw new PublicationNeedsReconciliationError(record.containerId);
      return { ...record.result, duplicatePrevented: true, needsPublish: false };
    }

    // Любая ранее сохранённая бронь означает, что POST мог состояться. Новый
    // run имеет право только читать статус контейнера, но не публиковать снова.
    if (record?.publishAttemptedAt) {
      return reconcileReservedStory({ client, ledger, key, record });
    }

    assertBeforePublishDeadline(publishDeadline);
    record ??= { kind: "story", inputFingerprint, createdAt: new Date().toISOString() };
    record.imageUrl ??= imageUrl;

    if (!record.containerId) {
      record.imageUrl = imageUrl;
      record.containerId = await client.createStoryContainer(record.imageUrl);
      await ledger.put(key, record);
    }
    // Новый Meta-контейнер может несколько секунд не читаться через status GET.
    // Повторяем только безопасный GET; media_publish здесь ещё не вызывался.
    const status = await ensureStoryReady(client, record.containerId);

    if (normalizeStatus(status) === "PUBLISHED") {
      record.completed = true;
      record.publicationUncertain = true;
      record.result = {
        id: null,
        containerId: record.containerId,
        recovered: true,
        needsReconciliation: true,
      };
      await ledger.put(key, record);
      throw new PublicationNeedsReconciliationError(record.containerId);
    }

    record.preparedAt = new Date().toISOString();
    record.preparedStatus = normalizeStatus(status);
    await ledger.put(key, record);
    return {
      containerId: record.containerId,
      prepared: true,
      needsPublish: true,
    };
  });
}

export async function reserveStoryPublication({
  ledgerFile,
  key,
  reservationId,
  publishDeadline,
}) {
  if (!reservationId || typeof reservationId !== "string") {
    throw new TypeError("Не задан ID durable-брони Story");
  }
  const ledger = new PublicationLedger(ledgerFile);
  return ledger.withLock(async () => {
    const record = await ledger.get(key);
    if (!record?.containerId || !record.preparedAt) {
      throw new Error(`Story ${key} не подготовлена к durable-брони`);
    }
    if (record.completed) {
      if (!record.result?.id) throw new PublicationNeedsReconciliationError(record.containerId);
      return { ...record.result, duplicatePrevented: true, reserved: false };
    }
    if (record.publishAttemptedAt) {
      if (record.publishReservationId === reservationId) {
        return { containerId: record.containerId, reserved: true, duplicateReservation: true };
      }
      throw new PublishUncertainError(
        record.containerId,
        new Error(`Story уже забронирована run ${record.publishReservationId || "unknown"}`),
      );
    }

    assertBeforePublishDeadline(publishDeadline);
    record.publishAttemptedAt = new Date().toISOString();
    record.publishReservationId = reservationId;
    // После удалённого сохранения этой записи любой другой run обязан считать
    // результат POST неопределённым и не имеет права повторять публикацию.
    record.publicationUncertain = true;
    await ledger.put(key, record);
    return { containerId: record.containerId, reserved: true, reservationId };
  });
}

export async function publishReservedStory({
  client,
  ledgerFile,
  key,
  reservationId,
  publishDeadline,
}) {
  if (!reservationId || typeof reservationId !== "string") {
    throw new TypeError("Не задан ID durable-брони Story");
  }
  const ledger = new PublicationLedger(ledgerFile);
  return ledger.withLock(async () => {
    const record = await ledger.get(key);
    if (!record?.containerId || !record.publishAttemptedAt) {
      throw new Error(`Для Story ${key} нет durable-брони перед media_publish`);
    }
    if (record.completed) {
      if (!record.result?.id) throw new PublicationNeedsReconciliationError(record.containerId);
      return { ...record.result, duplicatePrevented: true };
    }
    if (record.publishReservationId !== reservationId) {
      throw new PublishUncertainError(
        record.containerId,
        new Error(`Бронь принадлежит run ${record.publishReservationId || "unknown"}`),
      );
    }

    // Между этой проверкой и POST нет ни одного await/checkpoint.
    assertBeforePublishDeadline(publishDeadline);

    let published;
    try {
      published = await client.publishContainer(record.containerId);
    } catch (error) {
      const rejectedAt = new Date().toISOString();
      record.lastPublishError = {
        name: error.name,
        message: error.message,
        status: error.status,
        code: error.code,
        at: rejectedAt,
      };
      const definitiveRejection = error instanceof InstagramApiError
        && !(error instanceof PublishUncertainError)
        && Number.isInteger(error.status)
        && error.status >= 400
        && error.status < 500;
      if (definitiveRejection) {
        // Meta однозначно отклонила запрос: публикации не было, поэтому новую
        // durable-бронь можно безопасно выдать следующему run в пределах SLA.
        delete record.publishAttemptedAt;
        delete record.publishReservationId;
        record.publicationUncertain = false;
        record.publishRejectedAt = rejectedAt;
      } else {
        // Сетевой/5xx/неопределённый ответ мог потеряться после публикации.
        // Бронь сохраняется навсегда, чтобы исключить повторный POST и дубль.
        record.publicationUncertain = true;
      }
      await ledger.put(key, record);
      throw error;
    }
    record.completed = true;
    record.publicationUncertain = !published.id;
    record.result = {
      ...published,
      containerId: record.containerId,
      ...(!published.id ? { needsReconciliation: true } : {}),
    };
    await ledger.put(key, record);
    if (!published.id) throw new PublicationNeedsReconciliationError(record.containerId);
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
