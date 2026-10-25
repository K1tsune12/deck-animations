// Watches the screensaver's active state while the plugin is loaded:
//
// - Turns the panel off after the last play of a single-video screensaver and
//   back on as soon as the screensaver closes (any input dismisses it). The
//   screensaver page runs in an isolated browser view, so it can't tell us
//   when it finished; we time the plays from the file's exact duration.
// - Works around a SteamUI bug: when the idle timer starts the screensaver
//   while the Quick Access or main menu is open, Steam hides the menu, gives
//   up on the screensaver ~0.5 s later and brings the menu back. Steam's own
//   NotifyActiveStateChanged lets us react within that window: close the menus
//   and re-start it as a forced screensaver, which only real input ends.

import { getState, setDisplayPower } from './backend';
import { folderFromId, isScreensaverActive, onScreensaverActiveChanged, previewScreensaver } from './steam';

const POLL_MS = 1000;
const MENU_POLL_MS = 250;
const MENU_RECENT_MS = 800; // menu counts as "open at activation" if seen this recently
const REFORCE_DELAY_MS = 150;
const BOUNCE_MS = 1000; // deactivated this soon after activating = Steam gave up, not the user
const REFORCE_WINDOW_MS = 10000;
const REFORCE_MAX = 2;
const MARGIN_MS = 1500; // fade-out + seek slack

let pollTimer: number | undefined;
let menuTimer: number | undefined;
let offTimer: number | undefined;
let stopNotify: (() => void) | undefined;
let wasActive = false;
let displayOff = false;
let currentId = '';
let menuSeenAt = 0;
let activatedAt = 0;
let reforces: number[] = [];

/** Keep the watcher aware of the active screensaver (fed from client settings). */
export function setCurrentScreensaverId(id: string): void {
  currentId = id;
}

function menuStore(): any {
  return (window as any).SteamUIStore?.WindowStore?.MainWindowInstance?.MenuStore;
}

const PER_ITEM_MS = 600; // start-up latency of each shuffle item

const playMs = (seconds: number, boomerang: boolean) => seconds * (boomerang ? 2 : 1) * 1000;

/** When to switch the panel off: after the plays of a single video, or after
 *  one full pass of the Shuffle list (random order, but the total is fixed). */
function plannedOffMs(): number | null {
  const { playback, installed, shuffle, shuffleFolder, classics, classicOptions } = getState();
  if (!playback.limit || playback.after !== 'off') return null;
  const folder = folderFromId(currentId);

  if (folder === shuffleFolder) {
    const videos = installed.filter((e) => e.screensaver && e.shuffleInclude !== false);
    const pageCount = classics.filter((c) => classicOptions[c]?.shuffleInclude).length;
    if (!videos.length && !pageCount) return null;
    const one = videos.length + pageCount === 1;
    const total =
      videos.reduce(
        (sum, e) => sum + shuffle.playsPerVideo * playMs(e.videoDuration || e.duration || 0, shuffle.boomerang || e.boomerang),
        0,
      ) +
      pageCount * shuffle.classicSeconds * 1000 +
      (one ? 0 : (videos.length + pageCount) * PER_ITEM_MS);
    return total + MARGIN_MS;
  }

  const entry = installed.find((e) => e.folder === folder);
  const seconds = entry ? entry.videoDuration || entry.duration : 0;
  if (!entry || !seconds) return null;
  return playback.plays * playMs(seconds, entry.boomerang) + MARGIN_MS;
}

async function setDisplay(on: boolean): Promise<void> {
  try {
    await setDisplayPower(on);
    displayOff = !on;
  } catch (err) {
    console.warn('[decky-screensavers] display power change failed', err);
  }
}

/** Restart the screensaver as a forced one (only real input ends that kind). */
function reforce(): void {
  const now = Date.now();
  reforces = reforces.filter((t) => now - t < REFORCE_WINDOW_MS);
  if (reforces.length >= REFORCE_MAX) return; // something else keeps ending it: don't fight
  reforces.push(now);
  menuStore()?.CloseSideMenus?.();
  window.setTimeout(() => void previewScreensaver().catch(() => {}), REFORCE_DELAY_MS);
}

function onActiveChange(active: boolean): void {
  if (active && !wasActive) {
    activatedAt = Date.now();
    if (Date.now() - menuSeenAt < MENU_RECENT_MS) {
      menuSeenAt = 0;
      reforce();
    }
    window.clearTimeout(offTimer);
    const ms = plannedOffMs();
    if (ms !== null) offTimer = window.setTimeout(() => void setDisplay(false), ms);
  } else if (!active && wasActive) {
    window.clearTimeout(offTimer);
    offTimer = undefined;
    // Steam sometimes drops an idle-started screensaver right away (a menu or
    // overlay grabbing focus); after a minute idle that's not the user
    if (Date.now() - activatedAt < BOUNCE_MS) reforce();
  }
  if (!active && displayOff) void setDisplay(true);
  wasActive = active;
}

async function poll(): Promise<void> {
  try {
    onActiveChange(await isScreensaverActive());
  } catch {
    // keep the last known state
  }
}

export function startScreenOffWatcher(): void {
  stopNotify = onScreensaverActiveChanged(onActiveChange);
  menuTimer = window.setInterval(() => {
    if (menuStore()?.IsAnySideMenuVisible?.()) menuSeenAt = Date.now();
  }, MENU_POLL_MS);
  // fallback (and retry for a failed "display on") in case a notification is missed
  pollTimer = window.setInterval(() => void poll(), POLL_MS);
}

export function stopScreenOffWatcher(): void {
  stopNotify?.();
  window.clearInterval(menuTimer);
  window.clearInterval(pollTimer);
  window.clearTimeout(offTimer);
  if (displayOff) void setDisplay(true);
}
