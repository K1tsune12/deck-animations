// "Randomize every N minutes" for the boot/suspend/throbber videos. A timer
// that wakes once a minute, compares timestamps and, only when no game is
// running, asks the backend to re-pick (which just re-points three symlinks).

import { Router } from '@decky/ui';

import { getState, shuffleMovies } from './backend';

const CHECK_MS = 60 * 1000;

let timer: number | undefined;

function gameRunning(): boolean {
  const store = (window as any).SteamUIStore;
  return (store?.RunningApps?.length ?? 0) > 0 || !!(Router as any)?.MainRunningApp;
}

function check(): void {
  const { randomizeEveryMin, lastShuffle } = getState().movies;
  if (!randomizeEveryMin) return;
  if (Date.now() - lastShuffle * 1000 < randomizeEveryMin * 60 * 1000) return;
  if (gameRunning()) return; // try again next minute, after the game closes
  shuffleMovies().catch((err) => console.warn('[decky-screensavers] timed randomize failed', err));
}

export function startAutoRandomize(): void {
  timer = window.setInterval(check, CHECK_MS);
}

export function stopAutoRandomize(): void {
  window.clearInterval(timer);
}
