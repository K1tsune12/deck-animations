// What you can do with a library video, shared by the browse modal, the
// library list and the Quick Access menu.

import { FileSelectionType, openFilePicker, toaster } from '@decky/api';
import { DialogButton, DropdownItem, Focusable, ModalRoot, SliderField, TextField, ToggleField } from '@decky/ui';
import { FC, useRef, useState } from 'react';

import {
  endPreview,
  getState,
  importUrl,
  importVideo,
  preparePreview,
  scanCustomFolder,
  setClassicOptions,
  setMovie,
  setOptions,
  useBackendState,
} from './backend';
import { CLASSICS, classicFolder, classicName } from './classics';
import { getClientSettings, useClientSettings } from './clientSettings';
import { t, useLanguage } from './i18n';
import {
  BOUNCING_LOGO_ID,
  SLIDESHOW_ID,
  activateFolder,
  folderFromId,
  getLastActive,
  onScreensaverActiveChanged,
  previewScreensaver,
  setActiveScreensaver,
} from './steam';
import { Fit, InstalledEntry, MOVIE_SLOTS, MovieSlot, SLOT_TYPE } from './types';

const FITS: Fit[] = ['cover', 'contain', 'none'];

export const toast = (body: string) => toaster.toast({ title: 'Deck Animations', body });
export const errorText = (err: unknown) => String((err as Error)?.message ?? err);

