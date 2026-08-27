import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { CAROUSEL_CAPTIONS } from "./carousel-captions.mjs";

export const TIME_ZONE = "Asia/Qyzylorda";
export const STORY_TIMES = ["08:00", "11:30", "14:30", "18:30", "21:00"];

export function threadsAutopublishEnabled(env = process.env) {
  return env.SREDA_THREADS_AUTOPUBLISH_ENABLED === "true";
}

const THREADS_POSTS = [
  ["TH-05", "2026-08-28 15:30", "RU", "Иногда лучший план на день выглядит так: зайти на кофе без повода, сесть у окна и уже потом решать всё остальное. У вас тоже так бывает?"],
  ["TH-06", "2026-08-29 15:30", "KZ", "Матча Клубника с пенкой деген атаудың өзі көңіл күй сыйлайды 🍓 Бір рет байқап көрдіңіз бе, әлде әлі тізімде тұр ма?"],
  ["TH-07", "2026-08-30 15:30", "RU", "Про зерно хочется говорить без сложных слов. С чего начать: как его выбирают, что такое вкусовые ноты или почему один кофе раскрывается по-разному?"],
  ["TH-08", "2026-08-23 10:30", "RU", "Воскресенье создано для завтрака без будильника. Вафли, кофе и разговор, который никто не торопит. Во сколько для вас начинается идеальный выходной?"],
  ["TH-09", "2026-08-23 15:30", "KZ", "Дрип-пакетпен кофе дайындау оңай: кесе, ыстық су және бірнеше минут. Үйге алар ма едіңіз, әлде сапарға ма?"],
  ["TH-10", "2026-08-23 19:30", "KZ", "Демалыс күні SREDA-да асықпай отыруға болады. Бір тағам, тағы бір кофе, сосын десерт. Сіз демалысты неден бастайсыз?"],
  ["TH-11", "2026-08-24 10:30", "RU", "Specialty coffee не должен быть экзаменом. Можно не знать терминов и просто сказать бариста, какой вкус нравится. Вы обычно выбираете сами или просите совет?"],
  ["TH-12", "2026-08-24 15:30", "KZ", "Кофені «ащы» немесе «қышқыл» деп екі сөзбен сипаттап жүрдік. Сөйтсек, бір дәннің артында тұтас тарих бар. Жақында SREDA үшін арнайы дайындалған Local Coffee дәнін көрсетеміз."],
  ["TH-13", "2026-08-24 19:30", "KZ", "Кофеханадағы ең қызық әңгімелер мәзірден басталмайды. Кейде оны сізге күнде кофе әкелетін адамның өзі айтып береді. SREDA командасымен танысуды бастаймыз."],
  ["TH-14", "2026-08-25 10:30", "RU", "Самый честный спор за обедом: салат с телятиной или казарече с креветками и страчателлой. Обычно побеждает тот, который первым принесли соседнему столу."],
  ["TH-15", "2026-08-25 15:30", "RU", "Самая короткая ложь в кофейне: «Я только одну ложку тирамису». Снимаем его приготовление — без склеек, которые прячут самое вкусное."],
  ["TH-16", "2026-08-25 19:30", "KZ", "Кофе дәні туралы сөйлегенде бәрі бірден күрделеніп кетеді. Аселя оны терминсіз түсіндіреді: бұл дән неге дәл SREDA үшін таңдалды және сүтпен қалай ашылады."],
  ["TH-17", "2026-08-26 10:30", "RU", "Опасное место в SREDA — стол, за которым планировал провести двадцать минут. Потом появляется второй кофе, разговор продолжается, и вот уже прошёл час."],
  ["TH-18", "2026-08-26 15:30", "KZ", "Баристаға «әдеттегідей» деудің орнына бүгінгі көңіл күйіңізді айтып көріңіз. Кейде ең жақсы кофе мәзірден емес, қысқа әңгімеден табылады."],
  ["TH-19", "2026-08-26 19:30", "KZ", "Дрип-пакет — үйде кофе дайындаудың ең жалқау емес, ең ақылды жолы. Кесе, ыстық су, бірнеше минут. Болды. Жақында дәмдері мен бағасын актуалдыға жинаймыз."],
  ["TH-20", "2026-08-27 10:30", "RU", "Самый взрослый план на вечер — зайти за кофе и уйти без десерта. После 21:00 он становится ещё сложнее: на выпечку и десерты действует скидка 20%."],
  ["TH-21", "2026-08-27 15:30", "RU", "У команды SREDA есть заказы, которые они выбирают даже после целой смены рядом с меню. Скоро покажем фавориты Лауры и Айгерим — вот кому можно доверять этот выбор."],
  ["TH-22", "2026-08-27 19:30", "KZ", "21:00-ден кейін витринаға қарамауға тырысып көріңіз. Қиын болады: пісірмелер мен десерттерге 20% жеңілдік басталады."],
  ["TH-23", "2026-08-28 10:30", "RU", "В Астане можно выйти за холодным кофе и через десять минут мечтать о горячем. Поэтому мы давно выбираем напиток не по календарю, а по тому, что происходит за окном."],
  ["TH-24", "2026-08-28 19:30", "KZ", "SREDA-да әркімнің өз үстелі пайда болады. Біреу терезе жанын күтеді, біреу барға жақын отырады. Бос болса да, басқа орынға отырғың келмейді."],
  ["TH-25", "2026-08-29 10:30", "RU", "Есть блюда, после которых не хочется делиться даже ради красивого жеста. Стейк из сёмги с соусом голландез и медальоны с молодым картофелем — как раз из этой категории."],
  ["TH-26", "2026-08-29 19:30", "KZ", "Таңғы ас таңдаудың ең қиын жері — мәзірді ашу. Омлетті көресіз, бенедиктті оқисыз, соңында вафли де керек болып шығады."],
  ["TH-27", "2026-08-30 10:30", "RU", "У хорошей позиции есть простой показатель: вы ещё не ушли, а уже думаете, когда заказать её снова. В августе у вас такая появилась?"],
  ["TH-28", "2026-08-30 19:30", "KZ", "Қонақтардан бұрын мәзірдегі фавориттерді команда табады. Біреу Matcha Banana Bread таңдайды, біреу вишня дәмін. Келесіде олардың тапсырысын қайталап көруге болады."],
  ["TH-29", "2026-08-31 10:30", "RU", "Август у SREDA получился громким: открытие, новые гости и много первых заказов. В сентябре хочется показать больше кухни, кофе и людей, которые всё это делают."],
  ["TH-30", "2026-08-31 19:30", "KZ", "Тамыз бойы бізге келіп, пікір айтып, достарыңызды ертіп келгендеріңізге рақмет 🤍 Қыркүйекте SREDA-дан нені көбірек күтесіз?"],
];

