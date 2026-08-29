export const STORY_WINDOW_START = "2026-08-29";
export const STORY_WINDOW_END = "2026-09-30";
export const STORY_TIMES = ["08:00", "11:30", "14:30", "18:30", "21:00"];

const MORNING_ASSETS = [
  "morning/morning-benedict-turkey-v1.jpg",
  "morning/morning-chia-granola-v1.jpg",
  "morning/morning-french-omelette-v1.jpg",
  "morning/morning-oatmeal-berries-v1.jpg",
  "morning/morning-rice-porridge-v1.jpg",
  "morning/morning-syrniki-v1.jpg",
  "morning/morning-waffles-v1.jpg",
];

const FOOD_ASSETS = [
  "food/drink-barista-set-v1.jpg",
  "food/drink-cranberry-guava-thyme-v1.jpg",
  "food/drink-espresso-tonic-lime-v1.jpg",
  "food/drink-filter-plum-cherry-v1.jpg",
  "food/drink-mango-coconut-blueberry-v1.jpg",
  "food/drink-mango-passionfruit-v1.jpg",
  "food/drink-matcha-banana-bread-v1.jpg",
  "food/drink-matcha-strawberry-v1.jpg",
  "food/drink-matcha-tonic-citrus-v1.jpg",
  "food/drink-mon-blanc-v1.jpg",
  "food/drink-peanut-latte-v1.jpg",
  "food/food-caesar-chicken-v1.jpg",
  "food/food-casarecce-v1.jpg",
  "food/food-chicken-sandwich-v1.jpg",
  "food/food-cordon-bleu-v1.jpg",
  "food/food-fettuccine-v1.jpg",
  "food/food-meatball-soup-v1.jpg",
  "food/food-medallions-v1.jpg",
  "food/food-pappardelle-v1.jpg",
  "food/food-quinoa-salad-v1.jpg",
  "food/food-salmon-maasdam-sandwich-v1.jpg",
  "food/food-salmon-steak-v1.jpg",
  "food/food-stracciatella-eggplant-v1.jpg",
  "food/food-veal-salad-v1.jpg",
];

const PEOPLE_ASSETS = [
  "people/dessert-choice-v1.jpg",
  "people/people-bar-dialogue-v1.jpg",
  "people/people-guest-v1.jpg",
  "people/people-interior-v1.jpg",
  "people/people-raw-balloons-v1.jpg",
  "people/people-raw-dancing-v1.jpg",
  "people/people-raw-guest-dog-v1.jpg",
  "people/people-raw-guest-table-v1.jpg",
  "people/people-raw-interior-logo-v1.jpg",
];

const EVENING_ASSETS = [
  "evening/evening-dessert-v1.jpg",
  "evening/evening-dessert-v2.jpg",
  "evening/evening-dessert-v3.jpg",
];

function datesInclusive(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function assetsForDay(dayIndex) {
  return [
    MORNING_ASSETS[dayIndex % MORNING_ASSETS.length],
    FOOD_ASSETS[dayIndex % FOOD_ASSETS.length],
    PEOPLE_ASSETS[dayIndex % PEOPLE_ASSETS.length],
    FOOD_ASSETS[(dayIndex + 12) % FOOD_ASSETS.length],
    EVENING_ASSETS[(dayIndex + 1) % EVENING_ASSETS.length],
  ];
}

export const STORY_SLOTS = new Map();

for (const [dayIndex, date] of datesInclusive(STORY_WINDOW_START, STORY_WINDOW_END).entries()) {
  const assets = assetsForDay(dayIndex);

  // The first production day starts with the two slots still ahead at handoff time.
  if (date === "2026-08-29") {
    assets[3] = "food/food-medallions-v1.jpg";
    assets[4] = "evening/evening-dessert-v2.jpg";
  }

  for (const [storyIndex, time] of STORY_TIMES.entries()) {
    STORY_SLOTS.set(`${date} ${time}`, {
      asset: assets[storyIndex],
      storyIndex,
    });
  }
}

export function storyCalendarRows() {
  return [...STORY_SLOTS].map(([slot, config]) => ({ slot, ...config }));
}
