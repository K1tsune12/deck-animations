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
  preparePreviewClassic,
  preparePreviewMedia,
  scanCustomFolder,
  setClassicOptions,
  setMovie,
  setOptions,
  useBackendState,
} from './backend';
import { CLASSICS, classicFolder, classicName, classicPrefix } from './classics';
import { getClientSettings, getRealActive, holdRealActive, useClientSettings } from './clientSettings';
import { getLocale, t, useLanguage } from './i18n';
import { log } from './debug';
import { setPreviewing } from './screenOff';
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
import {
  CLOCK_MOTIONS,
  CLOCK_POSITIONS,
  CLOCK_SPEEDS,
  ClassicOptions,
  Fit,
  InstalledEntry,
  MOVIE_SLOTS,
  MovieFit,
  MovieSlot,
  SLOT_TYPE,
} from './types';

const FITS: Fit[] = ['cover', 'contain', 'fill', 'none'];
const MOVIE_FITS: MovieFit[] = ['original', 'contain', 'cover', 'stretch'];

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
let previewRunning = false;

export async function previewFolder(folder: string, onEnd?: () => void): Promise<void> {
  // a second preview while one shows would "restore" the first preview's folder
  if (previewRunning) return;
  previewRunning = true;
  // the id the user chose, not one a preview that just ended still shows in
  // the settings (Steam reflects the restore a moment later)
  const previous = getRealActive() || getClientSettings()?.screensaverCurrentId || getLastActive();
  holdRealActive(Infinity);
  // the screen-off watcher must not treat the preview as an idle screensaver
  // (it would re-force it, and later the restored one: the rotation shows up)
  setPreviewing(true);
  if (!(await activateFolder(folder))) {
    setPreviewing(false);
    previewRunning = false;
    holdRealActive(0);
    throw new Error(t('toast.folderNotListed'));
  }
  let started = false;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    previewRunning = false;
    stop();
    log('preview: finish, restoring', previous, 'started', started);
    if (previous) setActiveScreensaver(previous);
    holdRealActive(Date.now() + PREVIEW_RESTORE_HOLD_MS);
    onEnd?.();
    // the "inactive" notification may still be on its way to the watcher
    window.setTimeout(() => setPreviewing(false), PREVIEW_SETTLE_MS);
  };
  const stop = onScreensaverActiveChanged((active) => {
    if (active) started = true;
    else if (started) finish();
  });
  // force only once Steam reports the preview folder as the active screensaver,
  // otherwise the previous one (the rotation, say) is what comes up
  const isActive = () => folderFromId(getClientSettings()?.screensaverCurrentId ?? '') === folder;
  const settle = async () => {
    const t0 = Date.now();
    while (!isActive() && Date.now() - t0 < PREVIEW_SETTLE_MS) await new Promise((r) => setTimeout(r, 50));
    return isActive();
  };
  log('preview', folder, 'previous', previous);
  let ok = await settle();
  if (!ok) {
    // a folder written a moment ago may not be in Steam's list yet: one more try
    log('preview: not active after settle, retrying activate');
    await activateFolder(folder);
    ok = await settle();
  }
  if (!ok) {
    log('preview: giving up, active is', getClientSettings()?.screensaverCurrentId);
    finish();
    throw new Error(t('toast.previewNotReady'));
  }
  log('preview: forcing');
  void previewScreensaver();
  // never leave the preview selected if it somehow didn't start
  setTimeout(() => {
    if (!started) finish();
  }, 5000);
}

const PREVIEW_SETTLE_MS = 1500;
const PREVIEW_RESTORE_HOLD_MS = 4000;

/** Full-screen preview of something online that is not in the library yet. */
export async function previewMedia(url: string, kind: 'video' | 'image'): Promise<void> {
  await previewFolder(await preparePreviewMedia(url, kind), () => void endPreview());
}

