import { readFile } from "node:fs/promises";
import path from "node:path";

const REQUIRED_ROUTE_KEYS = ["question", "story_mention_ordinary", "story_mention_beautiful"];
const ALLOWED_PLACEHOLDERS = new Set([
  "conversation_id",
  "first_name",
  "message_id",
  "message_text",
  "sender_handle",
  "sender_id",
  "sender_name",
  "sender_username",
]);
const BEAUTY_CLAIM = /(?:красив|прекрас|шикар|beautiful|gorgeous|stunning|әдемі|керемет)/iu;
const QUESTION_INTENT = /(?:брон|заброниров|столик|адрес|где\s+вы|как\s+вас\s+найти|локаци|меню|цена|стоимост|сколько\s+стоит|часы\s+работы|график|режим\s+работы|до\s+скольки|во\s+сколько|работаете|работает\s+ли|открыты|закрыты|ваканси|ищете\s+(?:сотрудник|барист)|хочу\s+работать|резюме|доставк|сотрудничеств|коллаборац|телефон|номер|контакт|связаться|брондау|үстел|мекенжай|қайдасыздар|қай\s+жерде|мәзір|баға|құны|қанша\s+тұрады|жұмыс\s+уақыты|кесте|сағат\s+нешеге\s+дейін|вакансия|жұмысқа\s+орналас|бос\s+орын|жеткізу|ынтымақтастық|әріптестік|коллаб|нөмір|байланыс)/iu;
const QUESTION_SIGNAL = /(?:\?|^(?:а\s+)?(?:кто|что|где|куда|откуда|когда|почему|зачем|как|какой|какая|какие|сколько|можно(?:\s+ли)?|есть\s+ли|подскажите|скажите|кім|не|қайда|қашан|неге|қалай|қанша|қайсы|бола\s+ма|бар\s+ма|айтыңызшы)(?=\s|$))/iu;

function textOf(message) {
  return String(message?.message ?? message?.text ?? "").trim();
}

function senderOf(message) {
  return message?.from ?? message?.sender ?? {};
}

function attachmentList(message) {
  const value = message?.attachments ?? message?.message?.attachments;
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

export function isQuestion(message) {
  const text = textOf(message);
  if (!text) return false;
  return QUESTION_INTENT.test(text);
}

export function isAmbiguousQuestion(message) {
  const text = textOf(message);
  return Boolean(text) && !isQuestion(message) && QUESTION_SIGNAL.test(text);
}

export function isStoryMention(message) {
  if (message?.story_mention || message?.storyMention || message?.reply_to?.story) return true;
  if (attachmentList(message).some((item) => String(item?.type ?? "").toLowerCase() === "story_mention")) return true;
  const text = textOf(message);
  return /(?:mentioned\s+you\s+in\s+(?:a|their)\s+story|(?:упомянул|упомянула|отметил|отметила)\s+вас\s+в\s+(?:истории|сторис)|сізді\s+(?:сторис|оқиғада)\s+(?:атап|белгілеп))/iu.test(text);
}

export function classifyDirectMessage(message, { vision } = {}) {
  // Вопрос важнее источника сообщения: вопрос в ответе на Story нельзя
  // потерять за общей благодарностью за отметку.
  if (isQuestion(message)) return "question";
  if (isAmbiguousQuestion(message)) return "manual_review";
  if (isStoryMention(message)) {
    const verifiedBeautiful = vision?.verified === true
      && [true, "beautiful"].includes(vision?.beautiful ?? vision?.verdict);
    return verifiedBeautiful ? "story_mention_beautiful" : "story_mention_ordinary";
  }
  return "unhandled";
}

export function validateDirectConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("Direct config должен быть JSON-объектом");
  }
  if (!config.templates || typeof config.templates !== "object" || Array.isArray(config.templates)) {
    throw new TypeError("В Direct config нужен объект templates");
  }
  if (!config.routes || typeof config.routes !== "object" || Array.isArray(config.routes)) {
    throw new TypeError("В Direct config нужен объект routes");
  }
  for (const route of REQUIRED_ROUTE_KEYS) {
    const templateKey = config.routes[route];
    if (typeof templateKey !== "string" || !templateKey.trim()) {
      throw new TypeError(`В Direct config нужен маршрут routes.${route}`);
    }
    if (typeof config.templates[templateKey] !== "string" || !config.templates[templateKey].trim()) {
      throw new TypeError(`Маршрут routes.${route} ссылается на отсутствующий шаблон ${templateKey}`);
    }
  }
  if (BEAUTY_CLAIM.test(config.templates[config.routes.story_mention_ordinary])) {
    throw new TypeError("Обычный ответ на отметку не должен оценивать красоту без vision-проверки");
  }
  for (const [key, template] of Object.entries(config.templates)) {
    if (typeof template !== "string") throw new TypeError(`templates.${key} должен быть строкой`);
    for (const match of template.matchAll(/{{\s*([a-z_]+)\s*}}/g)) {
      if (!ALLOWED_PLACEHOLDERS.has(match[1])) {
        throw new TypeError(`Неизвестный placeholder {{${match[1]}}} в templates.${key}`);
      }
    }
  }
  return config;
}

export async function loadDirectConfig(file) {
  if (!file) throw new Error("Не задан путь к Direct config");
  const parsed = JSON.parse(await readFile(path.resolve(file), "utf8"));
  return validateDirectConfig(parsed);
}

export function renderExactTemplate(template, context) {
  if (typeof template !== "string") throw new TypeError("Шаблон ответа должен быть строкой");
  return template.replace(/{{\s*([a-z_]+)\s*}}/g, (_, key) => {
    if (!ALLOWED_PLACEHOLDERS.has(key)) throw new TypeError(`Неизвестный placeholder {{${key}}}`);
    return String(context[key] ?? "");
  });
}

export function routeDirectMessage({ message, conversationId, config, vision }) {
  validateDirectConfig(config);
  const route = classifyDirectMessage(message, { vision });
  const sender = senderOf(message);
  const username = String(sender.username ?? "").replace(/^@/, "");
  const senderName = String(sender.name ?? username);
  const context = {
    conversation_id: String(conversationId ?? ""),
    first_name: senderName.trim().split(/\s+/)[0] || username,
    message_id: String(message?.id ?? message?.mid ?? ""),
    message_text: textOf(message),
    sender_handle: username ? `@${username}` : "",
    sender_id: String(sender.id ?? ""),
    sender_name: senderName,
    sender_username: username,
  };
  if (["manual_review", "unhandled"].includes(route)) {
    return { route, templateKey: null, reply: null, context };
  }
  const templateKey = config.routes[route];
  return {
    route,
    templateKey,
    reply: renderExactTemplate(config.templates[templateKey], context),
    context,
  };
}

export { ALLOWED_PLACEHOLDERS, BEAUTY_CLAIM, QUESTION_INTENT, QUESTION_SIGNAL, REQUIRED_ROUTE_KEYS };
