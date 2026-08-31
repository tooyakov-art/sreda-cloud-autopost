const PHONE = "+7 706 600 83 82";
const FOOTER_RU = `📍 Астана, ЖК Garden View, Бухар Жырау, 26/1\n📞 ${PHONE}`;
const FOOTER_KZ = `📍 Астана, Garden View ТК, Бұқар жырау даңғылы, 26/1\n📞 ${PHONE}`;

export const THREADS_LOCAL_TIME = "15:30";
export const THREADS_TIME_ZONE = "Asia/Qyzylorda";

function caption(language, body) {
  const footer = language === "KZ" ? FOOTER_KZ : FOOTER_RU;
  return `${String(body).trim()}\n\n${footer}`;
}

function post(day, language, format, topic, body, asset = null) {
  const date = `2026-09-${String(day).padStart(2, "0")}`;
  return Object.freeze({
    id: `TH-SEP-${String(day).padStart(2, "0")}`,
    date,
    time: THREADS_LOCAL_TIME,
    language,
    format,
    topic,
    text: caption(language, body),
    asset,
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
  post(1, "KZ", "PHOTO", "Бельгиялық вафли",
    "Қыркүйекті асықпай бастайық: бельгиялық вафли, сүйікті кофе және өзіңізге арналған тыныш уақыт 🤍\n\nSREDA-да кездескенше.",
    "photos/03-belgian-waffles.jpeg"),
  post(2, "RU", "TEXT", "Небольшая пауза",
    "В SREDA можно зайти на полчаса и случайно остаться дольше. Любимый кофе, спокойный стол и пауза, которую не хочется торопить 🤍"),
  post(3, "KZ", "DESIGN", "Таңғы ырғақ",
    "Таңды асықпай бастауға болады. SREDA-да сүйікті кофеңізге және өз ырғағыңызға әрдайым орын бар 🤍",
    "design/01-wordmark-ivory-on-garnet.png"),
  post(4, "RU", "PHOTO", "Французский омлет",
    "Французский омлет со страчателлой и креветками — завтрак, ради которого приятно начать день чуть медленнее. Ждём вас в SREDA 🤍",
    "photos/01-french-omelette.jpeg"),
  post(5, "KZ", "PHOTO", "Телятина қосылған салат",
    "Түскі асқа жеңіл әрі тойымды нұсқа: телятина және зімбірлі тұздығы бар салат. SREDA-да асықпай демалуға уақыт табыңыз 🤍",
    "photos/02-veal-salad.jpeg"),
  post(6, "RU", "TEXT", "Выходной завтрак",
    "Выходной создан для завтрака без спешки. Выберите любимое блюдо, добавьте кофе и оставьте остальной день без строгого расписания 🤍"),
  post(7, "KZ", "PHOTO", "Бенедикт с индейкой",
    "Жексенбілік таңға Бенедикт с индейкой және сүйікті кофе жарасады. Күнді өз ырғағыңызбен бастаңыз 🤍",
    "photos/05-benedict-turkey.jpeg"),
  post(8, "RU", "PHOTO", "Стейк из семги",
    "Стейк из семги с соусом голандез — спокойный план на ужин. Заходите вечером, будем рады накрыть для вас стол 🤍",
    "photos/04-salmon-steak.jpeg"),
  post(9, "KZ", "TEXT", "Кездесуге арналған орын",
    "Кейбір кездесулерге ерекше жоспар керек емес. Бір үстел, екі кофе және асықпай сөйлесуге уақыт болса жеткілікті. SREDA-да кездескенше 🤍"),
  post(10, "RU", "DESIGN", "Своя SREDA",
    "У каждого бывает место, куда хочется возвращаться без особого повода. Пусть в SREDA у вас появится свой стол и любимый вкус 🤍",
    "design/02-mark-ivory-on-garnet.png"),
  post(11, "KZ", "TEXT", "Дәннің дәмі неден құралады",
    "Кофе дәміне дәннің шыққан жері, өңдеу тәсілі және қуыру деңгейі әсер етеді. Баристаға қандай дәм ұнайтынын айтсаңыз, таңдауға көмектесеміз."),
  post(12, "RU", "TEXT", "Люди SREDA",
    "Место начинается с людей. В SREDA каждый день встречают, готовят, подсказывают и замечают детали — так появляется ощущение, что вам здесь рады 🤍"),
  post(13, "KZ", "TEXT", "Қонақжайлық",
    "SREDA-ға алғаш рет келсеңіз, өзіңізге не ұнайтынын айтыңыз. Команда сусын мен тағам таңдауға қуана көмектеседі."),
  post(14, "RU", "PHOTO", "Казарече с креветками",
    "Казарече с креветками и страчателлой — тот случай, когда обед можно сделать главным приятным событием дня 🤍",
    "photos/06-casarecce.jpeg"),
  post(15, "KZ", "DESIGN", "Ай ортасындағы үзіліс",
    "Ай ортасында өзіңізге шағын үзіліс қалдырыңыз. Кофе, тыныш кеңістік және асықпай демалуға уақыт — бәрі SREDA-да 🤍",
    "design/03-wordmark-garnet-on-ivory.png"),
  post(16, "RU", "PHOTO", "Бельгийские вафли",
    "Бельгийские вафли, кофе и утро без спешки — простой план, который легко повторить. Будем ждать вас в SREDA 🤍",
    "photos/03-belgian-waffles.jpeg"),
  post(17, "KZ", "DESIGN", "SREDA командасы",
    "SREDA-ны күн сайын адамдар жасайды. Әр кесенің, әр тағамның және жылы қарсы алудың артында біздің команда тұр 🤍",
    "design/04-mark-garnet-on-ivory.png"),
  post(18, "RU", "TEXT", "Как раскрывается зерно",
    "Вкус кофе складывается из происхождения зерна, способа обработки и обжарки. Не нужно учить термины: расскажите бариста, какие вкусы вам нравятся, — поможем выбрать."),
  post(19, "KZ", "PHOTO", "Түскі ас",
    "Күн ортасындағы үзіліске телятина және зімбірлі тұздығы бар салатты таңдауға болады. Нақты тағам, тыныш үстел және асықпайтын сәт 🤍",
    "photos/02-veal-salad.jpeg"),
  post(20, "RU", "PHOTO", "Ужин без спешки",
    "Иногда хороший вечер — это тёплый свет, спокойный разговор и стейк из семги с соусом голандез. До встречи в SREDA 🤍",
    "photos/04-salmon-steak.jpeg"),
  post(21, "KZ", "DESIGN", "Кешкі SREDA",
    "Кешке SREDA басқаша сезіледі: жылы жарық, тыныш әуен және аяқтағыңыз келмейтін әңгімелер. Сізді қуана күтеміз 🤍",
    "design/05-wordmark-ivory-on-black.png"),
  post(22, "RU", "PHOTO", "Завтрак в будний день",
    "Будний день тоже можно начать красиво: французский омлет со страчателлой и креветками, кофе и немного времени для себя 🤍",
    "photos/01-french-omelette.jpeg"),
  post(23, "KZ", "DESIGN", "Көңіл күйге арналған орын",
    "Жұмыс, кездесу немесе жай ғана тыныш үзіліс — SREDA-да әр күнге өз көңіл күйіңізді табуға болады 🤍",
    "design/06-mark-ivory-on-black.png"),
  post(24, "RU", "TEXT", "За кадром кухни",
    "За каждой подачей — работа кухни, которую гость обычно не видит. Нам нравится делать её спокойно, внимательно и без лишней суеты."),
  post(25, "KZ", "TEXT", "Өз орның",
    "Кейбір орындарға бір рет келесіз, ал кейбіріне қайта оралғыңыз келеді. SREDA-да өз үстеліңіз бен сүйікті дәміңіз табылсын 🤍"),
  post(26, "RU", "PHOTO", "Казарече",
    "Казарече с креветками и страчателлой — хороший повод устроить себе обед без спешки. Заходите, будем рады вас видеть 🤍",
    "photos/06-casarecce.jpeg"),
  post(27, "KZ", "PHOTO", "Жексенбілік таңғы ас",
    "Жексенбілік таңғы ас асықпай өтуі керек. Бенедикт с индейкой, классикалық кофе және күнді өз ырғағыңызбен бастау 🤍",
    "photos/05-benedict-turkey.jpeg"),
  post(28, "RU", "TEXT", "Пространство для людей",
    "SREDA становится живой благодаря людям. Спасибо, что приходите на кофе, встречи, завтраки и долгие разговоры 🤍"),
  post(29, "KZ", "DESIGN", "Қыркүйектің сәттері",
    "Қыркүйек бізге жылы кездесулер, таныс жүздер және жаңа сүйікті сәттер сыйлады. Осы айды бізбен бірге өткізгеніңізге рақмет 🤍",
    "design/07-wordmark-black-on-white.png"),
  post(30, "RU", "DESIGN", "Спасибо за сентябрь",
    "Спасибо за сентябрь в SREDA — за первые визиты, знакомые лица и добрые слова для команды. Будем рады видеть вас снова 🤍",
    "design/08-mark-black-on-white.png"),
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
  const formats = { PHOTO: 0, DESIGN: 0, TEXT: 0 };

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
    if (item.format === "TEXT" && item.asset) errors.push(`${item.id}: TEXT не должен иметь asset`);
    if (item.format !== "TEXT" && !item.asset) errors.push(`${item.id}: медиапост без asset`);
  }

  for (let day = 1; day <= 30; day += 1) {
    const date = `2026-09-${String(day).padStart(2, "0")}`;
    if (!dates.has(date)) errors.push(`Нет даты ${date}`);
  }
  if (languages.KZ !== 15 || languages.RU !== 15) errors.push("Языки должны быть 15 KZ + 15 RU");
  if (formats.PHOTO !== 12 || formats.DESIGN !== 8 || formats.TEXT !== 10) {
    errors.push("Форматы должны быть 12 PHOTO + 8 DESIGN + 10 TEXT");
  }
  return { ok: errors.length === 0, errors, counts: { languages, formats } };
}

export { PHONE, FOOTER_KZ, FOOTER_RU };
