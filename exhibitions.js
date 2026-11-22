import { realEvents as comicWorldEvents } from './comicworld.js';
import { cafeEvents } from './cafe2026.js';
import { realEvents as illustarEvents } from './illustar.js';

const cafeShow = cafeEvents.map((event) => ({
  ...event,
  name: '서울카페쇼 2026',
  venue: event.venue.split(' · ')[0],
  source: {
    ...event.source,
    booths: 'https://kor.cafeshow.com/kor/cafeshow/exhibitor_list.asp',
    highlights: 'https://kor.cafeshow.com/kor/mypage/my_notice_list.asp?page=1',
  },
  booths: event.booths.map((booth) => ({
    ...booth,
    featured: booth.highlighted === true,
    highlight: booth.highlightLabel,
  })),
}));

export const exhibitions = [...comicWorldEvents, ...illustarEvents, ...cafeShow];