/** Runs an action with a busy flag, reporting failures as a toast. */
export function useBusy(): [boolean, (fn: () => Promise<unknown>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

/** Make a folder the active screensaver (Preview is a separate action). */
export async function useFolder(folder: string, title: string): Promise<void> {
  if (!(await activateFolder(folder))) throw new Error(t('toast.folderNotListed'));
  toast(t('toast.nowActive', { title }));
}

/**
 * Show a screensaver folder full screen without keeping it: the previously
 * active screensaver is put back as soon as the preview is dismissed.
 */
export async function previewFolder(folder: string, onEnd?: () => void): Promise<void> {
  const previous = getClientSettings()?.screensaverCurrentId ?? getLastActive();
  if (!(await activateFolder(folder))) throw new Error(t('toast.folderNotListed'));
  let started = false;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    stop();
    if (previous) setActiveScreensaver(previous);
    onEnd?.();
  };
  const stop = onScreensaverActiveChanged((active) => {
    if (active) started = true;
    else if (started) finish();
  });
  setTimeout(() => void previewScreensaver(), 300);
  // never leave the preview selected if it somehow didn't start
  setTimeout(() => {
    if (!started) finish();
  }, 5000);
}

/** Full-screen preview of any library video, with its current options. */
export async function previewEntry(entry: InstalledEntry): Promise<void> {
  await previewFolder(await preparePreview(entry.id), () => void endPreview());
}

/** List a library video in Steam's screensavers (if needed) and make it the active one. */
export async function useAsScreensaver(entry: InstalledEntry): Promise<void> {
  if (!entry.screensaver) await setOptions(entry.id, { screensaver: true });
  await useFolder(entry.folder, entry.title);
}

const FOLDER_PREFIX = 'folder:';

/**
 * The "active screensaver" chooser shared by the Quick Access menu and the
 * Rotation tab: Steam's own, Shuffle, installed classics, library screensavers.
 */
export function useScreensaverChoices() {
  const state = useBackendState();
  const settings = useClientSettings();
  const active = settings?.screensaverCurrentId ?? getLastActive();
  const activeFolder = folderFromId(active);
  const shuffleCount =
    state.installed.filter((e) => e.screensaver && e.shuffleInclude !== false).length +
    state.classics.filter((c) => state.classicOptions[c]?.shuffleInclude).length;

  const options = [
    { data: SLIDESHOW_ID, label: t('qam.steamSlideshow') },
    { data: BOUNCING_LOGO_ID, label: t('qam.steamLogo') },
    ...(state.shuffle.enabled && shuffleCount
      ? [{ data: FOLDER_PREFIX + state.shuffleFolder, label: t('qam.shuffle', { n: shuffleCount }) }]
      : []),
    ...CLASSICS.filter((c) => state.classics.includes(c.id)).map((c) => ({
      data: FOLDER_PREFIX + classicFolder(c.id),
      label: `${t('prefix.classic')} · ${classicName(c)}`,
    })),
    ...state.installed
      .filter((e) => e.screensaver)
      .map((e) => ({ data: FOLDER_PREFIX + e.folder, label: `${t(`prefix.${e.type}`)} · ${e.title}` })),
  ];
  const selected = activeFolder ? FOLDER_PREFIX + activeFolder : active || undefined;

  const choose = async (data: string) => {
    if (!data.startsWith(FOLDER_PREFIX)) {
      setActiveScreensaver(data);
      return;
    }
    if (!(await activateFolder(data.slice(FOLDER_PREFIX.length)))) toast(t('toast.folderNotListed'));
  };

  return { options, selected, choose, activeFolder };
}

export async function useForSlot(entry: InstalledEntry, slot: MovieSlot): Promise<void> {
  await setMovie(slot, entry.id);
  toast(t('toast.movieSet', { title: entry.title, slot: t(`slot.${slot}`) }));
}

/** Slots a video fits: boot videos → boot, suspend videos → suspend/throbber,
 *  GIFs and your own videos → any of them. */
export const slotsFor = (entry: InstalledEntry): MovieSlot[] =>
  entry.type === 'boot' || entry.type === 'suspend' ? MOVIE_SLOTS.filter((s) => SLOT_TYPE[s] === entry.type) : MOVIE_SLOTS;

/** Can this video be picked for a slot in the boot/suspend choosers? */
export const fitsSlot = (entry: InstalledEntry, slot: MovieSlot) => slotsFor(entry).includes(slot);

/** Slots this video currently fills. */
export const activeSlots = (entry: InstalledEntry): MovieSlot[] =>
  MOVIE_SLOTS.filter((s) => getState().movies[s] === entry.id);

export const UseAsModal: FC<{ id: string; closeModal?: () => void }> = ({ id, closeModal }) => {
  useLanguage();
  const state = useBackendState();
  const [busy, run] = useBusy();
  const entry = state.installed.find((e) => e.id === id);
  if (!entry) return null;

  const slots = slotsFor(entry);
  const go = (fn: () => Promise<unknown>) =>
    run(async () => {
      await fn();
      closeModal?.();
    });

  return (
    <ModalRoot closeModal={closeModal}>
      <h3 style={{ marginTop: 0 }}>{t('useAs.title', { title: entry.title })}</h3>
      <Focusable style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <DialogButton disabled={busy} onClick={() => void go(() => useAsScreensaver(entry))}>
          {t('useAs.screensaver')}
        </DialogButton>
        {slots.map((slot) => (
          <DialogButton key={slot} disabled={busy} onClick={() => void go(() => useForSlot(entry, slot))}>
            {t(`slotLong.${slot}`)}
            {state.movies[slot] === entry.id ? ' ✓' : ''}
          </DialogButton>
        ))}
      </Focusable>
    </ModalRoot>
  );
};

export const OptionsModal: FC<{ id: string; closeModal?: () => void }> = ({ id, closeModal }) => {
  useLanguage();
  const state = useBackendState();
  const [busy, run] = useBusy();
  const entry = state.installed.find((e) => e.id === id);
  const [title, setTitle] = useState(entry?.title ?? '');
  const [tags, setTags] = useState((entry?.tags ?? []).join(', '));
  if (!entry) return null;

  const save = () =>
    run(async () => {
      await setOptions(entry.id, { title, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) });
      toast(t('opts.saved'));
    });

  return (
    <ModalRoot closeModal={closeModal}>
      {/* text fields first: the on-screen keyboard covers the lower half of the screen */}
      <Focusable style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{t('opts.name')}</div>
          <TextField value={title} onChange={(e) => setTitle(e.target.value)} />
          <div style={{ fontWeight: 'bold', margin: '10px 0 2px' }}>{t('opts.tags')}</div>
          <div style={{ color: '#9aa', fontSize: '12px', marginBottom: '4px' }}>{t('opts.tagsDesc')}</div>
          <TextField value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <DialogButton
          style={{ width: 'auto', minWidth: 0, padding: '0 16px' }}
          disabled={busy || !title.trim()}
          onClick={() => void save()}
        >
          {t('opts.save')}
        </DialogButton>
      </Focusable>
      <ToggleField
        label={t('lib.badgeSs')}
        checked={!!entry.screensaver}
        disabled={busy}
        onChange={(v) => void run(() => setOptions(entry.id, { screensaver: v }))}
      />
      {entry.screensaver && (
        <>
        <ToggleField
          label={t('common.boomerang')}
          description={t('common.boomerangDescLong')}
          checked={entry.boomerang}
          disabled={busy}
          onChange={(v) => void run(() => setOptions(entry.id, { boomerang: v }))}
        />
        <DropdownItem
          label={t('fit.label')}
          rgOptions={FITS.map((f) => ({ data: f, label: t(`fit.${f}`) }))}
          selectedOption={entry.fit ?? 'contain'}
          disabled={busy}
          onChange={(o) => void run(() => setOptions(entry.id, { fit: o.data as Fit }))}
        />
        </>
      )}
    </ModalRoot>
  );
};

export const ClassicOptionsModal: FC<{ id: string; closeModal?: () => void }> = ({ id, closeModal }) => {
  useLanguage();
  const state = useBackendState();
  const [busy, run] = useBusy();
  const classic = CLASSICS.find((c) => c.id === id);
  if (!classic) return null;

  return (
    <ModalRoot closeModal={closeModal}>
      <h3 style={{ marginTop: 0 }}>{classicName(classic)}</h3>
      <ToggleField
        label={t('classicOpts.shuffle')}
        description={t('classicOpts.shuffleDesc')}
        checked={!!state.classicOptions[id]?.shuffleInclude}
        disabled={busy}
        onChange={(v) => void run(() => setClassicOptions(id, { shuffleInclude: v }))}
      />
      {id === 'rain' && <RainColor id={id} />}
    </ModalRoot>
  );
};

