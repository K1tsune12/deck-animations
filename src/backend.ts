// Backend calls + a tiny shared store so the QAM panel and the manager page
// stay in sync without a context provider.

import { call, toaster } from '@decky/api';
import { useEffect, useReducer } from 'react';

import {
  BackendState,
  GifResult,
  InstalledEntry,
  MovieSettings,
  MovieSlot,
  PlaybackSettings,
  PostLike,
  RepoPost,
  ShuffleSettings,
} from './types';

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

let state: BackendState = {
  installed: [],
  shuffle: { enabled: false, boomerang: false, playsPerVideo: 2, classicSeconds: 60, order: 'random', sequence: [] },
  playback: { limit: false, plays: 3, after: 'black' },
  classics: [],
  classicOptions: {},
  hasGiphyKey: false,
  movies: { boot: '', suspend: '', throbber: '', shuffleOnBoot: false, randomizeEveryMin: 0, lastShuffle: 0 },
  animationChangerFound: false,
  importedAnimationChanger: false,
  shuffleFolder: 'decky-shuffle',
  screensaversDir: '',
  customDir: '',
};

const listeners = new Set<() => void>();

function setState(next: BackendState): void {
  state = next;
  listeners.forEach((l) => l());
}

export function getState(): BackendState {
  return state;
}

export function useBackendState(): BackendState {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);
  return state;
}

export async function refreshState(): Promise<void> {
  setState(await call<[], BackendState>('get_state'));
}

async function mutate(route: string, ...args: any[]): Promise<BackendState> {
  const res = await call<any[], Result<{ state: BackendState }>>(route, ...args);
  if (!res.ok) throw new Error(res.error);
  setState(res.state);
  return res.state;
}

export const install = (post: PostLike) => mutate('install', post);
export const uninstall = (id: string) => mutate('uninstall', id);
export const setBoomerang = (id: string, enabled: boolean) => mutate('set_options', id, { boomerang: enabled });
export const setOptions = (
  id: string,
  patch: Partial<
    Pick<InstalledEntry, 'boomerang' | 'fit' | 'screensaver' | 'shuffleExclude' | 'shuffleInclude' | 'tags' | 'title'>
  >,
) => mutate('set_options', id, patch);
export const setMovie = (slot: MovieSlot, id: string) => mutate('set_movie', slot, id);

export interface StorageInfo {
  library: Partial<Record<InstalledEntry['type'], { bytes: number; count: number }>>;
  cache: number;
}

export async function getStorage(): Promise<StorageInfo> {
  const res = await call<[], Result<StorageInfo>>('get_storage');
  if (!res.ok) throw new Error(res.error);
  return res;
}

/** Clears the catalog cache, partial downloads and the preview; returns bytes freed. */
export async function clearCache(): Promise<number> {
  const res = await call<[], Result<{ freed: number }>>('clear_cache');
  if (!res.ok) throw new Error(res.error);
  return res.freed;
}

export const endPreview = () => call<[], unknown>('end_preview').catch(() => {});

/** Point the preview folder at a library video; returns the folder name. */
export async function preparePreview(id: string): Promise<string> {
  const res = await call<[string], Result<{ folder: string }>>('prepare_preview', id);
  if (!res.ok) throw new Error(res.error);
  return res.folder;
}
export const shuffleMovies = () => mutate('shuffle_movies');
export const setMovieOptions = (patch: Partial<Pick<MovieSettings, 'shuffleOnBoot' | 'randomizeEveryMin'>>) =>
  mutate('set_movie_options', patch);

export interface ImportSummary {
  imported: number;
  already: number;
  missing: string[];
  skippedOther: number;
}

export interface AcBackup {
  /** Folder name in ~/Backups. */
  name: string;
  /** Epoch seconds. */
  created: number;
  videos: number;
}

export async function getAcBackups(): Promise<AcBackup[]> {
  const res = await call<[], Result<{ backups: AcBackup[] }>>('get_ac_backups');
  if (!res.ok) throw new Error(res.error);
  return res.backups;
}

export async function backupAnimationChanger(): Promise<AcBackup[]> {
  const res = await call<[], Result<{ backups: AcBackup[] }>>('backup_animation_changer');
  if (!res.ok) throw new Error(res.error);
  return res.backups;
}

export const restoreAcBackup = (name: string) => mutate('restore_ac_backup', name);

export async function deleteAcBackup(name: string): Promise<AcBackup[]> {
  const res = await call<[string], Result<{ backups: AcBackup[] }>>('delete_ac_backup', name);
  if (!res.ok) throw new Error(res.error);
  return res.backups;
}

/** Import Animation Changer's videos and choices (no backup). */
export async function importAnimationChanger(): Promise<ImportSummary> {
  const res = await call<[], Result<ImportSummary & { state: BackendState }>>('import_animation_changer');
  if (!res.ok) throw new Error(res.error);
  setState(res.state);
  return res;
}
export const installClassic = (id: string) => mutate('install_classic', id);
export const setClassicOptions = (id: string, patch: { shuffleInclude?: boolean; color?: string }) =>
  mutate('set_classic_options', id, patch);
/** Batch rotation changes; classic ids are passed as "classic:<id>". */
export const setMany = (ids: string[], patch: { shuffleInclude?: boolean; shuffleExclude?: boolean }) =>
  mutate('set_many', ids, patch);
export const uninstallClassic = (id: string) => mutate('uninstall_classic', id);
export const setGiphyKey = (key: string) => mutate('set_giphy_key', key);
export const installGif = (gif: Pick<GifResult, 'id' | 'title' | 'thumbnail' | 'url' | 'tags'>) => mutate('install_gif', gif);

export async function searchGifs(query: string, offset: number): Promise<{ gifs: GifResult[]; total: number }> {
  const res = await call<[string, number], Result<{ gifs: GifResult[]; total: number }>>('search_gifs', query, offset);
  if (!res.ok) throw new Error(res.error);
  return { gifs: res.gifs, total: res.total };
}
export const setShuffle = (patch: Partial<ShuffleSettings>) => mutate('set_shuffle', patch);
export const setPlayback = (patch: Partial<PlaybackSettings>) => mutate('set_playback', patch);
export const importVideo = (path: string) => mutate('import_video', path);
export const importUrl = (url: string) => mutate('import_url', url);

/** Import new videos from ~/Videos/Deck Animations. */
export async function scanCustomFolder(): Promise<{ added: number; skipped: string[] }> {
  const res = await call<[], Result<{ state: BackendState; added: number; skipped: string[] }>>('scan_custom_folder');
  if (!res.ok) throw new Error(res.error);
  setState(res.state);
  return { added: res.added, skipped: res.skipped };
}

export async function setDisplayPower(on: boolean): Promise<void> {
  const res = await call<[boolean], Result>('set_display_power', on);
  if (!res.ok) throw new Error(res.error);
}

let repoCache: RepoPost[] | null = null;

export async function loadRepo(force = false): Promise<RepoPost[]> {
  if (repoCache && !force) return repoCache;
  const res = await call<[boolean], Result<{ posts: RepoPost[]; stale?: boolean; error?: string }>>('get_repo', force);
  if (!res.ok) throw new Error(res.error);
  if (res.stale) {
    toaster.toast({ title: 'Deck Animations', body: `Showing cached list: ${res.error}` });
  }
  repoCache = res.posts;
  return res.posts;
}
