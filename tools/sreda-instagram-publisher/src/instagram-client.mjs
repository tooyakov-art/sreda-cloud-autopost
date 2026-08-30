const DEFAULT_BASE_URL = "https://graph.instagram.com/v23.0";

export class InstagramApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "InstagramApiError";
    this.status = details.status;
    this.code = details.code;
    this.subcode = details.subcode;
    this.type = details.type;
    this.isTransient = details.isTransient ?? false;
    this.requestId = details.requestId;
  }
}

export class PublishUncertainError extends InstagramApiError {
  constructor(containerId, cause) {
    super(
      `Не удалось однозначно подтвердить публикацию контейнера ${containerId}. Повторный POST автоматически не выполнялся, чтобы не создать дубль.`,
      { isTransient: true },
    );
    this.name = "PublishUncertainError";
    this.containerId = containerId;
    this.cause = cause;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assertHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError(`${label} должен быть корректным URL`);
  }
  if (url.protocol !== "https:") {
    throw new TypeError(`${label} должен использовать HTTPS`);
  }
  if (url.username || url.password) {
    throw new TypeError(`${label} не должен содержать логин или пароль`);
  }
  return url.toString();
}

function assertGraphObjectId(value, label = "Graph object ID") {
  const id = String(value ?? "");
  if (!id || !/^[A-Za-z0-9_:-]+$/.test(id)) {
    throw new TypeError(`${label} содержит недопустимые символы`);
  }
  return id;
}

function assertPageLimit(value, maximum = 100) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new TypeError(`limit должен быть целым числом от 1 до ${maximum}`);
  }
  return limit;
}

function safeMetaError(payload, status) {
  const error = payload?.error ?? {};
  return new InstagramApiError(
    error.error_user_msg || error.message || `Instagram API вернул HTTP ${status}`,
    {
      status,
      code: error.code,
      subcode: error.error_subcode,
      type: error.type,
      isTransient: Boolean(error.is_transient),
      requestId: error.fbtrace_id,
    },
  );
}

export class InstagramClient {
  constructor({
    accessToken,
    userId,
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    requestTimeoutMs = 30_000,
    pollIntervalMs = 3_000,
    pollTimeoutMs = 180_000,
  }) {
    if (!accessToken || typeof accessToken !== "string") {
      throw new TypeError("Не задан Instagram access token");
    }
    if (!userId || !/^\d+$/.test(String(userId))) {
      throw new TypeError("Instagram user ID должен состоять из цифр");
    }
    if (typeof fetchImpl !== "function") {
      throw new TypeError("fetchImpl должен быть функцией");
    }
    this.accessToken = accessToken.trim();
    this.userId = String(userId);
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.pollIntervalMs = pollIntervalMs;
    this.pollTimeoutMs = pollTimeoutMs;
  }

