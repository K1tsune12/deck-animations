// Bridges to SteamUI's native screensaver support.
//
// - The Screensaver service (webpack module exporting GetLocalScreensavers /
//   ForceScreensaver) lists user folders and starts a preview.
// - The active screensaver is the client setting `screensaver_current_id`
//   (CMsgClientSettings field 16004, a string). SteamUI writes settings with
//   SteamClient.Settings.SetSetting(base64 of a CMsgClientSettings holding just
//   that field), so we serialize the same one-field protobuf by hand.

import { findModuleExport } from '@decky/ui';

export const SLIDESHOW_ID = 'steam-gameslideshow';
export const BOUNCING_LOGO_ID = 'steam-bouncinglogo';

const OVERRIDE_PREFIX = 'uioverride-';
const ACTIVE_KEY = 'decky-screensavers:active';

/** CMsgClientSettings field numbers (from SteamUI's message definition). */
export const SettingField = {
  screensaverCurrentId: 16004, // string
  screensaverWhileInGame: 16006, // bool
  idleSuspendBatterySec: 24003, // int32, 0 = disabled
  idleSuspendAcSec: 24004,
  idleScreensaverBatterySec: 24008,
  idleScreensaverAcSec: 24009,
} as const;

/** Same choices Steam's power settings offer (seconds; 0 = disabled). */
export const IDLE_CHOICES = [0, 60, 300, 900, 1800, 3600];

export interface ClientSettings {
  screensaverCurrentId: string;
  screensaverWhileInGame: boolean;
  idleSuspendBatterySec: number;
  idleSuspendAcSec: number;
  idleScreensaverBatterySec: number;
  idleScreensaverAcSec: number;
}

interface ScreensaverService {
  GetLocalScreensavers(req: object): Promise<any>;
  ForceScreensaver(req: { enabled: boolean }): Promise<any>;
  GetActiveState(req: object): Promise<any>;
  RegisterForNotifyActiveStateChanged?(handler: (msg: any) => number): { unregister(): void } | undefined;
}

let service: ScreensaverService | null | undefined;

function getService(): ScreensaverService | null {
  if (service === undefined) {
    service =
      findModuleExport(
        (e: any) => typeof e?.GetLocalScreensavers === 'function' && typeof e?.ForceScreensaver === 'function',
      ) ?? null;
    if (!service) console.warn('[decky-screensavers] Screensaver service not found');
  }
  return service ?? null;
}

/** Folder name for a user screensaver id ("uioverride-<form-encoded name>"). */
export function folderFromId(id: string): string {
  if (!id.startsWith(OVERRIDE_PREFIX)) return '';
  try {
    return decodeURIComponent(id.slice(OVERRIDE_PREFIX.length).replace(/\+/g, ' '));
  } catch {
    return '';
  }
}

async function listLocalIds(): Promise<string[]> {
  const svc = getService();
  if (!svc) return [];
  const res = await svc.GetLocalScreensavers({});
  return res
    .Body()
    .screensavers()
    .map((s: any) => s.id() as string);
}

/** Steam's id for a folder we just wrote; retries briefly while Steam rescans. */
export async function resolveFolderId(folder: string): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = (await listLocalIds()).find((i) => folderFromId(i) === folder);
    if (id) return id;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

function pushVarint(n: number, out: number[]): void {
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
}

function writeSetting(bytes: number[]): void {
  (window as any).SteamClient.Settings.SetSetting(btoa(String.fromCharCode(...bytes)));
}

/** Write a varint (int32/bool) client setting. */
export function setIntSetting(field: number, value: number): void {
  const bytes: number[] = [];
  pushVarint(field * 8, bytes); // wire type 0
  pushVarint(value, bytes);
  writeSetting(bytes);
}

export function setActiveScreensaver(id: string): void {
  const value = new TextEncoder().encode(id);
  const bytes: number[] = [];
  pushVarint(SettingField.screensaverCurrentId * 8 + 2, bytes); // length-delimited
  pushVarint(value.length, bytes);
  value.forEach((b) => bytes.push(b));
  writeSetting(bytes);
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // only a fallback for when the settings read fails
  }
}

