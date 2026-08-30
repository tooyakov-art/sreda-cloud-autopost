const DEFAULT_THREADS_BASE_URL = "https://graph.threads.net/v1.0";

export class ThreadsApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ThreadsApiError";
    this.status = details.status;
    this.code = details.code;
    this.subcode = details.subcode;
    this.type = details.type;
    this.isTransient = details.isTransient ?? false;
    this.requestId = details.requestId;
  }
}

export class ThreadsPublishUncertainError extends ThreadsApiError {
  constructor(containerId, cause) {
    super(
      `Не удалось однозначно подтвердить публикацию Threads-контейнера ${containerId}. Повторный POST заблокирован, чтобы не создать дубль.`,
      { isTransient: true },
    );
    this.name = "ThreadsPublishUncertainError";
    this.containerId = String(containerId);
    this.cause = cause;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeThreadsError(payload, status) {
  const error = payload?.error ?? {};
  return new ThreadsApiError(
    error.error_user_msg || error.message || `Threads API вернул HTTP ${status}`,
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

function assertText(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError("Текст Threads не должен быть пустым");
  }
  return value.trim();
}

function assertHttpsUrl(value, label = "URL") {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new TypeError(`${label} должен быть корректным URL`);
  }
  if (parsed.protocol !== "https:") throw new TypeError(`${label} должен использовать HTTPS`);
  return parsed.toString();
}

function assertUserId(value) {
  if (!/^\d+$/.test(String(value))) {
    throw new TypeError("Threads user ID должен состоять из цифр");
  }
  return String(value);
}

export class ThreadsClient {
  constructor({
    accessToken,
    baseUrl = DEFAULT_THREADS_BASE_URL,
    fetchImpl = globalThis.fetch,
    requestTimeoutMs = 30_000,
    pollIntervalMs = 3_000,
    pollTimeoutMs = 180_000,
  }) {
    if (!accessToken || typeof accessToken !== "string") {
      throw new TypeError("Не задан Threads access token");
    }
    if (typeof fetchImpl !== "function") {
      throw new TypeError("fetchImpl должен быть функцией");
    }
    this.accessToken = accessToken.trim();
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.pollIntervalMs = pollIntervalMs;
    this.pollTimeoutMs = pollTimeoutMs;
    this.profile = null;
  }

  async request(resource, { method = "GET", body, retry = true } = {}) {
    const url = `${this.baseUrl}/${String(resource).replace(/^\//, "")}`;
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

        const apiError = safeThreadsError(payload, response.status);
        const retryable = response.status === 429 || response.status >= 500 || apiError.isTransient;
        if (!retryable || attempt === attempts) throw apiError;

        const retryAfter = Number(response.headers?.get?.("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1_000
          : Math.min(8_000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
        await sleep(delay);
      } catch (error) {
        if (error instanceof ThreadsApiError) {
          lastError = error;
          const retryable = error.status === 429 || error.status >= 500 || error.isTransient;
          if (!retryable || attempt === attempts) throw error;
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

  async verifyProfile({ expectedUsername } = {}) {
    const profile = await this.request("me?fields=id,username", { retry: true });
    const id = assertUserId(profile.id);
    const username = String(profile.username || "").trim();
    if (!username) throw new ThreadsApiError("Threads API не вернул username");
    if (expectedUsername && username.toLowerCase() !== String(expectedUsername).replace(/^@/, "").toLowerCase()) {
      throw new ThreadsApiError(`Маркер принадлежит @${username}, ожидался @${String(expectedUsername).replace(/^@/, "")}`);
    }
    this.profile = { id, username };
    return this.profile;
  }

  async userId() {
    return (this.profile ?? await this.verifyProfile()).id;
  }

  async createTextContainer(text) {
    const id = await this.userId();
    const result = await this.request(`${id}/threads`, {
      method: "POST",
      body: { media_type: "TEXT", text: assertText(text) },
      retry: true,
    });
    if (!result.id) throw new ThreadsApiError("Threads не вернул ID текстового контейнера");
    return String(result.id);
  }

  async createImageContainer({ imageUrl, text }) {
    const id = await this.userId();
    const result = await this.request(`${id}/threads`, {
      method: "POST",
      body: {
        media_type: "IMAGE",
        image_url: assertHttpsUrl(imageUrl, "Threads image_url"),
        text: assertText(text),
      },
      retry: true,
    });
    if (!result.id) throw new ThreadsApiError("Threads не вернул ID контейнера изображения");
    return String(result.id);
  }

  async listRecentThreads({ limit = 25 } = {}) {
    const numericLimit = Number(limit);
    if (!Number.isInteger(numericLimit) || numericLimit < 1 || numericLimit > 100) {
      throw new TypeError("Threads limit должен быть целым числом от 1 до 100");
    }
    const id = await this.userId();
    const fields = "id,text,timestamp,media_type,permalink";
    const result = await this.request(
      `${id}/threads?fields=${encodeURIComponent(fields)}&limit=${numericLimit}`,
      { retry: true },
    );
    return Array.isArray(result.data) ? result.data : [];
  }

  async getThread(threadId) {
    const id = assertUserId(threadId);
    return this.request(`${id}?fields=id,text,timestamp,media_type,permalink`, { retry: true });
  }

  async getContainerStatus(containerId) {
    const id = assertUserId(containerId);
    return this.request(`${id}?fields=id,status,error_message`, { retry: true });
  }

  async waitForContainer(containerId, {
    timeoutMs = this.pollTimeoutMs,
    intervalMs = this.pollIntervalMs,
  } = {}) {
    const id = assertUserId(containerId);
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      last = await this.getContainerStatus(id);
      const status = String(last.status || "").toUpperCase();
      if (status === "FINISHED" || status === "PUBLISHED") return last;
      if (status === "ERROR" || status === "EXPIRED") {
        throw new ThreadsApiError(
          `Threads-контейнер ${id}: ${status}${last.error_message ? ` — ${last.error_message}` : ""}`,
        );
      }
      await sleep(intervalMs);
    }
    throw new ThreadsApiError(
      `Threads-контейнер ${id} не стал готов за ${Math.round(timeoutMs / 1_000)} сек. Последний статус: ${last?.status || "неизвестен"}`,
      { isTransient: true },
    );
  }

  async publishContainer(containerId) {
    const id = await this.userId();
    try {
      const result = await this.request(`${id}/threads_publish`, {
        method: "POST",
        body: { creation_id: assertUserId(containerId) },
        retry: false,
      });
      if (!result.id) throw new ThreadsApiError("Threads не вернул ID публикации");
      return { id: String(result.id) };
    } catch (error) {
      if (error instanceof ThreadsApiError && error.status && error.status < 500) throw error;
      throw new ThreadsPublishUncertainError(String(containerId), error);
    }
  }

  async autoPublishText(text) {
    const id = await this.userId();
    const result = await this.request(`${id}/threads`, {
      method: "POST",
      body: {
        media_type: "TEXT",
        text: assertText(text),
        auto_publish_text: "true",
      },
      retry: false,
    });
    if (!result.id) throw new ThreadsApiError("Threads не вернул ID публикации");
    return { id: String(result.id) };
  }
}

export { DEFAULT_THREADS_BASE_URL };