export const THREADS_SLOTS = new Map(THREADS_POSTS.map(([id, slot, language, text]) => [
  slot,
  { id, slug: id.toLowerCase(), language, text },
]));

export const CAROUSEL_SLOTS = new Map([
  ["2026-08-24 11:00", {
    folder: "2026-08-22-breakfast",
    automationLabel: "24.08.2026 11:00",
    slug: "breakfast",
    caption: CAROUSEL_CAPTIONS.breakfast,
  }],
  ["2026-08-26 18:00", {
    folder: "2026-08-24-signature-coffee-1080x1350",
    automationLabel: "26.08.2026 18:00",
    slug: "signature-coffee",
    caption: CAROUSEL_CAPTIONS.signatureCoffee,
  }],
  ["2026-08-28 18:00", {
    folder: "2026-08-26-matcha",
    automationLabel: "28.08.2026 18:00",
    slug: "matcha",
    caption: CAROUSEL_CAPTIONS.matcha,
  }],
  ["2026-08-31 18:00", {
    folder: "2026-08-28-dinner",
    automationLabel: "31.08.2026 18:00",
    slug: "dinner",
    caption: CAROUSEL_CAPTIONS.dinner,
  }],
]);

const NEXT_AUTOMATION_LABEL = new Map([
  ["24.08.2026 11:00", "26.08.2026 18:00"],
  ["26.08.2026 18:00", "28.08.2026 18:00"],
  ["28.08.2026 18:00", "31.08.2026 18:00"],
]);

