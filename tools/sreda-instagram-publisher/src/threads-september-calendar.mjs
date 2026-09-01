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
  post(2, "KZ", "AIR", "Ақ шыныаяқ пен тыныштық",
    "Кейде жақсы кадрға көп нәрсе қажет емес: ақ шыныаяқ, кофе және асықпайтын бірнеше минут. SREDA-дағы кішкентай үзіліс 🤍",
    "photographer/cupping/DSC08138_resized.jpg"),
  post(3, "RU", "LIVE", "Разговор у бара",
    "SREDA живёт не только подачами. Иногда главный момент — короткий разговор у бара, точная рекомендация и улыбка перед первым глотком 🤍",
    "photographer/opening/source-06.jpg"),
  post(4, "RU", "CAROUSEL", "У кофе есть свой ритм",
    "Каппинг в SREDA звучал не только ложками о чашки. Музыка собрала пространство, а кофе дал повод задержаться и познакомиться. Один вечер — три живых кадра.",
    ["live/sep-04-coffee-rhythm-cover.png", "photographer/cupping/DSC08038_resized.jpg", "photographer/cupping/DSC08046_resized.jpg"]),
  post(5, "KZ", "FOOD", "Құлпынайлы матча",
    "Құлпынайлы матча — қыркүйекке аздап түс пен жұмсақ дәм қосатын сусын. Жай ғана әдемі үзіліс 🤍",
    "food/matcha-strawberry.jpeg"),
  post(6, "RU", "LIVE", "Свой темп",
    "Нам нравятся моменты, в которых ничего не нужно придумывать: человек занял свой стол, напиток уже рядом, день идёт своим темпом. Так выглядит живая SREDA 🤍",
    "photographer/opening/source-01.jpg"),
  post(7, "KZ", "AIR", "Қол мен шәйнек",
    "Қол, шәйнек, шыныаяқ. Артық сөзсіз-ақ кофе дайындаудың өз ырғағы бар.",
    "photographer/cupping/DSC08259_resized.jpg"),
  post(8, "RU", "CAROUSEL", "Люди создают место",
    "До того как напиток оказывается на столе, команда успевает подготовить бар, настроить оборудование и проверить десятки деталей. Люди действительно создают место 🤍",
    ["live/sep-08-people-create-place-cover.png", "photographer/cupping/DSC08056_resized.jpg", "photographer/cupping/DSC08110_resized.jpg"]),
  post(9, "RU", "DESIGN", "Серьёзно о кофе",
    "Мы серьёзно относимся к кофе, но в течение смены обязательно находится место для такой улыбки. Именно из таких кадров и складывается живая SREDA.",
    "live/sep-09-serious-coffee-cover.png"),
  post(10, "KZ", "FOOD", "Күркетауық еті қосылған Бенедикт",
    "Күркетауық еті қосылған Бенедикт — асықпай басталатын таңға арналған жылы таңғы ас 🤍",
    "food/breakfast-benedict-turkey.jpeg"),
  post(11, "RU", "CAROUSEL", "Вкус, которым делятся",
    "Хороший кофе становится понятнее, когда им делятся: показывают зерно, сравнивают чашки и спокойно говорят о вкусе. Здесь интерес важнее сложных терминов.",
    ["live/sep-11-shared-taste-cover.png", "photographer/cupping/DSC08209_resized.jpg", "photographer/cupping/DSC08318_resized.jpg"]),
  post(12, "KZ", "AIR", "Үстелдегі тыныштық",
    "Кейде лентаға тыныс керек. Үстелдегі мәзір, бір стақан және келесі кездесуге дейінгі тыныштық.",
    "photographer/opening/source-22.jpg"),
  post(13, "RU", "LIVE", "Разговор за столом",
    "В SREDA разговор легко начинается за столом: кто-то пробует блюдо, кто-то слушает, кто-то делится историей. Живые встречи выглядят именно так 🤍",
    "photographer/opening/source-27.jpg"),
  post(14, "KZ", "FOOD", "Цитрусты матча-тоник",
    "Цитрусты матча-тоник — матча дәмі мен сергітетін цитрустың жеңіл кездесуі.",
    "food/matcha-tonic-citrus.jpeg"),
  post(15, "RU", "CAROUSEL", "Точность до первого глотка",
    "В каппинге всё держится на внимании: одинаковая вода, точное время и честная реакция на вкус. Спокойная работа, которую обычно не видно за готовой чашкой.",
    ["live/sep-15-precision-cover.png", "photographer/cupping/DSC08192_resized.jpg", "photographer/cupping/DSC08289_resized.jpg"]),
  post(16, "KZ", "AIR", "Жарық пен көзқарас",
    "Кейде кадрға әрекет қажет емес. Жарық, көзқарас және кофехананың өз ырғағы жеткілікті.",
    "photographer/cupping/DSC08054_resized.jpg"),
  post(17, "RU", "LIVE", "Работа за баром",
    "За баром всегда происходит чуть больше, чем видит гость: смешать, проверить, поправить и только потом отдать напиток. Любим такие рабочие кадры.",
    "photographer/cupping/DSC08117_resized.jpg"),
  post(18, "KZ", "FOOD", "Француз омлеті",
    "Страчателла мен асшаян қосылған француз омлеті — күнді асықпай бастауға арналған жұмсақ дәм.",
    "food/breakfast-french-omelette.jpeg"),
  post(19, "KZ", "CAROUSEL", "Бір ауысымның тарихы",
    "SREDA-ның күнделікті ырғағы командадан басталады: барды дайындау, тапсырысты жинау, бір-біріне көмектесу. Үш кадр — бір ауысымның шағын тарихы 🤍",
    ["photographer/cupping/DSC08099.jpg", "photographer/cupping/DSC08071.jpg", "photographer/cupping/DSC08156_resized.jpg"]),
  post(20, "KZ", "AIR", "Музыка басталған сәт",
    "Музыка басталған сәт. Кадрда тек адам мен пульт, бірақ сол кештің көңіл күйі түгел сезіледі.",
    "photographer/cupping/DSC08031_resized.jpg"),
  post(21, "RU", "LIVE", "Знакомый стол",
    "Иногда лучший сюжет уже случается сам: знакомый стол, любимый заказ и несколько спокойных минут без спешки 🤍",
    "photographer/opening/source-09.jpg"),
  post(22, "RU", "CAROUSEL", "Одно зерно — много оттенков",
    "Одно зерно может звучать по-разному. Поэтому на каппинге рядом стоят чашки, карточки и заметки — вкус ищут вниманием, а не громкими словами.",
    ["live/sep-22-one-bean-cover.png", "photographer/cupping/DSC08104_resized.jpg", "photographer/cupping/DSC08141_resized.jpg"]),
  post(23, "KZ", "FOOD", "Монблан SREDA",
    "Монблан SREDA — кофе дәмі мен жұмсақ текстурасы бар әдемі үзіліс. Күннің ортасына дәл келеді 🤍",
    "food/coffee-mon-blanc.jpeg"),
  post(24, "KZ", "CAROUSEL", "Әңгімеден дәмге дейін",
    "Кофе жайлы әңгіме бір сәтте ортақ тәжірибеге айналады: алдымен тыңдаймыз, кейін салыстырамыз, соңында өз дәмімізді табамыз.",
    ["photographer/cupping/DSC08241_resized.jpg", "photographer/cupping/DSC08270_resized.jpg", "photographer/cupping/DSC08322_resized.jpg"]),
  post(25, "RU", "LIVE", "Портрет у бара",
    "Один из тех портретов, где кафе видно без общего плана: свет витрины, красные детали и человек внутри своего момента.",
    "photographer/cupping/DSC08087.jpg"),
  post(26, "KZ", "FOOD", "Албырт стейкі",
    "Голландез тұздығы қосылған албырт стейкі — күн ортасындағы нақты әрі дәмді жоспар.",
    "food/dinner-salmon-steak.jpeg"),
  post(27, "KZ", "AIR", "Қимылдың анықтығы",
    "Түссіз кадрда қимыл анық көрінеді: қол, шәйнек және жұмысқа толық назар.",
    "photographer/cupping/DSC08147.jpg"),
  post(28, "RU", "CAROUSEL", "Место становится живым",
    "Место становится живым, когда команда разговаривает, смеётся и замечает людей вокруг. Собрали три кадра не про интерьер, а про его настоящую атмосферу.",
    ["live/sep-28-place-alive-cover.png", "photographer/opening/source-12.jpg", "photographer/opening/source-21.jpg"]),
  post(29, "KZ", "LIVE", "Ай соңындағы жай кадр",
    "Ай соңындағы жай кадр: адам, жылы жарық және асықпай өтетін уақыт. Осындай сәттер SREDA-ны тірі етеді 🤍",
    "photographer/opening/source-29.jpg"),
  post(30, "RU", "CAROUSEL", "Сентябрь в людях",
    "Сентябрь в SREDA получился не из рекламных фраз, а из людей, разговоров, музыки, кофе и маленьких пауз. Оставляем пять кадров, к которым хочется вернуться 🤍",
    ["photographer/opening/source-02.jpg", "photographer/opening/source-07.jpg", "photographer/opening/source-08.jpg", "photographer/opening/source-18.jpg", "photographer/opening/source-30.jpg"]),
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