  async request(path, { method = "GET", body, retry = true } = {}) {
    const url = `${this.baseUrl}/${String(path).replace(/^\//, "")}`;
    const attempts = retry ? 4 : 1;
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
      try {
        const response = await this.fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          },
          body: body ? new URLSearchParams(body) : undefined,
          signal: controller.signal,
        });

        let payload;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (response.ok) return payload ?? {};

        const apiError = safeMetaError(payload, response.status);
        const retryable = response.status === 429 || response.status >= 500 || apiError.isTransient;
        if (!retryable || attempt === attempts) throw apiError;

        const retryAfter = Number(response.headers?.get?.("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1_000
          : Math.min(8_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
        await sleep(delay);
      } catch (error) {
        if (error instanceof InstagramApiError) {
          lastError = error;
          const retryable = error.status === 429 || error.status >= 500 || error.isTransient;
          if (!retryable) throw error;
          if (attempt === attempts) throw error;
        } else {
          lastError = error;
          if (attempt === attempts) throw error;
          await sleep(Math.min(8_000, 500 * 2 ** (attempt - 1)));
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }

  async listConversations({ limit = 25, after } = {}) {
    const params = new URLSearchParams({
      platform: "instagram",
      fields: "id,updated_time",
      limit: String(assertPageLimit(limit)),
    });
    if (after) params.set("after", String(after));
    return this.request(`${this.userId}/conversations?${params}`, { retry: true });
  }

  async verifyProfile({ expectedUsername } = {}) {
    const profile = await this.request("me?fields=id,user_id,username", { retry: true });
    assertGraphObjectId(profile.id, "Instagram app-scoped ID");
    const id = String(profile.user_id ?? "");
    if (!/^\d+$/.test(id)) {
      throw new InstagramApiError("Instagram API не вернул publishing user_id");
    }
    const username = String(profile.username || "").trim();
    if (!username) throw new InstagramApiError("Instagram API не вернул username");
    if (id !== this.userId) {
      throw new InstagramApiError(`Маркер принадлежит Instagram user_id ${id}, ожидался ${this.userId}`);
    }
    if (expectedUsername && username.toLowerCase() !== String(expectedUsername).replace(/^@/, "").toLowerCase()) {
      throw new InstagramApiError(`Маркер принадлежит @${username}, ожидался @${String(expectedUsername).replace(/^@/, "")}`);
    }
    return { id, username };
  }

  async listConversationMessages(conversationId, { limit = 20 } = {}) {
    const id = assertGraphObjectId(conversationId, "Conversation ID");
    const pageLimit = assertPageLimit(limit, 20);
    const fields = `messages.limit(${pageLimit}){id,created_time,is_unsupported}`;
    const result = await this.request(`${id}?${new URLSearchParams({ fields })}`, { retry: true });
    return result.messages ?? { data: [], paging: {} };
  }

  async getMessageDetails(messageId, { includeAttachments = true } = {}) {
    const id = assertGraphObjectId(messageId, "Message ID");
    const baseFields = "id,created_time,from,to,message";
    const extendedFields = `${baseFields},attachments,reply_to`;
    try {
      return await this.request(`${id}?${new URLSearchParams({ fields: includeAttachments ? extendedFields : baseFields })}`, { retry: true });
    } catch (error) {
      // Attachments are available for Instagram messaging payloads, but some
      // app/API combinations expose only the documented core message fields.
      if (!includeAttachments || !(error instanceof InstagramApiError) || error.code !== 100) throw error;
      return this.request(`${id}?${new URLSearchParams({ fields: baseFields })}`, { retry: true });
    }
  }

  async createStoryContainer(imageUrl) {
    const result = await this.request(`${this.userId}/media`, {
      method: "POST",
      body: {
        image_url: assertHttpsUrl(imageUrl, "image_url"),
        media_type: "STORIES",
      },
    });
    if (!result.id) throw new InstagramApiError("Instagram не вернул ID Story-контейнера");
    return String(result.id);
  }

  async createCarouselItem({ url, type = "IMAGE" }) {
    const normalizedType = String(type).toUpperCase();
    if (!["IMAGE", "VIDEO"].includes(normalizedType)) {
      throw new TypeError("Элемент карусели должен иметь тип IMAGE или VIDEO");
    }
    const body = normalizedType === "VIDEO"
      ? { video_url: assertHttpsUrl(url, "video_url"), media_type: "VIDEO", is_carousel_item: "true" }
      : { image_url: assertHttpsUrl(url, "image_url"), is_carousel_item: "true" };
    const result = await this.request(`${this.userId}/media`, { method: "POST", body });
    if (!result.id) throw new InstagramApiError("Instagram не вернул ID элемента карусели");
    return String(result.id);
  }

  async createCarouselContainer(childIds, caption = "") {
    if (!Array.isArray(childIds) || childIds.length < 2 || childIds.length > 10) {
      throw new TypeError("Instagram-карусель должна содержать от 2 до 10 элементов");
    }
    if (!childIds.every((id) => /^\d+$/.test(String(id)))) {
      throw new TypeError("Некорректный ID дочернего контейнера");
    }
    const body = {
      media_type: "CAROUSEL",
      children: childIds.join(","),
    };
    if (caption) body.caption = caption;
    const result = await this.request(`${this.userId}/media`, { method: "POST", body });
    if (!result.id) throw new InstagramApiError("Instagram не вернул ID карусели");
    return String(result.id);
  }

  async getContainerStatus(containerId) {
    if (!/^\d+$/.test(String(containerId))) throw new TypeError("Некорректный ID контейнера");
    return this.request(`${containerId}?fields=id,status_code,status`, { retry: true });
  }

  async waitForContainer(containerId, {
    timeoutMs = this.pollTimeoutMs,
    intervalMs = this.pollIntervalMs,
    acceptPublished = true,
  } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      last = await this.getContainerStatus(containerId);
      const status = String(last.status_code || "").toUpperCase();
      if (status === "FINISHED" || (acceptPublished && status === "PUBLISHED")) return last;
      if (status === "ERROR" || status === "EXPIRED") {
        throw new InstagramApiError(
          `Контейнер ${containerId}: ${status}${last.status ? ` — ${last.status}` : ""}`,
        );
      }
      await sleep(intervalMs);
    }
    throw new InstagramApiError(
      `Контейнер ${containerId} не стал готов за ${Math.round(timeoutMs / 1_000)} сек. Последний статус: ${last?.status_code || "неизвестен"}`,
      { isTransient: true },
    );
  }

  async publishContainer(containerId) {
    try {
      const result = await this.request(`${this.userId}/media_publish`, {
        method: "POST",
        body: { creation_id: String(containerId) },
        retry: false,
      });
      if (!result.id) throw new InstagramApiError("Instagram не вернул ID публикации");
      return { id: String(result.id), recovered: false };
    } catch (error) {
      // Полученный ответ 4xx однозначен: Meta запрос отклонила, поэтому
      // состояние не является неопределённым и исходную ошибку надо сохранить.
      if (error instanceof InstagramApiError && error.status && error.status < 500) {
        throw error;
      }
      // Повторять media_publish вслепую опасно: ответ мог потеряться уже после публикации.
      try {
        const status = await this.waitForContainer(containerId, {
          timeoutMs: Math.min(this.pollTimeoutMs, 60_000),
          acceptPublished: true,
        });
        if (String(status.status_code).toUpperCase() === "PUBLISHED") {
          return { id: null, recovered: true, containerId: String(containerId) };
        }
      } catch {
        // Исходная ошибка важнее вторичной ошибки проверки статуса.
      }
      throw new PublishUncertainError(String(containerId), error);
    }
  }
}

export { DEFAULT_BASE_URL, assertGraphObjectId, assertHttpsUrl, assertPageLimit };
