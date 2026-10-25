// Live copy of Steam's client settings, shared by every mounted component.

import { useEffect, useReducer } from 'react';

import { setCurrentScreensaverId } from './screenOff';
import { ClientSettings, activateFolder, watchClientSettings } from './steam';

let clientSettings: ClientSettings | null = null;
const listeners = new Set<() => void>();
let stopWatching: (() => void) | undefined;

// the rotation folder was renamed; keep it active if it was
const OLD_ROTATION_ID = 'uioverride-decky-shuffle';
const ROTATION_FOLDER = 'deck-animations-rotation';

export function startClientSettings(): void {
  stopWatching = watchClientSettings((s) => {
    if (s.screensaverCurrentId === OLD_ROTATION_ID) void activateFolder(ROTATION_FOLDER);
    clientSettings = s;
    setCurrentScreensaverId(s.screensaverCurrentId);
    listeners.forEach((l) => l());
  });
}

export function stopClientSettings(): void {
  stopWatching?.();
}

export function getClientSettings(): ClientSettings | null {
  return clientSettings;
}

export function useClientSettings(): ClientSettings | null {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  return clientSettings;
}
