const PHONE = "+7 706 600 83 82";
const FOOTER_RU = `📍 Астана, ЖК Garden View, Бухар Жырау, 26/1\n📞 ${PHONE}`;
const FOOTER_KZ = `📍 Астана, Garden View ТК, Бұқар жырау даңғылы, 26/1\n📞 ${PHONE}`;

export const THREADS_LOCAL_TIME = "15:30";
export const THREADS_TIME_ZONE = "Asia/Qyzylorda";

function caption(language, body) {
  const footer = language === "KZ" ? FOOTER_KZ : FOOTER_RU;
  return `${String(body).trim()}\n\n${footer}`;
}

function post(day, language, format, topic, body, media) {
  const date = `2026-09-${String(day).padStart(2, "0")}`;
  const mediaFields = Array.isArray(media)
    ? { assets: Object.freeze([...media]) }
    : { asset: media };
  return Object.freeze({
    id: `TH-SEP-${String(day).padStart(2, "0")}`,
    date,
    time: THREADS_LOCAL_TIME,
    language,
    format,
    topic,
    text: caption(language, body),
    ...mediaFields,
  });
}

export const THREADS_LAUNCH_POST = Object.freeze({
  id: "TH-LAUNCH-01",
  date: "2026-08-30",
  time: "manual",
  language: "RU",
  format: "PHOTO",
  topic: "Бельгийские вафли",
  text: caption(
    "RU",
    "Иногда для хорошего дня достаточно бельгийских вафель, любимого кофе и разговора без спешки 🤍\n\nБудем рады видеть вас в SREDA.",
  ),
  asset: "photos/03-belgian-waffles.jpeg",
});

export const THREADS_TRIAL_POST = Object.freeze({
  id: "TH-TRIAL-01",
  date: "2026-08-31",
  time: "manual",
  language: "RU",
  format: "CAROUSEL",
  topic: "SREDA на весь день",
  text: caption(
    "RU",
    "SREDA на весь день: яйца Бенедикт для неспешного утра, стейк лосося к обеду и казаречче для тёплого вечера 🤍\n\nЛистайте карусель и заглядывайте в удобное время — будем рады видеть вас.",
  ),
  assets: Object.freeze([
    "design/trial-01-morning.png",
    "design/trial-01-lunch.png",
    "design/trial-01-evening.png",
  ]),
});