/** Last screensaver set through this plugin; fallback when settings can't be read. */
export function getLastActive(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Decode the fields we care about from a serialized CMsgClientSettings. */
function decodeSettings(buf: ArrayBuffer | Uint8Array): ClientSettings {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const out: ClientSettings = {
    screensaverCurrentId: '',
    screensaverWhileInGame: false,
    idleSuspendBatterySec: 0,
    idleSuspendAcSec: 0,
    idleScreensaverBatterySec: 0,
    idleScreensaverAcSec: 0,
  };
  let i = 0;
  const varint = () => {
    let result = 0;
    let scale = 1;
    let byte: number;
    do {
      byte = b[i++];
      result += (byte & 0x7f) * scale;
      scale *= 128;
    } while (byte & 0x80 && i < b.length);
    return result;
  };
  while (i < b.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (wire === 0) {
      const v = varint();
      if (field === SettingField.screensaverWhileInGame) out.screensaverWhileInGame = !!v;
      else if (field === SettingField.idleSuspendBatterySec) out.idleSuspendBatterySec = v;
      else if (field === SettingField.idleSuspendAcSec) out.idleSuspendAcSec = v;
      else if (field === SettingField.idleScreensaverBatterySec) out.idleScreensaverBatterySec = v;
      else if (field === SettingField.idleScreensaverAcSec) out.idleScreensaverAcSec = v;
    } else if (wire === 2) {
      const n = varint();
      if (field === SettingField.screensaverCurrentId) {
        out.screensaverCurrentId = new TextDecoder().decode(b.subarray(i, i + n));
      }
      i += n;
    } else if (wire === 1) {
      i += 8;
    } else if (wire === 5) {
      i += 4;
    } else {
      break; // unknown wire type: stop rather than misparse
    }
  }
  return out;
}

/**
 * Subscribe to Steam's client settings. The callback fires right away with the
 * current values and again on every change. Returns an unsubscribe function.
 */
export function watchClientSettings(cb: (s: ClientSettings) => void): () => void {
  const handle = (window as any).SteamClient.Settings.RegisterForSettingsArrayChanges((buf: ArrayBuffer) => {
    try {
      cb(decodeSettings(buf));
    } catch (err) {
      console.warn('[decky-screensavers] failed to decode client settings', err);
    }
  });
  return () => handle?.unregister?.();
}

/** Steam's own active/inactive notification; returns an unsubscribe function. */
export function onScreensaverActiveChanged(cb: (active: boolean) => void): () => void {
  const svc = getService();
  const handle = svc?.RegisterForNotifyActiveStateChanged?.((msg: any) => {
    try {
      cb(!!msg.Body().active());
    } catch (err) {
      console.warn('[decky-screensavers] screensaver notification failed', err);
    }
    return 1; // EResult OK
  });
  return () => handle?.unregister?.();
}

export async function isScreensaverActive(): Promise<boolean> {
  const svc = getService();
  if (!svc) return false;
  return !!(await svc.GetActiveState({})).Body().active();
}

/** Make one of our folders the active screensaver. Returns false if Steam doesn't list it. */
export async function activateFolder(folder: string): Promise<boolean> {
  const id = await resolveFolderId(folder);
  if (!id) return false;
  setActiveScreensaver(id);
  return true;
}

/** End whatever screensaver is showing (forced or idle-started). */
export async function stopScreensaver(): Promise<void> {
  await getService()?.ForceScreensaver({ enabled: false });
}

export async function previewScreensaver(): Promise<void> {
  await getService()?.ForceScreensaver({ enabled: true });
}

// Gamescope service (SetDisplayPowerState): switches the panel itself off, so
// nothing (notifications included) is shown until it's switched back on.
// EDisplayPowerState: 0 invalid, 1 off, 2 on.
interface GamescopeService {
  SetDisplayPowerState(req: { estate: number }): Promise<any>;
}

let gamescope: GamescopeService | null | undefined;

function getGamescope(): GamescopeService | null {
  if (gamescope === undefined) {
    gamescope =
      findModuleExport(
        (e: any) => typeof e?.SetDisplayPowerState === 'function' && typeof e?.GetState === 'function',
      ) ?? null;
    if (!gamescope) console.warn('[deck-animations] Gamescope service not found');
  }
  return gamescope ?? null;
}

/** Switch the panel off/on through gamescope. False if that isn't available. */
export async function setPanelPower(on: boolean): Promise<boolean> {
  const gs = getGamescope();
  if (!gs) return false;
  const res = await gs.SetDisplayPowerState({ estate: on ? 2 : 1 });
  return res?.GetEResult?.() === 1;
}

// Steam's SuspendResumeStore: the power button (and the power menu) end up in
// its InitiateSleep(). An own property on the instance shadows the prototype
// method, so a handler can take a request over and keep the Deck awake.
interface SuspendStore {
  InitiateSleep(suppressActualSuspend?: boolean): void;
}

/** Run `handler` on every suspend request; returning true swallows it. */
export function interceptSuspend(handler: () => boolean): () => void {
  const store: SuspendStore | undefined = findModuleExport(
    (e: any) => typeof e?.InitiateSleep === 'function' && typeof e?.OnSuspendRequest === 'function' && 'm_cSuspendBlockers' in e,
  );
  if (!store) {
    console.warn('[deck-animations] SuspendResumeStore not found');
    return () => {};
  }
  const patched = function (this: SuspendStore, ...args: [boolean?]) {
    let swallow = false;
    try {
      swallow = handler();
    } catch (err) {
      console.warn('[deck-animations] suspend handler failed', err);
    }
    if (!swallow) Object.getPrototypeOf(store).InitiateSleep.apply(this, args);
  };
  store.InitiateSleep = patched;
  return () => {
    if (store.InitiateSleep === patched) delete (store as any).InitiateSleep;
  };
}
