import { FileSelectionType, openFilePicker, toaster } from '@decky/api';
import {
  ConfirmModal,
  DialogButton,
  ButtonItem,
  Dropdown,
  DropdownItem,
  Focusable,
  ModalRoot,
  Navigation,
  PanelSection,
  PanelSectionRow,
  Spinner,
  Tabs,
  TextField,
  ToggleField,
  showModal,
} from '@decky/ui';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import { FaFilm } from 'react-icons/fa';

import {
  ClassicOptionsModal,
  ImportModal,
  OptionsModal,
  UseAsModal,
  activeSlots,
  useFolder,
  useForSlot,
  useScreensaverChoices,
  previewEntry,
  previewFolder,
  fitsSlot,
  errorText,
  slotsFor,
  toast,
  useAsScreensaver,
  useBusy,
} from './actions';
import {
  importAnimationChanger,
  importVideo,
  installClassic,
  installGif,
  loadRepo,
  refreshState,
  scanCustomFolder,
  searchGifs,
  setGiphyKey,
  setMovie,
  setMany,
  setMovieOptions,
  setShuffle,
  setOptions,
  shuffleMovies,
  uninstall,
  uninstallClassic,
  useBackendState,
} from './backend';
import { AnimationChangerBanner } from './animationChanger';
import { CLASSICS, Classic, classicDescription, classicFolder, classicName } from './classics';
import { CSS, PostCard, PostModal } from './components';
import { t, useLanguage } from './i18n';
import { FinishSection, SettingsPanel, ShuffleSection } from './SettingsPanel';
import { GifResult, InstalledEntry, MOVIE_SLOTS, MovieSlot, PostLike, RepoPost } from './types';

export const MANAGER_ROUTE = '/deck-animations';

type TabId = 'explore' | 'library' | 'rotation' | 'settings';
type ExploreView = 'boot' | 'suspend' | 'classics' | 'gifs';
const EXPLORE_VIEWS: ExploreView[] = ['boot', 'suspend', 'classics', 'gifs'];

// The route can stay mounted between visits, so the requested tab is pushed to
// the live page as well as kept for the next mount.
let requestedTab: TabId = 'explore';
let requestedView: ExploreView = 'boot';
const tabListeners = new Set<() => void>();

/** Open the manager page on a given tab (from the Quick Access menu). */
export function openManager(target: TabId | ExploreView): void {
  if ((EXPLORE_VIEWS as string[]).includes(target)) {
    requestedTab = 'explore';
    requestedView = target as ExploreView;
  } else {
    requestedTab = target as TabId;
  }
  tabListeners.forEach((l) => l());
  Navigation.CloseSideMenus();
  Navigation.Navigate(MANAGER_ROUTE);
}

const Hint: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ color: '#9aa', fontSize: '12px', margin: '0 0 10px' }}>{children}</div>
);

const Toolbar: FC<{ children: React.ReactNode }> = ({ children }) => (
  <Focusable style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '15px 0' }}>{children}</Focusable>
);

const smallButton = { width: 'auto', minWidth: 0, padding: '0 16px', flex: 'none' } as const;

// ---------------------------------------------------------------- steamdeckrepo

const PAGE_SIZE = 30;

enum Sort {
  Downloads = 'downloads',
  Likes = 'likes',
  Newest = 'newest',
  Alpha = 'alpha',
}

const openPost = (post: PostLike) => showModal(<PostModal post={post} />);