export const SEPTEMBER_THREADS_POSTS = Object.freeze([
  post(1, "RU", "CAROUSEL", "Кофе начинается раньше чашки",
    "До первой чашки у кофе уже есть история: зерно взвешивают, заваривают, пробуют и обсуждают. Показываем один живой эпизод SREDA без постановки 🤍",
    ["live/sep-01-coffee-before-cup-cover.png", "photographer/cupping/DSC08163_resized.jpg", "photographer/cupping/DSC08326_resized.jpg"]),
  post(2, "KZ", "AIR", "Жарық пен түс",
    "Кейде лентаға бір ғана ашық түс пен көп бос кеңістік жеткілікті. Күннің ортасындағы жеңіл үзіліс 🤍",
    "photographer/sreda2-selected/DSC09135.jpg"),
  post(3, "RU", "LIVE", "Разговор за столом",
    "Живая SREDA — это разговоры, которые начинаются сами. Кто-то рассказывает, кто-то слушает, а кофе и маленькие паузы остаются между словами 🤍",
    "photographer/aug14-live/J-4.jpg"),
  post(4, "RU", "CAROUSEL", "У кофе есть свой ритм",
    "Каппинг в SREDA звучал не только ложками о чашки. Музыка собрала пространство, а кофе дал повод задержаться и познакомиться. Один вечер — три живых кадра.",
    ["live/sep-04-coffee-rhythm-cover.png", "photographer/cupping/DSC08038_resized.jpg", "photographer/cupping/DSC08046_resized.jpg"]),
  post(5, "KZ", "FOOD", "Құлпынайлы матча",
    "Құлпынайлы матча — қыркүйекке аздап түс пен жұмсақ дәм қосатын сусын. Жай ғана әдемі үзіліс 🤍",
    "food/matcha-strawberry.jpeg"),
  post(6, "RU", "LIVE", "Из рук в руки",
    "Иногда весь сервис помещается в одном движении: чашку приготовили, проверили и передали гостю. Тёплый кофе и простое человеческое внимание 🤍",
    "photographer/aug14-live/J-75.jpg"),
  post(7, "KZ", "AIR", "Қол мен шәйнек",
    "Қол, шәйнек, шыныаяқ. Артық сөзсіз-ақ кофе дайындаудың өз ырғағы бар.",
    "photographer/cupping/DSC08259_resized.jpg"),
  post(8, "RU", "CAROUSEL", "Люди создают место",
    "До того как напиток оказывается на столе, команда успевает подготовить бар, настроить оборудование и проверить десятки деталей. Люди действительно создают место 🤍",
    ["live/sep-08-people-create-place-cover.png", "photographer/cupping/DSC08056_resized.jpg", "photographer/cupping/DSC08110_resized.jpg"]),
  post(9, "RU", "DESIGN", "Серьёзно о кофе",
    "Мы серьёзно относимся к кофе, но в течение смены обязательно находится место для такой улыбки. Именно из таких кадров и складывается живая SREDA.",
    "live/sep-09-serious-coffee-cover.png"),
  post(10, "KZ", "FOOD", "Үлкен таңғы ас",
    "Асықпай басталатын күнге арналған үлкен таңғы ас: жұмыртқа, көкөніс, жылы нан және бір табақтағы бірнеше дәм 🤍",
    "photographer/sreda2-selected/DSC09161.jpg"),
  post(11, "RU", "CAROUSEL", "Вкус, которым делятся",
    "Хороший кофе становится понятнее, когда им делятся: показывают зерно, сравнивают чашки и спокойно говорят о вкусе. Здесь интерес важнее сложных терминов.",
    ["live/sep-11-shared-taste-cover.png", "photographer/cupping/DSC08209_resized.jpg", "photographer/cupping/DSC08318_resized.jpg"]),
  post(12, "KZ", "AIR", "Бір шыныаяқ тыныштық",
    "Кейде лентаға тыныс керек. Бір шыныаяқ жылы шай және асықпай өтетін бірнеше минут. Артық ештеңе жоқ 🤍",
    "photographer/sreda2-selected/DSC09140.jpg"),
  post(13, "RU", "LIVE", "Команда за работой",
    "Место живёт благодаря людям, которых гость не всегда успевает заметить. За стойкой уже идёт работа: собрать, проверить и вовремя помочь друг другу.",
    "photographer/aug14-live/J-60.jpg"),
  post(14, "KZ", "FOOD", "Сэндвичке арналған үзіліс",
    "Күннің ортасында бәрін күрделендірмей-ақ қоюға болады: жылы сэндвич, сүйікті сусын және өзіңе арналған қысқа үзіліс 🤍",
    "photographer/sreda2-selected/DSC09155.jpg"),
  post(15, "RU", "CAROUSEL", "Точность до первого глотка",
    "В каппинге всё держится на внимании: одинаковая вода, точное время и честная реакция на вкус. Спокойная работа, которую обычно не видно за готовой чашкой.",
    ["live/sep-15-precision-cover.png", "photographer/cupping/DSC08192_resized.jpg", "photographer/cupping/DSC08289_resized.jpg"]),
  post(16, "KZ", "AIR", "Жарық пен көзқарас",
    "Кейде кадрға әрекет қажет емес. Жарық, көзқарас және кофехананың өз ырғағы жеткілікті.",
    "photographer/cupping/DSC08054_resized.jpg"),
  post(17, "RU", "LIVE", "Работа за баром",
    "За баром всегда происходит чуть больше, чем видит гость: смешать, проверить, поправить и только потом отдать напиток. Любим такие рабочие кадры.",
    "photographer/cupping/DSC08117_resized.jpg"),
  post(18, "KZ", "FOOD", "Асшаян қосылған салат",
    "Жасыл салат, қызанақ, қытырлақ нан және асшаян — жеңіл, бірақ толыққанды түскі асқа арналған үйлесім.",
    "photographer/sreda2-selected/DSC09214.jpg"),
  post(19, "KZ", "CAROUSEL", "Бір ауысымның тарихы",
    "SREDA-ның күнделікті ырғағы командадан басталады: барды дайындау, тапсырысты жинау, бір-біріне көмектесу. Үш кадр — бір ауысымның шағын тарихы 🤍",
    ["photographer/cupping/DSC08099.jpg", "photographer/cupping/DSC08071.jpg", "photographer/cupping/DSC08156_resized.jpg"]),
  post(20, "KZ", "AIR", "Музыка басталған сәт",
    "Музыка басталған сәт. Кадрда тек адам мен пульт, бірақ сол кештің көңіл күйі түгел сезіледі.",
    "photographer/cupping/DSC08031_resized.jpg"),
  post(21, "RU", "LIVE", "Вкус обсуждают вслух",
    "Кофе становится интереснее, когда впечатлением делятся сразу. Один держит чашку, другой слушает — и обычная дегустация превращается в живой разговор.",
    "photographer/aug14-live/J-73.jpg"),
  post(22, "RU", "CAROUSEL", "От зерна к заметкам",
    "Сначала зерно, затем помол и чашка. Вкус сравнивают спокойно: пробуют, записывают ощущения и возвращаются к деталям без лишней сложности.",
    ["photographer/sreda2-selected/DSC09128.jpg", "photographer/aug14-live/J-85.jpg", "photographer/cupping/DSC08141_resized.jpg"]),
  post(23, "KZ", "FOOD", "Монблан SREDA",
    "Монблан SREDA — кофе дәмі мен жұмсақ текстурасы бар әдемі үзіліс. Күннің ортасына дәл келеді 🤍",
    "food/coffee-mon-blanc.jpeg"),
  post(24, "KZ", "CAROUSEL", "Әңгімеден дәмге дейін",
    "Кофе жайлы әңгіме бір сәтте ортақ тәжірибеге айналады: алдымен тыңдаймыз, кейін салыстырамыз, соңында өз дәмімізді табамыз.",
    ["photographer/cupping/DSC08241_resized.jpg", "photographer/cupping/DSC08270_resized.jpg", "photographer/cupping/DSC08322_resized.jpg"]),
  post(25, "RU", "LIVE", "Короткая пауза",
    "Иногда достаточно маленькой чашки и пары спокойных минут у кофейной станции. Такой кадр ничего не объясняет — просто оставляет ощущение SREDA.",
    "photographer/aug14-live/J-61.jpg"),
  post(26, "KZ", "FOOD", "Албырт стейкі",
    "Голландез тұздығы қосылған албырт стейкі — күн ортасындағы нақты әрі дәмді жоспар.",
    "food/dinner-salmon-steak.jpeg"),
  post(27, "KZ", "AIR", "Бір шыныаяқ және жарық",
    "Ақ-қара кадрда тек қол, шыныаяқ және жарық қалады. Лентаға керек тыныс дәл осындай қарапайым сәттен туады.",
    "photographer/aug14-live/J-65.jpg"),
  post(28, "RU", "CAROUSEL", "Детали создают место",
    "Место складывается из деталей: знакомого красного меню, настроенного оборудования и команды, которая держит общий ритм. Собрали три кадра одной SREDA.",
    ["live/sep-28-place-alive-cover.png", "photographer/aug14-live/J-3.jpg", "photographer/aug14-live/J-86.jpg"]),
  post(29, "KZ", "LIVE", "Қолдан қолға",
    "Жаңа дайындалған десертті қолға ұсынған сәттің өзі жылы кадрға айналады. SREDA-дағы қызмет осындай қарапайым қимылдардан басталады 🤍",
    "photographer/aug14-live/J-133.jpg"),
  post(30, "RU", "CAROUSEL", "Сентябрь в деталях",
    "Сентябрь в SREDA получился разным: люди за стойкой, красные детали, кофе, еда и короткие паузы. Пять кадров из трёх съёмок — один живой ритм места 🤍",
    ["photographer/cupping/DSC08113_resized.jpg", "photographer/cupping/DSC08166_resized.jpg", "photographer/aug14-live/J-7.jpg", "photographer/sreda2-selected/DSC09149.jpg", "photographer/sreda2-selected/DSC09190.jpg"]),
]);

