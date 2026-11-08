// Generated screensavers bundled in assets/classics/<id>/ (ids must match
// CLASSICS in main.py). Each installs into the folder "classic-<id>".

import { t } from './i18n';

export type ClockId = 'clock-digital' | 'clock-analog' | 'clock-rings' | 'clock-aurora';
export type OledArtId = 'oled-fireflies' | 'oled-aurora' | 'oled-fireworks' | 'oled-lava' | 'oled-silk';

export interface Classic {
  id: 'polygons' | 'starfield' | 'pipes' | 'rain' | 'bubbles' | 'curves' | ClockId | OledArtId;
  /** CSS background for the card, hinting at the look. */
  art: string;
  /** Lives in the OLED tab: mostly black, always moving (clocks and OLED art). */
  oled?: boolean;
  /** An OLED clock (clock options) rather than an animation. */
  clock?: boolean;
  /** Default colours of a clock (main, accent), shown in its options. */
  colors?: [string, string];
}

/** Card art of a digital clock: the time in a gradient of the two colours, the date below. */
function clockArt(c1: string, c2: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 70'>` +
    `<defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='${c1}'/><stop offset='0.5' stop-color='${c2}'/><stop offset='1' stop-color='${c1}'/></linearGradient></defs>` +
    `<rect width='160' height='70' fill='#000'/>` +
    `<text x='80' y='46' text-anchor='middle' font-family='sans-serif' font-weight='200' font-size='36' fill='url(#g)' letter-spacing='-1'>21:47</text>` +
    `<text x='80' y='61' text-anchor='middle' font-family='sans-serif' font-size='7' fill='${c2}' opacity='0.75' letter-spacing='0.5'>SÁBADO, 8 DE NOVEMBRO</text>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") center / cover no-repeat, #000`;
}

export const CLASSICS: Classic[] = [
  {
    id: 'polygons',
    art: 'linear-gradient(135deg, #001 0%, #0aa 45%, #001 50%, #e60 55%, #001 100%)',
  },
  {
    id: 'starfield',
    art: 'radial-gradient(circle at 50% 50%, #fff 0 1px, transparent 2px) 0 0 / 22px 22px, radial-gradient(circle, #113 0%, #000 70%)',
  },
  {
    id: 'pipes',
    art: 'linear-gradient(90deg, transparent 40%, #3c3 40% 52%, transparent 52%), linear-gradient(0deg, transparent 30%, #c3c 30% 42%, transparent 42%), #000',
  },
  {
    id: 'rain',
    art: 'repeating-linear-gradient(90deg, #0f0 0 3px, transparent 3px 14px), linear-gradient(#000, #031)',
  },
  {
    id: 'bubbles',
    art: 'radial-gradient(circle at 35% 40%, transparent 0 26%, #9cf 27% 29%, transparent 30%), radial-gradient(circle at 70% 65%, transparent 0 18%, #f9c 19% 21%, transparent 22%), #000',
  },
  {
    id: 'curves',
    art: 'radial-gradient(ellipse at 30% 60%, #f0f8 0%, transparent 40%), radial-gradient(ellipse at 70% 40%, #0ff8 0%, transparent 40%), #000',
  },
  {
    id: 'clock-digital',
    clock: true,
    colors: ['#ffffff', '#ffffff'],
    art: clockArt('#fff', '#fff'),
  },
  {
    id: 'clock-analog',
    clock: true,
    colors: ['#e8e8e8', '#ff5a36'],
    art: 'radial-gradient(circle at 50% 50%, transparent 0 27%, #ddd6 28%, transparent 29%), linear-gradient(60deg, transparent 49.4%, #ff5a36 49.5% 50.5%, transparent 50.6%) 50% 50% / 30% 30% no-repeat, #000',
  },
  {
    id: 'clock-rings',
    clock: true,
    colors: ['#a64dff', '#33e6ff'],
    art: 'radial-gradient(circle at 50% 50%, transparent 0 22%, #33e6ff 23% 24%, transparent 25% 28%, #a64dff 29% 30.5%, transparent 31.5%), #000',
  },
  {
    id: 'clock-aurora',
    clock: true,
    colors: ['#a64dff', '#33e6ff'],
    art: clockArt('#a64dff', '#33e6ff'),
  },
  {
    id: 'oled-fireflies',
    oled: true,
    colors: ['#ffd36b', '#9dff6b'],
    art: 'radial-gradient(circle at 22% 35%, #ffd36b 0 2px, #ffd36b44 4px, transparent 10px), radial-gradient(circle at 68% 62%, #9dff6b 0 2px, #9dff6b44 4px, transparent 10px), radial-gradient(circle at 48% 22%, #ffd36b 0 1px, transparent 6px), radial-gradient(circle at 82% 30%, #9dff6b 0 1px, transparent 6px), #000',
  },
  {
    id: 'oled-aurora',
    oled: true,
    colors: ['#33ff99', '#a64dff'],
    art: 'linear-gradient(180deg, transparent 10%, #33ff9955 35%, transparent 60%), linear-gradient(170deg, transparent 25%, #a64dff44 45%, transparent 65%), #000',
  },
  {
    id: 'oled-fireworks',
    oled: true,
    colors: ['#ff4dc4', '#ffb31a'],
    art: 'radial-gradient(circle at 35% 40%, #ff4dc4 0 2px, transparent 3px 14%, #ff4dc455 15%, transparent 17%), radial-gradient(circle at 70% 55%, #ffb31a 0 2px, transparent 3px 10%, #ffb31a55 11%, transparent 13%), #000',
  },
  {
    id: 'oled-lava',
    oled: true,
    colors: ['#ff3b3b', '#a64dff'],
    art: 'radial-gradient(circle at 40% 45%, #ff3b3baa 0%, transparent 22%), radial-gradient(circle at 60% 58%, #a64dffaa 0%, transparent 20%), #000',
  },
  {
    id: 'oled-silk',
    oled: true,
    colors: ['#33e6ff', '#ff4dc4'],
    art: 'repeating-radial-gradient(ellipse at 20% 120%, transparent 0 12px, #33e6ff33 13px, transparent 14px), repeating-radial-gradient(ellipse at 80% -20%, transparent 0 14px, #ff4dc433 15px, transparent 16px), #000',
  },
];

for (const c of CLASSICS) if (c.clock) c.oled = true;

/** Classics tab (Explore): the original animations. */
export const ANIMATIONS = CLASSICS.filter((c) => !c.oled);
/** OLED tab sections. */
export const CLOCKS = CLASSICS.filter((c) => c.clock);
export const OLED_ART = CLASSICS.filter((c) => c.oled && !c.clock);

export const classicName = (c: Classic) => t(`classic.${c.id}.name`);
export const classicDescription = (c: Classic) => t(`classic.${c.id}.desc`);
/** "Classic" or "OLED", for list prefixes. */
export const classicPrefix = (c: Classic) => t(c.oled ? 'prefix.oled' : 'prefix.classic');
export const classicFolder = (id: string) => `classic-${id}`;
