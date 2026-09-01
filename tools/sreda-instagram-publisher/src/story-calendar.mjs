export const STORY_WINDOW_START = "2026-09-01";
export const STORY_WINDOW_END = "2026-09-01";
export const STORY_TIMES = ["15:20", "15:40", "16:00", "16:20", "16:40"];

// Exact five-frame V2 set approved by the user for one ordered publication on
// 1 September 2026. The workflow has no cron trigger and is disabled again after
// the five guarded runs complete.
export const STORY_RELEASE_STATUS = "APPROVED";

export function storyAutopublishApproved() {
  return STORY_RELEASE_STATUS === "APPROVED";
}

const APPROVED_ASSETS = [
  "2026-09-01-v2/01-information-guest.png",
  "2026-09-01-v2/02-air-balloons.png",
  "2026-09-01-v2/03-live-editorial.png",
  "2026-09-01-v2/04-air-ivory.png",
  "2026-09-01-v2/05-information-omelette.png",
];

export const STORY_SLOTS = new Map(
  STORY_TIMES.map((time, storyIndex) => [
    `${STORY_WINDOW_START} ${time}`,
    { asset: APPROVED_ASSETS[storyIndex], storyIndex },
  ]),
);

export function storyCalendarRows() {
  return [...STORY_SLOTS].map(([slot, config]) => ({ slot, ...config }));
}