function partsForDate(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(({ type }) => type !== "literal").map(({ type, value }) => [type, value]));
}

export function parseAt(value) {
  if (!value) return new Date();
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)
    ? `${value}${value.length === 16 ? ":00" : ""}+05:00`
    : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new Error(`Некорректное --at: ${value}`);
  return date;
}

export function localSlot(date) {
  const parts = partsForDate(date);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    second: parts.second,
    key: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`,
    timeZone: TIME_ZONE,
  };
}

export function resolveScheduledAction(date) {
  const local = localSlot(date);
  const carousel = CAROUSEL_SLOTS.get(local.key);
  if (carousel) return { kind: "carousel", local, ...carousel };

  const threads = THREADS_SLOTS.get(local.key);
  if (threads) return { kind: "threads-text", local, ...threads };

  const day = Number(local.date.slice(-2));
  const isAugustWindow = local.date.startsWith("2026-08-") && day >= 23 && day <= 31;
  const storyIndex = STORY_TIMES.indexOf(local.time);
  if (isAugustWindow && storyIndex >= 0) {
    return { kind: "story", local, storyIndex };
  }
  return null;
}

async function filesInFolder(folder, extensions) {
  const entries = await readdir(folder, { withFileTypes: true });
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  return entries
    .filter((entry) => entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(folder, entry.name))
    .sort((a, b) => collator.compare(path.basename(a), path.basename(b)));
}

export async function storyFileForAction(action, storiesRoot) {
  if (action.kind !== "story") throw new Error("Ожидался Story-слот");
  const folder = path.join(storiesRoot, action.local.date);
  const info = await stat(folder);
  if (!info.isDirectory()) throw new Error(`Нет папки Stories: ${folder}`);
  const files = await filesInFolder(folder, new Set([".png", ".jpg", ".jpeg"]));
  if (files.length !== 5) {
    throw new Error(`В ${folder} должно быть ровно 5 Stories, найдено ${files.length}`);
  }
  return files[action.storyIndex];
}

export async function carouselFilesForAction(action, carouselsRoot) {
  if (action.kind !== "carousel") throw new Error("Ожидался carousel-слот");
  const folder = path.join(carouselsRoot, action.folder);
  const info = await stat(folder);
  if (!info.isDirectory()) throw new Error(`Нет папки карусели: ${folder}`);
  const files = await filesInFolder(folder, new Set([".png", ".jpg", ".jpeg", ".mp4", ".mov"]));
  if (files.length < 2 || files.length > 10) {
    throw new Error(`В ${folder} должно быть 2–10 слайдов, найдено ${files.length}`);
  }
  return files;
}

export async function readAutomationPrompt(tomlFile) {
  const text = await readFile(tomlFile, "utf8");
  const match = text.match(/^prompt\s*=\s*("(?:\\.|[^"\\])*")\s*$/m);
  if (!match) throw new Error(`Не найден prompt в ${tomlFile}`);
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`Не удалось разобрать prompt в automation.toml: ${error.message}`);
  }
}

export function extractCarouselCaption(prompt, automationLabel) {
  const labelStart = prompt.indexOf(`${automationLabel} —`);
  if (labelStart < 0) throw new Error(`В automation.toml нет слота ${automationLabel}`);
  const marker = "с подписью:";
  const captionStartMarker = prompt.indexOf(marker, labelStart);
  if (captionStartMarker < 0) throw new Error(`У слота ${automationLabel} нет подписи`);
  const captionStart = captionStartMarker + marker.length;
  const nextLabel = NEXT_AUTOMATION_LABEL.get(automationLabel);
  const candidates = [
    nextLabel ? prompt.indexOf(`\n\n${nextLabel} —`, captionStart) : -1,
    prompt.indexOf("\n\n3) THREADS.", captionStart),
  ].filter((index) => index >= 0);
  const captionEnd = candidates.length ? Math.min(...candidates) : prompt.length;
  const caption = prompt.slice(captionStart, captionEnd).trim();
  if (!caption) throw new Error(`Пустая подпись для ${automationLabel}`);
  return caption;
}