const VIDEO_EXTENSIONS = ['webm', 'mp4', 'm4v'];

/** Digital Rain colours: [i18n key, trail colour]. */
const RAIN_COLORS = [
  ['green', '#33ff33'],
  ['cyan', '#33e6ff'],
  ['blue', '#3d7bff'],
  ['purple', '#a64dff'],
  ['pink', '#ff4dc4'],
  ['red', '#ff3b3b'],
  ['amber', '#ffb31a'],
  ['white', '#d9d9d9'],
] as const;
const CUSTOM_COLOR = 'custom';

/** A vivid colour for a hue in degrees, as #rrggbb. */
function hueToHex(hue: number): string {
  const l = 0.55;
  const a = 1 * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Approximate hue of a #rrggbb colour, to place the slider. */
function hexToHue(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

const RainColor: FC<{ id: string }> = ({ id }) => {
  const state = useBackendState();
  const [busy, run] = useBusy();
  const color = state.classicOptions[id]?.color || RAIN_COLORS[0][1];
  const preset = RAIN_COLORS.find(([, hex]) => hex === color);
  const [custom, setCustom] = useState(!preset);
  const [hue, setHue] = useState(hexToHue(color));
  const timer = useRef<number>();

  const options = [
    ...RAIN_COLORS.map(([key, hex]) => ({ data: hex as string, label: t(`color.${key}`) })),
    { data: CUSTOM_COLOR, label: t('color.custom') },
  ];
  return (
    <>
      <DropdownItem
        label={t('classicOpts.color')}
        rgOptions={options}
        selectedOption={custom ? CUSTOM_COLOR : color}
        disabled={busy}
        onChange={(o) => {
          if (o.data === CUSTOM_COLOR) {
            setCustom(true);
            return;
          }
          setCustom(false);
          void run(() => setClassicOptions(id, { color: o.data as string }));
        }}
      />
      {custom && (
        <SliderField
          label={t('color.hue')}
          description={<span style={{ color: hueToHex(hue) }}>■■■■■■ {hueToHex(hue)}</span>}
          value={hue}
          min={0}
          max={359}
          step={5}
          showValue
          onChange={(v) => {
            setHue(v);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => void run(() => setClassicOptions(id, { color: hueToHex(v) })), 400);
          }}
        />
      )}
    </>
  );
};

/** One place to add your own videos: a single file, or everything in the folder. */
export const ImportModal: FC<{ closeModal?: () => void }> = ({ closeModal }) => {
  useLanguage();
  const state = useBackendState();
  const [busy, run] = useBusy();
  const [url, setUrl] = useState('');

  const fromUrl = () =>
    run(async () => {
      await importUrl(url);
      toast(t('mine.videoAdded'));
      closeModal?.();
    });

  const pickFile = () =>
    run(async () => {
      let path: string | undefined;
      try {
        path = (
          await openFilePicker(
            FileSelectionType.FILE,
            state.customDir || '/home/deck',
            true, // includeFiles
            true, // includeFolders
            undefined,
            VIDEO_EXTENSIONS,
            false,
            false,
          )
        )?.path;
      } catch {
        return; // picker cancelled
      }
      if (!path) return;
      await importVideo(path);
      toast(t('mine.videoAdded'));
      closeModal?.();
    });

  const scan = () =>
    run(async () => {
      const { added, skipped } = await scanCustomFolder();
      toast(
        added || skipped.length
          ? t('mine.scanAdded', { n: added, dir: state.customDir }) +
              (skipped.length ? t('mine.scanSkipped', { n: skipped.length }) : '')
          : t('mine.scanNone', { dir: state.customDir }),
      );
      closeModal?.();
    });

  const hint = { color: '#9aa', fontSize: '12px', margin: '4px 0 12px' };
  return (
    <ModalRoot closeModal={closeModal}>
      <h3 style={{ marginTop: 0 }}>{t('import.title')}</h3>
      <div style={hint}>{t('import.formats')}</div>
      {/* the text field first: the on-screen keyboard covers the lower half */}
      <Focusable style={{ display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField placeholder={t('import.urlPlaceholder')} value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <DialogButton
          style={{ width: 'auto', minWidth: 0, padding: '0 16px' }}
          disabled={busy || !url.trim()}
          onClick={() => void fromUrl()}
        >
          {busy ? t('common.downloading') : t('import.urlButton')}
        </DialogButton>
      </Focusable>
      <div style={hint}>{t('import.urlDesc', { dir: state.customDir })}</div>
      <Focusable style={{ display: 'flex', flexDirection: 'column' }}>
        <DialogButton disabled={busy} onClick={() => void pickFile()}>
          {t('import.pick')}
        </DialogButton>
        <div style={hint}>{t('import.pickDesc')}</div>
        <DialogButton disabled={busy} onClick={() => void scan()}>
          {t('import.folder')}
        </DialogButton>
        <div style={hint}>{t('import.folderDesc', { dir: state.customDir })}</div>
      </Focusable>
    </ModalRoot>
  );
};