/** Renders `items` in pages, loading more as the sentinel scrolls into view. */
const PagedGrid: FC<{ items: PostLike[]; installedIds: Set<string> }> = ({ items, installedIds }) => {
  const [count, setCount] = useState(PAGE_SIZE);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => setCount(PAGE_SIZE), [items]);

  useEffect(() => {
    if (!sentinel.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setCount((c) => Math.min(c + PAGE_SIZE, items.length));
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [items]);

  return (
    <>
      <Focusable className="dss-grid">
        {items.slice(0, count).map((post) => (
          <PostCard key={post.id} post={post} installed={installedIds.has(post.id)} onActivate={() => openPost(post)} />
        ))}
      </Focusable>
      <div ref={sentinel} style={{ height: '1px' }} />
    </>
  );
};

const RepoTab: FC<{ type: 'boot' | 'suspend'; installedIds: Set<string> }> = ({ type, installedIds }) => {
  const [posts, setPosts] = useState<RepoPost[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(Sort.Downloads);

  const load = (force = false) => {
    setPosts(null);
    setError('');
    loadRepo(force)
      .then(setPosts)
      .catch((err) => setError(errorText(err)));
  };

  useEffect(() => load(), []);

  const filtered = useMemo(() => {
    if (!posts) return [];
    const q = query.trim().toLowerCase();
    const out = posts.filter(
      (p) => p.type === type && (!q || p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q)),
    );
    switch (sort) {
      case Sort.Downloads:
        return out.sort((a, b) => b.downloads - a.downloads);
      case Sort.Likes:
        return out.sort((a, b) => b.likes - a.likes);
      case Sort.Newest:
        return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
      case Sort.Alpha:
        return out.sort((a, b) => a.title.localeCompare(b.title));
    }
  }, [posts, query, sort, type]);

  const sortOptions = [
    { data: Sort.Downloads, label: t('repo.sortDownloads') },
    { data: Sort.Likes, label: t('repo.sortLikes') },
    { data: Sort.Newest, label: t('repo.sortNewest') },
    { data: Sort.Alpha, label: t('repo.sortAlpha') },
  ];

  return (
    <div>
      <Toolbar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField
            placeholder={t(`repo.search.${type}`)}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            bShowClearAction
          />
        </div>
        <div style={{ width: '220px', flex: 'none' }}>
          <Dropdown rgOptions={sortOptions} selectedOption={sort} onChange={(o) => setSort(o.data)} />
        </div>
        <DialogButton style={smallButton} onClick={() => load(true)}>
          {t('common.reload')}
        </DialogButton>
      </Toolbar>

      {error && <div style={{ color: '#f66', marginBottom: '12px' }}>{error}</div>}
      {!posts && !error && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <Spinner width={32} height={32} />
        </div>
      )}
      {posts && (
        <>
          <Hint>{t(`repo.count.${type}`, { n: filtered.length })}</Hint>
          <PagedGrid items={filtered} installedIds={installedIds} />
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- classics

const ClassicCard: FC<{ classic: Classic; installed: boolean }> = ({ classic, installed }) => {
  const [busy, run] = useBusy();
  const folder = classicFolder(classic.id);

  return (
    <Focusable className="dss-card dss-classic" flow-children="vertical">
      <div className="dss-thumb" style={{ background: classic.art }}>
        {installed && <span className="dss-tag dss-installed">{t('common.installed')}</span>}
      </div>
      <div className="dss-info">
        <div className="dss-title">{classicName(classic)}</div>
        <div className="dss-desc">{classicDescription(classic)}</div>
        <Focusable className="dss-actions" flow-children="horizontal">
          {!installed ? (
            <DialogButton disabled={busy} onClick={() => void run(() => installClassic(classic.id))}>
              {t('common.install')}
            </DialogButton>
          ) : (
            <>
              <DialogButton disabled={busy} onClick={() => void run(() => useFolder(folder, classicName(classic)))}>
                {t('common.use')}
              </DialogButton>
              <DialogButton
                className="dss-danger"
                disabled={busy}
                onClick={() => void run(() => uninstallClassic(classic.id))}
              >
                {t('common.remove')}
              </DialogButton>
            </>
          )}
        </Focusable>
      </div>
    </Focusable>
  );
};

const ClassicsTab: FC = () => {
  const state = useBackendState();
  return (
    <div>
      <Toolbar>
        <Hint>{t('classics.hint')}</Hint>
      </Toolbar>
      <Focusable className="dss-grid">
        {CLASSICS.map((c) => (
          <ClassicCard key={c.id} classic={c} installed={state.classics.includes(c.id)} />
        ))}
      </Focusable>
    </div>
  );
};

// ---------------------------------------------------------------- GIFs

/** GIPHY id from a pasted link (giphy.com/gifs/…, media/i.giphy.com, embed) or a bare id. */
function parseGiphyLink(text: string): { id: string; title: string } | null {
  const s = text.trim();
  const patterns = [
    /giphy\.com\/gifs\/(?:([\w-]*)-)?([A-Za-z0-9]+)(?:[/?#]|$)/,
    /giphy\.com\/(?:media|embed)\/(?:v1\.[^/]+\/)?([A-Za-z0-9]+)/,
    /i\.giphy\.com\/(?:media\/)?([A-Za-z0-9]+)/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) {
      const id = m[m.length - 1];
      const slug = m.length > 2 ? m[1] : '';
      return { id, title: slug ? slug.replace(/-/g, ' ') : 'GIF' };
    }
  }
  return /^[A-Za-z0-9]{5,40}$/.test(s) ? { id: s, title: 'GIF' } : null;
}

const GifModal: FC<{ gif: GifResult; query: string; closeModal?: () => void }> = ({ gif, query, closeModal }) => {
  useLanguage();
  const state = useBackendState();
  const [busy, run] = useBusy();
  const entry = state.installed.find((e) => e.id === `gif-${gif.id}`);

  const add = (andUse: boolean) =>
    run(async () => {
      const next = await installGif({ ...gif, tags: [...gif.tags, ...(query ? [query] : [])] });
      const added = next.installed.find((e) => e.id === `gif-${gif.id}`);
      if (andUse && added) await useAsScreensaver(added);
      else toast(t('gifs.added'));
      closeModal?.();
    });

  return (
    <ModalRoot closeModal={closeModal}>
      <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
        <img
          src={gif.thumbnail}
          style={{ width: '55%', maxHeight: '300px', objectFit: 'contain', background: '#000', borderRadius: '4px' }}
        />
        <Focusable style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h3 style={{ margin: 0 }}>{gif.title}</h3>
          <div style={{ color: '#9aa', fontSize: '12px' }}>{t('gifs.modalHint')}</div>
          {entry ? (
            <DialogButton disabled={busy} onClick={() => void run(() => useAsScreensaver(entry))}>
              {t('common.usePreview')}
            </DialogButton>
          ) : (
            <>
              <DialogButton disabled={busy} onClick={() => void add(true)}>
                {busy ? t('common.downloading') : t('gifs.addUse')}
              </DialogButton>
              <DialogButton disabled={busy} onClick={() => void add(false)}>
                {t('gifs.add')}
              </DialogButton>
            </>
          )}
        </Focusable>
      </div>
    </ModalRoot>
  );
};

const GiphyKeySetup: FC = () => {
  const [key, setKey] = useState('');
  const [busy, run] = useBusy();
  return (
    <div className="dss-panel">
      <div className="dss-title">{t('gifs.keyTitle')}</div>
      <Hint>{t('gifs.keyHint')}</Hint>
      <Focusable style={{ display: 'flex', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <TextField placeholder={t('gifs.keyPlaceholder')} value={key} onChange={(e) => setKey(e.target.value)} />
        </div>
        <DialogButton
          style={smallButton}
          disabled={busy || !key.trim()}
          onClick={() => void run(() => setGiphyKey(key))}
        >
          {t('gifs.saveKey')}
        </DialogButton>
      </Focusable>
    </div>
  );
};

const GifsTab: FC = () => {
  const state = useBackendState();
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  const [linkBusy, runLink] = useBusy();
  const searchTimer = useRef<number>();
  const installedIds = useMemo(() => new Set(state.installed.map((e) => e.id)), [state.installed]);

  const search = async (q: string, offset: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await searchGifs(q, offset);
      setGifs((prev) => (offset ? [...prev, ...res.gifs] : res.gifs));
      setTotal(res.total);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  // trending on open, then search as you type
  useEffect(() => {
    if (!state.hasGiphyKey) return;
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => void search(query, 0), query ? 600 : 0);
  }, [query, state.hasGiphyKey]);

  const addLink = () =>
    runLink(async () => {
      const parsed = parseGiphyLink(link);
      if (!parsed) throw new Error(t('gifs.badLink'));
      await installGif({ id: parsed.id, title: parsed.title, thumbnail: '', url: link.trim(), tags: parsed.title.split(' ') });
      setLink('');
      toast(t('gifs.added'));
    });

  return (
    <div>
      {!state.hasGiphyKey && <GiphyKeySetup />}

      <Toolbar>
        <div style={{ flex: 1 }}>
          <TextField
            placeholder={t('gifs.linkPlaceholder')}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            bShowClearAction
          />
        </div>
        <DialogButton style={smallButton} disabled={linkBusy || !link.trim()} onClick={() => void addLink()}>
          {linkBusy ? t('gifs.adding') : t('gifs.addLink')}
        </DialogButton>
      </Toolbar>

      {state.hasGiphyKey && (
        <>
          <Toolbar>
            <div style={{ flex: 1 }}>
              <TextField
                placeholder={t('gifs.searchPlaceholder')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                bShowClearAction
              />
            </div>
            <DialogButton
              style={smallButton}
              disabled={linkBusy}
              onClick={() =>
                showModal(
                  <ConfirmModal
                    strTitle={t('gifs.changeKey')}
                    strDescription={t('gifs.changeKeyConfirm')}
                    strOKButtonText={t('gifs.changeKey')}
                    onOK={() => void runLink(() => setGiphyKey(''))}
                  />,
                )
              }
            >
              {t('gifs.changeKey')}
            </DialogButton>
          </Toolbar>
          <Hint>
            {query ? t('gifs.results', { q: query }) : t('gifs.trending')} · {t('gifs.powered')}
          </Hint>
          {error && <div style={{ color: '#f66', marginBottom: '12px' }}>{error}</div>}
          <Focusable className="dss-gif-grid">
            {gifs.map((gif) => (
              <Focusable key={gif.id} className="dss-gif" onActivate={() => showModal(<GifModal gif={gif} query={query.trim()} />)}>
                <img src={gif.thumbnail} loading="lazy" />
                {installedIds.has(`gif-${gif.id}`) && <span className="dss-tag dss-installed">{t('gifs.addedTag')}</span>}
              </Focusable>
            ))}
          </Focusable>
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <Spinner width={28} height={28} />
            </div>
          )}
          {!loading && gifs.length > 0 && gifs.length < total && (
            <Focusable style={{ display: 'flex', justifyContent: 'center', margin: '15px 0' }}>
              <DialogButton style={smallButton} onClick={() => void search(query, gifs.length)}>
                {t('gifs.loadMore')}
              </DialogButton>
            </Focusable>
          )}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- library

const VIDEO_EXTENSIONS = ['webm', 'mp4', 'm4v'];
const LIBRARY_PAGE = 40;
const TOP_TAGS = 14;

type Filter = 'all' | 'screensaver' | 'boot' | 'suspend' | 'custom' | 'gif' | 'classic';
const FILTERS: Filter[] = ['all', 'screensaver', 'boot', 'suspend', 'custom', 'gif', 'classic'];

/** One row of the library: a video/GIF, or an installed generated classic. */
type LibItem = { kind: 'entry'; entry: InstalledEntry } | { kind: 'classic'; classic: Classic };

// type words in both languages, so "gif", "clássico" or "classic" all work
const TYPE_WORDS: Record<InstalledEntry['type'] | 'classic', string> = {
  boot: 'boot',
  suspend: 'suspend suspensão suspensao',
  custom: 'custom personalizado personalizados mine meu meus video vídeo',
  gif: 'gif gifs giphy',
  classic: 'classic classics clássico clássicos classico',
};
const SCREENSAVER_WORDS = 'screensaver proteção protecao tela';

const itemKey = (i: LibItem) => (i.kind === 'entry' ? i.entry.id : `classic-${i.classic.id}`);
const itemTitle = (i: LibItem) => (i.kind === 'entry' ? i.entry.title : classicName(i.classic));
const itemTags = (i: LibItem) => (i.kind === 'entry' ? i.entry.tags ?? [] : []);
const itemIsScreensaver = (i: LibItem) => i.kind === 'classic' || !!i.entry.screensaver;

const matchesFilter = (i: LibItem, f: Filter) =>
  f === 'all'
    ? true
    : f === 'screensaver'
      ? itemIsScreensaver(i)
      : i.kind === 'classic'
        ? f === 'classic'
        : i.entry.type === f;

/** Everything a search can hit: name, author, type words, screensaver words, tags. */
function searchText(i: LibItem): string {
  const parts =
    i.kind === 'entry'
      ? [i.entry.title, i.entry.author, TYPE_WORDS[i.entry.type], t(`type.${i.entry.type}`), ...(i.entry.tags ?? [])]
      : [classicName(i.classic), i.classic.id, TYPE_WORDS.classic, t('type.classic')];
  if (itemIsScreensaver(i)) parts.push(SCREENSAVER_WORDS, t('lib.badgeSs'));
  return parts.join(' ').toLowerCase();
}

/** Every search word must appear somewhere (so "pokemon gif" narrows down). */
const matchesQuery = (i: LibItem, q: string) => {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = searchText(i);
  return words.every((w) => text.includes(w));
};

type BadgeKind = InstalledEntry['type'] | 'classic' | 'ss' | 'slot' | 'muted' | 'tag';

const Badge: FC<{ kind: BadgeKind; children: React.ReactNode }> = ({ kind, children }) => (
  <span className={`dss-badge dss-badge-${kind}`}>{children}</span>
);

/** The second line of a library item: every badge in one consistent style. */
const EntryBadges: FC<{ entry: InstalledEntry }> = ({ entry }) => (
  <div className="dss-badges">
    <Badge kind={entry.type}>{t(`type.${entry.type}`)}</Badge>
    {entry.screensaver && <Badge kind="ss">{t('lib.badgeSs')}</Badge>}
    {activeSlots(entry).map((s) => (
      <Badge key={s} kind="slot">
        {t('lib.inUse', { slot: t(`slotLong.${s}`).split(' (')[0] })}
      </Badge>
    ))}
    {entry.screensaver && entry.boomerang && <Badge kind="muted">{t('common.boomerang')}</Badge>}
    {entry.screensaver && entry.fit && entry.fit !== 'contain' && (
      <Badge kind="muted">{t(`fitBadge.${entry.fit}`)}</Badge>
    )}
    {entry.shuffleExclude && slotsFor(entry).length > 0 && <Badge kind="muted">{t('lib.badgeExcluded')}</Badge>}
    {(entry.tags ?? []).map((tag) => (
      <Badge key={tag} kind="tag">
        #{tag}
      </Badge>
    ))}
  </div>
);

/** Thumbnail that opens the full-screen preview when activated. */
const Thumb: FC<{ src?: string; art?: string; onPreview: () => void }> = ({ src, art, onPreview }) => (
  <Focusable className="dss-thumb-btn" onActivate={onPreview}>
    {src ? (
      <img src={src} loading="lazy" />
    ) : (
      <div className="dss-row-placeholder" style={art ? { background: art } : undefined}>
        {!art && <FaFilm size={28} />}
      </div>
    )}
  </Focusable>
);

const LibraryRow: FC<{ entry: InstalledEntry }> = ({ entry }) => {
  const [busy, run] = useBusy();
  const seconds = entry.videoDuration || entry.duration;
  const preview = () => void run(() => previewEntry(entry));

  return (
    <div className="dss-item">
      <Focusable className="dss-row" flow-children="horizontal">
        <Thumb src={entry.thumbnail} onPreview={preview} />
        <div className="dss-row-info">
          <div className="dss-title">{entry.title}</div>
          {seconds ? <div className="dss-sub">{Math.round(seconds * 10) / 10}s</div> : null}
        </div>
        <DialogButton className="dss-row-btn" disabled={busy} onClick={preview}>
          {t('common.preview')}
        </DialogButton>
        <DialogButton
          className="dss-row-btn"
          disabled={busy}
          onClick={() => void run(() => setOptions(entry.id, { screensaver: !entry.screensaver }))}
        >
          {entry.screensaver ? t('lib.ssOn') : t('lib.ssOff')}
        </DialogButton>
        <DialogButton className="dss-row-btn" disabled={busy} onClick={() => showModal(<UseAsModal id={entry.id} />)}>
          {t('lib.useAs')}
        </DialogButton>
        <DialogButton className="dss-row-btn" disabled={busy} onClick={() => showModal(<OptionsModal id={entry.id} />)}>
          {t('common.options')}
        </DialogButton>
        <DialogButton
          className="dss-row-btn dss-danger"
          disabled={busy}
          onClick={() =>
            showModal(
              <ConfirmModal
                strTitle={t('mine.removeTitle')}
                strDescription={t(entry.type === 'custom' ? 'mine.removeCustom' : 'mine.removeOther', {
                  title: entry.title,
                })}
                strOKButtonText={t('common.remove')}
                onOK={() => void run(() => uninstall(entry.id))}
              />,
            )
          }
        >
          {t('common.remove')}
        </DialogButton>
      </Focusable>
      <EntryBadges entry={entry} />
    </div>
  );
};

const ClassicLibraryRow: FC<{ classic: Classic }> = ({ classic }) => {
  const state = useBackendState();
  const [busy, run] = useBusy();
  return (
    <div className="dss-item">
      <Focusable className="dss-row" flow-children="horizontal">
        <Thumb art={classic.art} onPreview={() => void run(() => previewFolder(classicFolder(classic.id)))} />
        <div className="dss-row-info">
          <div className="dss-title">{classicName(classic)}</div>
        </div>
        <DialogButton
          className="dss-row-btn"
          disabled={busy}
          onClick={() => void run(() => previewFolder(classicFolder(classic.id)))}
        >
          {t('common.preview')}
        </DialogButton>
        <DialogButton
          className="dss-row-btn"
          disabled={busy}
          onClick={() => void run(() => useFolder(classicFolder(classic.id), classicName(classic)))}
        >
          {t('common.use')}
        </DialogButton>
        <DialogButton
          className="dss-row-btn"
          disabled={busy}
          onClick={() => showModal(<ClassicOptionsModal id={classic.id} />)}
        >
          {t('common.options')}
        </DialogButton>
        <DialogButton
          className="dss-row-btn dss-danger"
          disabled={busy}
          onClick={() => void run(() => uninstallClassic(classic.id))}
        >
          {t('common.remove')}
        </DialogButton>
      </Focusable>
      <div className="dss-badges">
        <Badge kind="classic">{t('type.classic')}</Badge>
        <Badge kind="ss">{t('lib.badgeSs')}</Badge>
        {state.classicOptions[classic.id]?.shuffleInclude && <Badge kind="muted">{t('rot.inShuffle')}</Badge>}
      </div>
    </div>
  );
};

const LibraryTab: FC = () => {
  const state = useBackendState();
  const [busy, run] = useBusy();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(LIBRARY_PAGE);

  useEffect(() => setCount(LIBRARY_PAGE), [filter, query]);

  const all: LibItem[] = useMemo(
    () => [
      ...CLASSICS.filter((c) => state.classics.includes(c.id)).map((classic) => ({ kind: 'classic' as const, classic })),
      ...state.installed.map((entry) => ({ kind: 'entry' as const, entry })),
    ],
    [state.installed, state.classics],
  );

  const items = useMemo(
    () =>
      all
        .filter((i) => matchesFilter(i, filter) && matchesQuery(i, query))
        .sort(
          (a, b) =>
            Number(itemIsScreensaver(b)) - Number(itemIsScreensaver(a)) || itemTitle(a).localeCompare(itemTitle(b)),
        ),
    [all, filter, query],
  );

  // most used tags, as one-tap search shortcuts
  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    all.forEach((i) => itemTags(i).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP_TAGS);
  }, [all]);

  const toggleTag = (tag: string) => {
    const words = query.trim().split(/\s+/).filter(Boolean);
    setQuery(words.includes(tag) ? words.filter((w) => w !== tag).join(' ') : [...words, tag].join(' '));
  };

  return (
    <div>
      <Toolbar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField placeholder={t('lib.search')} value={query} onChange={(e) => setQuery(e.target.value)} bShowClearAction />
        </div>
        <DialogButton style={smallButton} onClick={() => showModal(<ImportModal />)}>
          {t('import.button')}
        </DialogButton>
      </Toolbar>
      <Hint>{t('lib.searchHint')}</Hint>
      <Focusable className="dss-chips" flow-children="horizontal">
        {FILTERS.map((f) => (
          <DialogButton key={f} className={f === filter ? 'dss-chip dss-chip-on' : 'dss-chip'} onClick={() => setFilter(f)}>
            {t(`filter.${f}`)} ({all.filter((i) => matchesFilter(i, f)).length})
          </DialogButton>
        ))}
      </Focusable>
      {topTags.length > 0 && (
        <Focusable className="dss-chips" flow-children="horizontal">
          {topTags.map(([tag, n]) => (
            <DialogButton
              key={tag}
              className={query.split(/\s+/).includes(tag) ? 'dss-chip dss-chip-on' : 'dss-chip'}
              onClick={() => toggleTag(tag)}
            >
              #{tag} ({n})
            </DialogButton>
          ))}
        </Focusable>
      )}
      {all.length === 0 ? <Hint>{t('lib.empty')}</Hint> : items.length === 0 && <Hint>{t('lib.emptyFilter')}</Hint>}
      <Focusable style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items
          .slice(0, count)
          .map((i) =>
            i.kind === 'entry' ? (
              <LibraryRow key={itemKey(i)} entry={i.entry} />
            ) : (
              <ClassicLibraryRow key={itemKey(i)} classic={i.classic} />
            ),
          )}
      </Focusable>
      {items.length > count && (
        <Focusable style={{ display: 'flex', justifyContent: 'center', margin: '15px 0' }}>
          <DialogButton style={smallButton} onClick={() => setCount((c) => c + LIBRARY_PAGE)}>
            {t('lib.showMore')} ({items.length - count})
          </DialogButton>
        </Focusable>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- boot & suspend

const DEFAULT_MOVIE = '__steam__';

const MovieSlotRow: FC<{ slot: MovieSlot }> = ({ slot }) => {
  const state = useBackendState();
  const [busy, run] = useBusy();
  const current = state.installed.find((e) => e.id === state.movies[slot]);
  const options = [
    { data: DEFAULT_MOVIE, label: t('movies.default') },
    ...state.installed
      .filter((e) => fitsSlot(e, slot))
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((e) => ({ data: e.id, label: e.title })),
  ];

  return (
    <div className="dss-slot">
      {current?.thumbnail ? (
        <img src={current.thumbnail} />
      ) : (
        <div className="dss-row-placeholder">
          <FaFilm size={28} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <DropdownItem
          label={t(`slotLong.${slot}`)}
          rgOptions={options}
          selectedOption={current ? current.id : DEFAULT_MOVIE}
          disabled={busy}
          onChange={(o) => void run(() => setMovie(slot, o.data === DEFAULT_MOVIE ? '' : (o.data as string)))}
        />
      </div>
    </div>
  );
};


const RandomizeSection: FC<{ note?: string }> = ({ note }) => {
  const state = useBackendState();
  const [busy, run] = useBusy();
  return (
    <PanelSection title={t('rot.randomization')}>
      {note && (
        <PanelSectionRow>
          <Hint>{note}</Hint>
        </PanelSectionRow>
      )}
      <PanelSectionRow>
        <ToggleField
          label={t('movies.shuffleOnBoot')}
          description={t('movies.shuffleOnBootDesc')}
          checked={state.movies.shuffleOnBoot}
          disabled={busy}
          onChange={(v) => void run(() => setMovieOptions({ shuffleOnBoot: v }))}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label={t('movies.every')}
          description={t('movies.everyDesc')}
          rgOptions={[0, 15, 30, 60, 120].map((m) => ({
            data: m,
            label: m === 0 ? t('settings.disabled') : m < 60 ? `${m} min` : `${m / 60} h`,
          }))}
          selectedOption={state.movies.randomizeEveryMin}
          disabled={busy}
          onChange={(o) => void run(() => setMovieOptions({ randomizeEveryMin: o.data as number }))}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await shuffleMovies();
              toast(t('movies.shuffled'));
            })
          }
        >
          {t('movies.shuffleNow')}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
};

/** One row of a rotation list: membership toggle + "use" actions. */
interface RotationItem {
  key: string;
  title: string;
  thumbnail?: string;
  art?: string;
  included: boolean;
  inUse: string[];
  uses: { label: string; fn: () => Promise<unknown> }[];
  preview: () => Promise<unknown>;
  /** Extra on/off buttons, e.g. Boomerang for screensavers. */
  toggles?: { label: string; on: boolean; fn: () => Promise<unknown> }[];
  /** Sequence mode: position in the playlist and moves. */
  position?: number;
  moveUp?: () => Promise<unknown>;
  moveDown?: () => Promise<unknown>;
}

const RotationRow: FC<{ item: RotationItem; onSet: (keys: string[], v: boolean) => Promise<unknown> }> = ({
  item,
  onSet,
}) => {
  const [busy, run] = useBusy();
  return (
    <Focusable className="dss-item dss-row dss-rot-row" flow-children="horizontal">
      {item.position !== undefined && <div className="dss-pos">{item.position}</div>}
      <Thumb src={item.thumbnail} art={item.art} onPreview={() => void run(item.preview)} />
      <div className="dss-row-info">
        <div className="dss-title">{item.title}</div>
        {item.inUse.length > 0 && (
          <div className="dss-badges" style={{ marginTop: '4px' }}>
            {item.inUse.map((label) => (
              <Badge key={label} kind="slot">
                {label}
              </Badge>
            ))}
          </div>
        )}
      </div>
      <DialogButton
        className={item.included ? 'dss-row-btn dss-in' : 'dss-row-btn dss-out'}
        disabled={busy}
        onClick={() => void run(() => onSet([item.key], !item.included))}
      >
        {item.included ? t('rot.in') : t('rot.out')}
      </DialogButton>
      {item.moveUp && (
        <DialogButton className="dss-row-btn dss-move" disabled={busy} onClick={() => void run(item.moveUp!)}>
          ▲
        </DialogButton>
      )}
      {item.moveDown && (
        <DialogButton className="dss-row-btn dss-move" disabled={busy} onClick={() => void run(item.moveDown!)}>
          ▼
        </DialogButton>
      )}
      {item.toggles?.map((tg) => (
        <DialogButton
          key={tg.label}
          className={tg.on ? 'dss-row-btn dss-in' : 'dss-row-btn dss-out'}
          disabled={busy}
          onClick={() => void run(tg.fn)}
        >
          {tg.on ? `${tg.label} ✓` : tg.label}
        </DialogButton>
      ))}
      {item.uses.map((u) => (
        <DialogButton key={u.label} className="dss-row-btn" disabled={busy} onClick={() => void run(u.fn)}>
          {u.label}
        </DialogButton>
      ))}
    </Focusable>
  );
};

const RotationList: FC<{
  title: string;
  items: RotationItem[];
  onSet: (keys: string[], v: boolean) => Promise<unknown>;
}> = ({ title, items, onSet }) => {
  const [busy, run] = useBusy();
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(LIBRARY_PAGE);
  useEffect(() => setCount(LIBRARY_PAGE), [query]);

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = items.filter((i) => words.every((w) => i.title.toLowerCase().includes(w)));
  const included = items.filter((i) => i.included).length;
  // batch actions apply to what the search shows
  const setShown = (v: boolean) => run(() => onSet(shown.map((i) => i.key), v));

  return (
    <div>
      <div className="dss-title" style={{ margin: '20px 0 4px' }}>
        {title}
      </div>
      <Hint>{t('rot.count', { n: included, total: items.length })}</Hint>
      <Toolbar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextField placeholder={t('rot.search')} value={query} onChange={(e) => setQuery(e.target.value)} bShowClearAction />
        </div>
        <DialogButton style={smallButton} disabled={busy || !shown.length} onClick={() => void setShown(true)}>
          {t('rot.all')}
        </DialogButton>
        <DialogButton style={smallButton} disabled={busy || !shown.length} onClick={() => void setShown(false)}>
          {t('rot.none')}
        </DialogButton>
      </Toolbar>
      <Focusable style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {shown.slice(0, count).map((item) => (
          <RotationRow key={item.key} item={item} onSet={onSet} />
        ))}
      </Focusable>
      {shown.length > count && (
        <Focusable style={{ display: 'flex', justifyContent: 'center', margin: '15px 0' }}>
          <DialogButton style={smallButton} onClick={() => setCount((c) => c + LIBRARY_PAGE)}>
            {t('lib.showMore')} ({shown.length - count})
          </DialogButton>
        </Focusable>
      )}
    </div>
  );
};

type RotationView = 'boot' | 'suspend' | 'screensaver';
const ROTATION_VIEWS: RotationView[] = ['boot', 'suspend', 'screensaver'];

const slotLabel = (slot: MovieSlot) => t(`slotLong.${slot}`).split(' (')[0];

/** Boot or suspend: what's in use, how it's randomized, and the pool. */
const MoviePoolView: FC<{ type: 'boot' | 'suspend' }> = ({ type }) => {
  const state = useBackendState();
  const slots: MovieSlot[] = type === 'boot' ? ['boot'] : ['suspend', 'throbber'];
  const items: RotationItem[] = state.installed
    .filter((e) => e.type === type)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((e) => ({
      key: e.id,
      title: e.title,
      thumbnail: e.thumbnail,
      included: !e.shuffleExclude,
      inUse: activeSlots(e).map(slotLabel),
      uses: slots.map((slot) => ({
        label: slots.length > 1 ? t(`rot.use.${slot}`) : t('common.use'),
        fn: () => useForSlot(e, slot),
      })),
      preview: () => previewEntry(e),
    }));

  return (
    <div>
      <div className="dss-title" style={{ margin: '15px 0 8px' }}>
        {t('rot.inUse')}
      </div>
      <Focusable style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {slots.map((slot) => (
          <MovieSlotRow key={slot} slot={slot} />
        ))}
      </Focusable>
      <RandomizeSection note={t('rot.sharedNote')} />
      <RotationList
        title={t(`rot.listTitle.${type}`)}
        items={items}
        onSet={(keys, v) => setMany(keys, { shuffleExclude: !v })}
      />
    </div>
  );
};

/** Screensavers: the active one, Shuffle settings, and who's in Shuffle. */
const ScreensaverPoolView: FC = () => {
  const state = useBackendState();
  const { options, selected, choose, activeFolder } = useScreensaverChoices();
  const activeLabel = t('rot.active');

  const items: RotationItem[] = [
    ...CLASSICS.filter((c) => state.classics.includes(c.id)).map((c) => {
      const folder = classicFolder(c.id);
      return {
        key: `classic:${c.id}`,
        title: `${classicName(c)} · ${t('type.classic')}`,
        art: c.art,
        included: !!state.classicOptions[c.id]?.shuffleInclude,
        inUse: activeFolder === folder ? [activeLabel] : [],
        uses: [{ label: t('common.use'), fn: () => useFolder(folder, classicName(c)) }],
        preview: () => previewFolder(folder),
      };
    }),
    ...state.installed
      .filter((e) => e.screensaver)
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((e) => ({
        key: e.id,
        title: e.title,
        thumbnail: e.thumbnail,
        included: e.shuffleInclude !== false,
        inUse: activeFolder === e.folder ? [activeLabel] : [],
        uses: [{ label: t('common.use'), fn: () => useAsScreensaver(e) }],
        preview: () => previewEntry(e),
        toggles: [
          { label: t('common.boomerang'), on: e.boomerang, fn: () => setOptions(e.id, { boomerang: !e.boomerang }) },
        ],
      })),
  ];

  if (state.shuffle.order === 'sequence') {
    // playlist order: rotation members by their place in the sequence, the rest after them
    const rank = new Map(state.shuffle.sequence.map((key, i) => [key, i]));
    const byRank = (a: RotationItem, b: RotationItem) =>
      (rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity) || a.title.localeCompare(b.title);
    const playing = items.filter((i) => i.included).sort(byRank);
    const rest = items.filter((i) => !i.included);
    const keys = playing.map((i) => i.key);
    const move = (from: number, to: number) => () => {
      const next = keys.slice();
      [next[from], next[to]] = [next[to], next[from]];
      return setShuffle({ sequence: next });
    };
    playing.forEach((item, i) => {
      item.position = i + 1;
      if (i > 0) item.moveUp = move(i, i - 1);
      if (i < playing.length - 1) item.moveDown = move(i, i + 1);
    });
    items.splice(0, items.length, ...playing, ...rest);
  }

  return (
    <div>
      <div className="dss-title" style={{ margin: '15px 0 8px' }}>
        {t('rot.inUse')}
      </div>
      <PanelSection>
        <PanelSectionRow>
          <DropdownItem
            label={t('qam.active')}
            strDefaultLabel={t('qam.choose')}
            rgOptions={options}
            selectedOption={selected}
            onChange={(o) => void choose(o.data as string)}
          />
        </PanelSectionRow>
      </PanelSection>
      <Hint>{t('rot.ssHint')}</Hint>
      <ShuffleSection />
      <FinishSection />
      <RotationList
        title={t('rot.listTitle.screensaver')}
        items={items}
        onSet={(keys, v) => setMany(keys, { shuffleInclude: v })}
      />
    </div>
  );
};

const RotationTab: FC<{ view: RotationView; onView: (v: RotationView) => void }> = ({ view, onView }) => (
  <div>
    <Focusable className="dss-chips dss-subtabs" flow-children="horizontal">
      {ROTATION_VIEWS.map((v) => (
        <DialogButton key={v} className={v === view ? 'dss-chip dss-chip-on' : 'dss-chip'} onClick={() => onView(v)}>
          {t(`rot.${v}`)}
        </DialogButton>
      ))}
    </Focusable>
    {view === 'boot' && <MoviePoolView key="boot" type="boot" />}
    {view === 'suspend' && <MoviePoolView key="suspend" type="suspend" />}
    {view === 'screensaver' && <ScreensaverPoolView />}
  </div>
);

// ---------------------------------------------------------------- page

const ExploreTab: FC<{ view: ExploreView; onView: (v: ExploreView) => void; installedIds: Set<string> }> = ({
  view,
  onView,
  installedIds,
}) => (
  <div>
    <Focusable className="dss-chips dss-subtabs" flow-children="horizontal">
      {EXPLORE_VIEWS.map((v) => (
        <DialogButton key={v} className={v === view ? 'dss-chip dss-chip-on' : 'dss-chip'} onClick={() => onView(v)}>
          {t(`explore.${v}`)}
        </DialogButton>
      ))}
    </Focusable>
    {view === 'boot' && <RepoTab key="boot" type="boot" installedIds={installedIds} />}
    {view === 'suspend' && <RepoTab key="suspend" type="suspend" installedIds={installedIds} />}
    {view === 'classics' && <ClassicsTab />}
    {view === 'gifs' && <GifsTab />}
  </div>
);

/** Tab content with room for Steam's footer bar, which overlaps the page bottom. */
const Padded: FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ paddingBottom: '90px' }}>{children}</div>;

export const ManagerPage: FC = () => {
  useLanguage();
  const state = useBackendState();
  const [tab, setTab] = useState<TabId>(requestedTab);
  const [view, setView] = useState<ExploreView>(requestedView);
  const [rotationView, setRotationView] = useState<RotationView>('boot');
  const installedIds = useMemo(() => new Set(state.installed.map((e) => e.id)), [state.installed]);

  useEffect(() => {
    refreshState().catch((err) => toast(errorText(err)));
    // also follow requests made while this page stays mounted
    const follow = () => {
      setTab(requestedTab);
      setView(requestedView);
    };
    tabListeners.add(follow);
    follow();
    return () => {
      tabListeners.delete(follow);
    };
  }, []);

  // Steam keeps the gamepad-focused element in view and yanks touch scrolling
  // back to it; drop that focus as soon as a finger lands on the page (taps
  // still click: buttons don't need focus for that). Native listener on the
  // page's own window, since it isn't the window this code runs in.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    const doc = root?.ownerDocument;
    if (!root || !doc) return;
    const onTouch = (e: TouchEvent) => {
      if (root.contains(e.target as Node)) (doc.activeElement as HTMLElement | null)?.blur?.();
    };
    doc.addEventListener('touchstart', onTouch, { capture: true, passive: true });
    return () => doc.removeEventListener('touchstart', onTouch, { capture: true });
  }, []);

  const libraryCount = state.installed.length + state.classics.length;

  return (
    <div ref={rootRef} style={{ marginTop: '40px', height: 'calc(100% - 40px)', background: '#0005' }}>
      <style>{CSS}</style>
      <div style={{ padding: '0 2.8vw' }}>
        <AnimationChangerBanner />
      </div>
      <Tabs
        activeTab={tab}
        onShowTab={(id: string) => {
          setTab(id as TabId);
          requestedTab = id as TabId;
        }}
        tabs={[
          {
            id: 'explore',
            title: t('tab.explore'),
            content: (
              <Padded>
                <ExploreTab
                  view={view}
                  onView={(v) => {
                    setView(v);
                    requestedView = v;
                  }}
                  installedIds={installedIds}
                />
              </Padded>
            ),
          },
          { id: 'library', title: t('tab.library', { n: libraryCount }), content: <Padded><LibraryTab /></Padded> },
          {
            id: 'rotation',
            title: t('tab.rotation'),
            content: (
              <Padded>
                <RotationTab view={rotationView} onView={setRotationView} />
              </Padded>
            ),
          },
          { id: 'settings', title: t('tab.settings'), content: <Padded><SettingsPanel /></Padded> },
        ]}
      />
    </div>
  );
};
