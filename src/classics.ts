// Generated screensavers bundled in assets/classics/<id>/ (ids must match
// CLASSICS in main.py). Each installs into the folder "classic-<id>".

import { t } from './i18n';

export interface Classic {
  id: 'polygons' | 'starfield' | 'pipes' | 'rain' | 'bubbles' | 'curves';
  /** CSS background for the card, hinting at the look. */
  art: string;
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
];

export const classicName = (c: Classic) => t(`classic.${c.id}.name`);
export const classicDescription = (c: Classic) => t(`classic.${c.id}.desc`);
export const classicFolder = (id: string) => `classic-${id}`;