const ALL_POSTS = Object.freeze([THREADS_LAUNCH_POST, THREADS_TRIAL_POST, ...SEPTEMBER_THREADS_POSTS]);

export function getThreadsPostById(id) {
  return ALL_POSTS.find((item) => item.id === id) ?? null;
}

export function getSeptemberThreadsPostByDate(date) {
  return SEPTEMBER_THREADS_POSTS.find((item) => item.date === date) ?? null;
}

export function listAllThreadsPosts() {
  return [...ALL_POSTS];
}

export function validateThreadsSeptemberCalendar() {
  const errors = [];
  if (SEPTEMBER_THREADS_POSTS.length !== 30) errors.push("Ожидалось 30 сентябрьских Threads-постов");
  const ids = new Set();
  const dates = new Set();
  const texts = new Set();
  const languages = { KZ: 0, RU: 0 };
  const formats = { CAROUSEL: 0, LIVE: 0, AIR: 0, FOOD: 0, DESIGN: 0 };
  const dailyAssets = new Set();

  for (const item of SEPTEMBER_THREADS_POSTS) {
    if (ids.has(item.id)) errors.push(`Дублирующийся ID: ${item.id}`);
    if (dates.has(item.date)) errors.push(`Дублирующаяся дата: ${item.date}`);
    if (texts.has(item.text)) errors.push(`Дублирующийся текст: ${item.id}`);
    ids.add(item.id);
    dates.add(item.date);
    texts.add(item.text);
    languages[item.language] = (languages[item.language] || 0) + 1;
    formats[item.format] = (formats[item.format] || 0) + 1;
    if (item.time !== THREADS_LOCAL_TIME) errors.push(`${item.id}: неверное время`);
    if (!item.text.includes(PHONE) || !item.text.includes("26/1")) errors.push(`${item.id}: нет контактов`);
    if (item.text.includes("?")) errors.push(`${item.id}: вопросительный знак запрещён`);
    if (item.text.length > 500) errors.push(`${item.id}: текст длиннее 500 знаков`);
    const refs = item.assets || (item.asset ? [item.asset] : []);
    if (refs.length === 0) errors.push(`${item.id}: пост без медиа`);
    if (item.format === "CAROUSEL" && (refs.length < 2 || refs.length > 20)) {
      errors.push(`${item.id}: в карусели должно быть от 2 до 20 кадров`);
    }
    if (item.format !== "CAROUSEL" && refs.length !== 1) {
      errors.push(`${item.id}: одиночный формат должен иметь один кадр`);
    }
    for (const ref of refs) {
      if (dailyAssets.has(ref)) errors.push(`${item.id}: повторно используется asset ${ref}`);
      dailyAssets.add(ref);
    }
  }

  for (let day = 1; day <= 30; day += 1) {
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    if (!dates.has(date)) errors.push(`Нет даты ${date}`);
  }
  if (languages.KZ !== 15 || languages.RU !== 15) errors.push("Языки должны быть 15 KZ + 15 RU");
  if (formats.CAROUSEL !== 10 || formats.LIVE !== 7 || formats.AIR !== 6 || formats.FOOD !== 6 || formats.DESIGN !== 1) {
    errors.push("Форматы должны быть 10 CAROUSEL + 7 LIVE + 6 AIR + 6 FOOD + 1 DESIGN");
  }
  return { ok: errors.length === 0, errors, counts: { languages, formats } };
}

export { PHONE, FOOTER_KZ, FOOTER_RU };
