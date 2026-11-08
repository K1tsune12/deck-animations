// Live thumbnails for generated screensavers: the real page (same scripts and
// options as the screensaver) running in a small iframe, only while it is on
// screen. The CSS art stays underneath as the placeholder and fallback.

import { FC, useEffect, useRef, useState } from 'react';

import { call } from '@decky/api';

import { useBackendState } from './backend';

type Pages = Record<string, string>;

let pages: Pages | null = null;
let pagesKey = '';
let loading: Promise<Pages | null> | null = null;
const listeners = new Set<() => void>();

/** Fetch every page once per change of the options (colours, clock settings, language). */
function loadPages(key: string): void {
  if ((pages && pagesKey === key) || loading) return;
  loading = call<[], { ok: boolean; pages?: Pages }>('get_classic_pages')
    .then((res) => (res.ok && res.pages ? res.pages : null))
    .catch(() => null)
    .then((next) => {
      loading = null;
      if (next) {
        pages = next;
        pagesKey = key;
        listeners.forEach((l) => l());
      }
      return next;
    });
}

function usePage(id: string): string | undefined {
  const state = useBackendState();
  const key = JSON.stringify([state.classicOptions]);
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (pagesKey !== key) loadPages(key);
  }, [key]);
  return pagesKey === key || pages ? pages?.[id] : undefined;
}

/** The real animation of a classic/clock/OLED art, filling its parent, while visible. */
export const LiveArt: FC<{ id: string }> = ({ id }) => {
  const page = usePage(id);
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    const win = el?.ownerDocument?.defaultView as (Window & typeof globalThis) | null | undefined;
    if (!el || !win?.IntersectionObserver) return;
    const io = new win.IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), {
      rootMargin: '100px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={box} className="dss-live">
      {visible && page && <iframe srcDoc={page} sandbox="allow-scripts" tabIndex={-1} />}
    </div>
  );
};