/** Full-screen preview of a generated screensaver, installed or not. */
export async function previewClassic(id: string): Promise<void> {
  await previewFolder(await preparePreviewClassic(id), () => void endPreview());
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
    state.installed.filter((e) => e.screensaver && !e.disabled && e.shuffleInclude !== false).length +
    state.classics.filter((c) => state.classicOptions[c]?.shuffleInclude && !state.classicOptions[c]?.disabled).length;

  const options = [
    { data: SLIDESHOW_ID, label: t('qam.steamSlideshow') },
    { data: BOUNCING_LOGO_ID, label: t('qam.steamLogo') },
    ...(state.shuffle.enabled && shuffleCount
      ? [{ data: FOLDER_PREFIX + state.shuffleFolder, label: t('qam.shuffle', { n: shuffleCount }) }]
      : []),
    ...CLASSICS.filter((c) => state.classics.includes(c.id) && !state.classicOptions[c.id]?.disabled).map((c) => ({
      data: FOLDER_PREFIX + classicFolder(c.id),
      label: `${classicPrefix(c)} · ${classicName(c)}`,
    })),
    ...state.installed
      .filter((e) => e.screensaver && !e.disabled)
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
      {/* text fields first: the on-screen keyboard covers the lower half of the screen.
          One plain column, so the controller moves name -> tags -> save with up/down
          (a side-by-side layout left the fields unreachable from the pad). */}
      <TextField label={t('opts.name')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextField
        label={t('opts.tags')}
        description={t('opts.tagsDesc')}
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      <Focusable style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0 12px' }}>
        <DialogButton
          style={{ width: 'auto', minWidth: 0, padding: '0 24px' }}
          disabled={busy || !title.trim()}
          onClick={() => void save()}
        >
          {t('opts.save')}
        </DialogButton>
      </Focusable>
      <ToggleField
        label={t('opts.enabled')}
        description={t('opts.enabledDesc')}
        checked={!entry.disabled}
        disabled={busy}
        onChange={(v) => void run(() => setOptions(entry.id, { disabled: !v }))}
      />
      {slotsFor(entry).length > 0 && !entry.disabled && (
        <DropdownItem
          label={t('opts.movieFit')}
          description={t('opts.movieFitDesc')}
          rgOptions={[
            { data: '', label: t('opts.movieFitDefault', { fit: t(`movies.fit.${state.movies.fit ?? 'original'}`) }) },
            ...MOVIE_FITS.map((f) => ({ data: f, label: t(`movies.fit.${f}`) })),
          ]}
          selectedOption={entry.movieFit ?? ''}
          disabled={busy}
          onChange={(o) =>
            void run(async () => {
              await setOptions(entry.id, { movieFit: o.data as MovieFit | '' });
              if (activeSlots(entry).length) toast(t('movies.fitApplied'));
            })
          }
        />
      )}
      <ToggleField
        label={t('lib.badgeSs')}
        checked={!!entry.screensaver}
        disabled={busy || !!entry.disabled}
        onChange={(v) => void run(() => setOptions(entry.id, { screensaver: v }))}
      />
      {entry.screensaver && !entry.disabled && (
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
          rgOptions={[
            { data: '', label: t('fit.default', { fit: t(`fit.${state.defaultFit}`) }) },
            ...FITS.map((f) => ({ data: f, label: t(`fit.${f}`) })),
          ]}
          selectedOption={entry.fit ?? ''}
          disabled={busy}
          onChange={(o) => void run(() => setOptions(entry.id, { fit: o.data as Fit | '' }))}
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
      {id === 'rain' && <ColorChoice id={id} field="color" fallback={RAIN_COLORS[0][1]} label={t('classicOpts.color')} />}
      {classic.colors && (
        <>
          <ColorChoice id={id} field="color" fallback={classic.colors[0]} label={t('clockOpts.color')} />
          <ColorChoice id={id} field="color2" fallback={classic.colors[1]} label={t('clockOpts.color2')} />
        </>
      )}
      {classic.clock && <ClockOptions id={id} />}
      {classic.oled && !classic.clock && (
        <>
          <ToggleField
            label={t('clockOpts.overlay')}
            description={t('clockOpts.overlayDesc')}
            checked={!!state.classicOptions[id]?.clock}
            disabled={busy}
            onChange={(v) => void run(() => setClassicOptions(id, { clock: v, locale: getLocale() }))}
          />
          {state.classicOptions[id]?.clock && (
            <>
              <ColorChoice id={id} field="clockColor" fallback={classic.colors?.[0] ?? '#ffffff'} label={t('clockOpts.clockColor')} />
              <ClockOptions id={id} />
            </>
          )}
        </>
      )}
    </ModalRoot>
  );
};

const CLOCK_FONTS = ['thin', 'sans', 'serif', 'mono'] as const;
const CLOCK_SIZES = ['s', 'm', 'l', 'xl'] as const;

/** A debounced 0-100 slider for a clock option. */
const PercentSlider: FC<{ label: string; description?: string; value: number; min?: number; onCommit: (v: number) => void }> = ({
  label,
  description,
  value,
  min = 0,
  onCommit,
}) => {
  const [shown, setShown] = useState(value);
  const timer = useRef<number>();
  return (
    <SliderField
      label={label}
      description={description}
      value={shown}
      min={min}
      max={100}
      step={5}
      showValue
      onChange={(v) => {
        setShown(v);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => onCommit(v), 400);
      }}
    />
  );
};

/** Look of an OLED clock: font, size, 12/24 h, seconds, date, brightness, and where it sits. */
const ClockOptions: FC<{ id: string }> = ({ id }) => {
  const state = useBackendState();
  const [busy, run] = useBusy();
  const o = state.classicOptions[id] ?? {};
  const set = (patch: ClassicOptions) => void run(() => setClassicOptions(id, { ...patch, locale: getLocale() }));
  const motion = o.motion ?? 'drift';
  const position = o.position ?? 'center';
  return (
    <>
      <DropdownItem
        label={t('clockOpts.font')}
        rgOptions={CLOCK_FONTS.map((f) => ({ data: f, label: t(`clockOpts.font.${f}`) }))}
        selectedOption={o.font ?? 'thin'}
        disabled={busy}
        onChange={(v) => set({ font: v.data })}
      />
      <DropdownItem
        label={t('clockOpts.size')}
        rgOptions={CLOCK_SIZES.map((s) => ({ data: s, label: t(`clockOpts.size.${s}`) }))}
        selectedOption={o.size ?? 'l'}
        disabled={busy}
        onChange={(v) => set({ size: v.data })}
      />
      <DropdownItem
        label={t('clockOpts.hours')}
        rgOptions={[
          { data: '24', label: '24 h' },
          { data: '12', label: '12 h (AM/PM)' },
        ]}
        selectedOption={o.hours ?? '24'}
        disabled={busy}
        onChange={(v) => set({ hours: v.data })}
      />
      <ToggleField label={t('clockOpts.seconds')} checked={o.seconds === true} disabled={busy} onChange={(v) => set({ seconds: v })} />
      <ToggleField label={t('clockOpts.date')} checked={o.date !== false} disabled={busy} onChange={(v) => set({ date: v })} />
      <PercentSlider label={t('clockOpts.dim')} description={t('clockOpts.dimDesc')} value={o.dim ?? 70} min={20} onCommit={(v) => set({ dim: v })} />
      <DropdownItem
        label={t('clockOpts.motion')}
        description={t('clockOpts.motionDesc')}
        rgOptions={CLOCK_MOTIONS.map((m) => ({ data: m, label: t(`clockOpts.motion.${m}`) }))}
        selectedOption={motion}
        disabled={busy}
        onChange={(v) => set({ motion: v.data })}
      />
      {motion !== 'fixed' && (
        <DropdownItem
          label={t('clockOpts.speed')}
          rgOptions={CLOCK_SPEEDS.map((s) => ({ data: s, label: t(`clockOpts.speed.${s}`) }))}
          selectedOption={o.speed ?? 'normal'}
          disabled={busy}
          onChange={(v) => set({ speed: v.data })}
        />
      )}
      {motion === 'fixed' && (
        <DropdownItem
          label={t('clockOpts.position')}
          rgOptions={CLOCK_POSITIONS.map((p) => ({ data: p, label: t(`clockOpts.position.${p}`) }))}
          selectedOption={position}
          disabled={busy}
          onChange={(v) => set({ position: v.data })}
        />
      )}
      {motion === 'fixed' && position === 'custom' && (
        <>
          <PercentSlider label={t('clockOpts.x')} value={o.x ?? 50} onCommit={(v) => set({ x: v })} />
          <PercentSlider label={t('clockOpts.y')} value={o.y ?? 50} onCommit={(v) => set({ y: v })} />
        </>
      )}
    </>
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

/** A colour option of a classic/clock: preset colours or a custom hue. */
const ColorChoice: FC<{ id: string; field: 'color' | 'color2' | 'clockColor'; fallback: string; label: string }> = ({
  id,
  field,
  fallback,
  label,
}) => {
  const state = useBackendState();
  const [busy, run] = useBusy();
  const color = state.classicOptions[id]?.[field] || fallback;
  const presets: (readonly [string, string])[] = RAIN_COLORS.some(([, hex]) => hex === fallback)
    ? [...RAIN_COLORS]
    : [['default', fallback], ...RAIN_COLORS];
  const preset = presets.find(([, hex]) => hex === color);
  const [custom, setCustom] = useState(!preset);
  const [hue, setHue] = useState(hexToHue(color));
  const timer = useRef<number>();

  const options = [
    ...presets.map(([key, hex]) => ({ data: hex as string, label: t(`color.${key}` as any) })),
    { data: CUSTOM_COLOR, label: t('color.custom') },
  ];
  return (
    <>
      <DropdownItem
        label={label}
        rgOptions={options}
        selectedOption={custom ? CUSTOM_COLOR : color}
        disabled={busy}
        onChange={(o) => {
          if (o.data === CUSTOM_COLOR) {
            setCustom(true);
            return;
          }
          setCustom(false);
          // the overlay clock's "Default" means "follow the art's main colour": store nothing
          const value = field === 'clockColor' && o.data === fallback ? '' : (o.data as string);
          void run(() => setClassicOptions(id, { [field]: value }));
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
            timer.current = window.setTimeout(() => void run(() => setClassicOptions(id, { [field]: hueToHex(v) })), 400);
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
            state.customDir || '/home',
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
