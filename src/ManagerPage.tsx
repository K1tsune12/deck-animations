import { FileSelectionType, openFilePicker, toaster } from '@decky/api';
import {
  ConfirmModal,
  DialogButton,
  ButtonItem,
  Dropdown,
  DropdownItem,
  Focusable,
  Menu,
  MenuItem,
  ModalRoot,
  Navigation,
  PanelSection,
  PanelSectionRow,
  Spinner,
  Tabs,
  TextField,
  ToggleField,
  showContextMenu,
  showModal,
} from '@decky/ui';
import { FC, useEffect, useMemo, useRef, useState } from 'react';
import {
  FaBan,
  FaCheckSquare,
  FaChevronDown,
  FaChevronRight,
  FaEllipsisH,
  FaFilm,
  FaPlayCircle,
  FaRegSquare,
  FaSyncAlt,
  FaTh,
  FaThList,
  FaTv,
} from 'react-icons/fa';

import {
  ClassicOptionsModal,
  ImportModal,
  OptionsModal,
  UseAsModal,
  activeSlots,
  useFolder,
  useForSlot,
  useScreensaverChoices,
  previewClassic,
  previewEntry,
  previewFolder,
  previewMedia,
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
  setOptionsMany,
  shuffleMovies,
  uninstall,
  uninstallClassic,
  uninstallMany,
  uninstallClassics,
  setClassicOptions,
  setClassicOptionsMany,
  getState,
  useBackendState,
} from './backend';
import { AnimationChangerBanner } from './animationChanger';
import {
  ANIMATIONS,
  CLASSICS,
  CLOCKS,
  Classic,
  OLED_ART,
  classicDescription,
  classicFolder,
  classicName,
} from './classics';
import { CSS, PostCard, PostModal } from './components';
import { LiveArt } from './liveArt';
import { t, useLanguage } from './i18n';
import { FinishSection, SettingsPanel, ShuffleSection } from './SettingsPanel';
import { ClassicOptions, Fit, GifResult, InstalledEntry, MOVIE_SLOTS, MovieFit, MovieSlot, PostLike, RepoPost } from './types';
import { useClientSettings } from './clientSettings';
import { folderFromId } from './steam';

export const MANAGER_ROUTE = '/deck-animations';

// Tabs by purpose: what Steam plays at boot/suspend, what becomes a screensaver,
// then what you have (library), how it rotates, and settings.
type TabId = 'movies' | 'screensavers' | 'library' | 'rotation' | 'settings';
type MovieView = 'boot' | 'suspend';
const MOVIE_VIEWS: MovieView[] = ['boot', 'suspend'];
type SsView = 'clocks' | 'art' | 'classics' | 'gifs';
const SS_VIEWS: SsView[] = ['clocks', 'art', 'classics', 'gifs'];

// The route can stay mounted between visits, so the requested tab is pushed to
// the live page as well as kept for the next mount.
let requestedTab: TabId = 'movies';
let requestedMovieView: MovieView = 'boot';
let requestedSsView: SsView = 'clocks';
const tabListeners = new Set<() => void>();

/** Open the manager page on a given tab or section (from the Quick Access menu). */
export function openManager(target: TabId | MovieView | SsView): void {
  if ((MOVIE_VIEWS as string[]).includes(target)) {
    requestedTab = 'movies';
    requestedMovieView = target as MovieView;
  } else if ((SS_VIEWS as string[]).includes(target)) {
    requestedTab = 'screensavers';
    requestedSsView = target as SsView;
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
        <LiveArt id={classic.id} />
        {installed && <span className="dss-tag dss-installed">{t('common.installed')}</span>}
      </div>
      <div className="dss-info">
        <div className="dss-title">{classicName(classic)}</div>
        <div className="dss-desc">{classicDescription(classic)}</div>
        <Focusable className="dss-actions" flow-children="horizontal">
          <DialogButton
            disabled={busy}
            onClick={() => void run(() => (installed ? previewFolder(folder) : previewClassic(classic.id)))}
          >
            {t('common.preview')}
          </DialogButton>
          {!installed ? (
            <DialogButton disabled={busy} onClick={() => void run(() => installClassic(classic.id))}>
              {t('common.install')}
            </DialogButton>
          ) : (
            <>
              <DialogButton disabled={busy} onClick={() => void run(() => useFolder(folder, classicName(classic)))}>
                {t('common.use')}
              </DialogButton>
              {(classic.oled || classic.colors || classic.id === 'rain') && (
                <DialogButton disabled={busy} onClick={() => showModal(<ClassicOptionsModal id={classic.id} />)}>
                  {t('common.options')}
                </DialogButton>
              )}
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

/** A grid of generated screensavers (clocks, OLED art or classics) with a hint on top. */
const ClassicGrid: FC<{ hint: string; items: Classic[] }> = ({ hint, items }) => {
  const state = useBackendState();
  return (
    <div>
      <Hint>{hint}</Hint>
      <Focusable className="dss-grid" flow-children="grid">
        {items.map((c) => (
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
          <DialogButton
            disabled={busy}
            onClick={() => void run(() => (entry ? previewEntry(entry) : previewMedia(gif.full || gif.thumbnail, 'image')))}
          >
            {t('common.previewFull')}
          </DialogButton>
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
const TOP_TAGS = 24;

type Filter = 'all' | 'inuse' | 'screensaver' | 'boot' | 'suspend' | 'gif' | 'custom' | 'classic' | 'oled' | 'disabled';
const FILTERS: Filter[] = ['all', 'inuse', 'screensaver', 'boot', 'suspend', 'gif', 'custom', 'classic', 'oled', 'disabled'];

type LibSort = 'inuse' | 'name' | 'recent';
const LIB_SORTS: LibSort[] = ['inuse', 'name', 'recent'];

/** One item of the library: a video/GIF, or an installed generated screensaver. */
type LibItem = { kind: 'entry'; entry: InstalledEntry } | { kind: 'classic'; classic: Classic };
/** What an item is, for filters, counts and which batch actions apply. */
type ItemKind = InstalledEntry['type'] | 'classic' | 'oled' | 'clock';

// type words in both languages, so "gif", "clássico" or "classic" all work
const TYPE_WORDS: Record<ItemKind, string> = {
  boot: 'boot',
  suspend: 'suspend suspensão suspensao',
  custom: 'custom personalizado personalizados mine meu meus video vídeo',
  gif: 'gif gifs giphy',
  classic: 'classic classics clássico clássicos classico',
  oled: 'oled art arte',
  clock: 'oled clock relógio relogio',
};
const SCREENSAVER_WORDS = 'screensaver proteção protecao tela';

const itemKey = (i: LibItem) => (i.kind === 'entry' ? i.entry.id : `classic-${i.classic.id}`);
const itemTitle = (i: LibItem) => (i.kind === 'entry' ? i.entry.title : classicName(i.classic));
const itemTags = (i: LibItem) => (i.kind === 'entry' ? i.entry.tags ?? [] : []);
const itemKind = (i: LibItem): ItemKind =>
  i.kind === 'entry' ? i.entry.type : i.classic.clock ? 'clock' : i.classic.oled ? 'oled' : 'classic';
const isBootish = (i: LibItem) => i.kind === 'entry' && (i.entry.type === 'boot' || i.entry.type === 'suspend');

/** Library state an item needs that lives outside the item itself. */
interface LibContext {
  activeFolder: string | undefined;
  classicOptions: Record<string, ClassicOptions>;
}

const itemDisabled = (i: LibItem, c: LibContext) =>
  i.kind === 'entry' ? !!i.entry.disabled : !!c.classicOptions[i.classic.id]?.disabled;
const itemIsScreensaver = (i: LibItem, c: LibContext) =>
  !itemDisabled(i, c) && (i.kind === 'classic' || !!i.entry.screensaver);
const itemInRotation = (i: LibItem, c: LibContext) =>
  itemIsScreensaver(i, c) &&
  (i.kind === 'entry' ? i.entry.shuffleInclude !== false : !!c.classicOptions[i.classic.id]?.shuffleInclude);
const itemFolder = (i: LibItem) => (i.kind === 'entry' ? i.entry.folder : classicFolder(i.classic.id));
/** Where it is in use right now: boot/suspend/throbber slots and the active screensaver. */
const itemUses = (i: LibItem, c: LibContext): string[] => [
  ...(i.kind === 'entry' ? activeSlots(i.entry).map((s) => t(`slotLong.${s}`).split(' (')[0]) : []),
  ...(c.activeFolder && itemFolder(i) === c.activeFolder ? [t('qam.screensaver')] : []),
];

const matchesFilter = (i: LibItem, f: Filter, c: LibContext): boolean => {
  const kind = itemKind(i);
  switch (f) {
    case 'all':
      return true;
    case 'inuse':
      return itemUses(i, c).length > 0;
    case 'screensaver':
      return itemIsScreensaver(i, c);
    case 'disabled':
      return itemDisabled(i, c);
    case 'oled':
      return kind === 'oled' || kind === 'clock';
    default:
      return kind === f;
  }
};

/** Everything a search can hit: name, author, type words, screensaver words, tags. */
function searchText(i: LibItem, c: LibContext): string {
  const kind = itemKind(i);
  const parts =
    i.kind === 'entry'
      ? [i.entry.title, i.entry.author, TYPE_WORDS[kind], t(`type.${i.entry.type}`), ...(i.entry.tags ?? [])]
      : [classicName(i.classic), i.classic.id, TYPE_WORDS[kind], t('type.classic')];
  if (itemIsScreensaver(i, c)) parts.push(SCREENSAVER_WORDS, t('lib.badgeSs'));
  return parts.join(' ').toLowerCase();
}

/** Every search word must appear somewhere (so "pokemon gif" narrows down). */
const matchesQuery = (i: LibItem, q: string, c: LibContext) => {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = searchText(i, c);
  return words.every((w) => text.includes(w));
};

type BadgeKind = InstalledEntry['type'] | 'classic' | 'ss' | 'slot' | 'muted' | 'tag';

const Badge: FC<{ kind: BadgeKind; children: React.ReactNode }> = ({ kind, children }) => (
  <span className={`dss-badge dss-badge-${kind}`}>{children}</span>
);

/** Plural, for counts ("3 GIFs"). */
const KIND_LABEL = (k: ItemKind) => (k === 'clock' ? t('oled.clocks') : k === 'oled' ? 'OLED' : t(`filter.${k}`));
/** Singular, for one item's tag ("GIF", "Clássico", "Relógio"). */
const KIND_ONE = (k: ItemKind) => (k === 'clock' ? t('lib.kindClock') : k === 'oled' ? 'OLED' : t(`prefix.${k}`));

/** One quiet line under the title: type, length, and small state icons. */
const ItemMeta: FC<{ item: LibItem; ctx: LibContext }> = ({ item, ctx }) => {
  const seconds = item.kind === 'entry' ? item.entry.videoDuration || item.entry.duration : 0;
  const uses = itemUses(item, ctx);
  return (
    <div className="dss-meta-line">
      <span className={`dss-kind dss-kind-${itemKind(item)}`}>{KIND_ONE(itemKind(item))}</span>
      {seconds ? <span>{Math.round(seconds * 10) / 10}s</span> : null}
      {itemDisabled(item, ctx) ? (
        <span className="dss-st dss-st-off" title={t('lib.badgeOff')}>
          <FaBan /> {t('lib.badgeOff')}
        </span>
      ) : (
        <>
          {uses.length > 0 && (
            <span className="dss-st dss-st-use">
              <FaPlayCircle /> {uses.join(' · ')}
            </span>
          )}
          {itemIsScreensaver(item, ctx) && (
            <span className="dss-st" title={t('lib.badgeSs')}>
              <FaTv />
            </span>
          )}
          {itemInRotation(item, ctx) && (
            <span className="dss-st" title={t('rot.inShuffle')}>
              <FaSyncAlt />
            </span>
          )}
        </>
      )}
    </div>
  );
};

/** Thumbnail that opens the full-screen preview when activated. */
const Thumb: FC<{ src?: string; art?: string; classicId?: string; onPreview: () => void }> = ({ src, art, classicId, onPreview }) => (
  <Focusable className="dss-thumb-btn" onActivate={onPreview}>
    {src ? (
      <img src={src} loading="lazy" />
    ) : (
      <div className="dss-row-placeholder" style={art ? { background: art, position: 'relative', overflow: 'hidden' } : undefined}>
        {!art && <FaFilm size={28} />}
        {classicId && <LiveArt id={classicId} />}
      </div>
    )}
  </Focusable>
);

/** Every per-item action, in one menu (the "⋯" button). */
function showItemMenu(item: LibItem, ctx: LibContext, target: EventTarget | undefined, run: (fn: () => Promise<unknown>) => Promise<void>) {
  const disabled = itemDisabled(item, ctx);
  const items: React.ReactNode[] = [];
  const add = (key: string, label: string, fn: () => void, danger = false) =>
    items.push(
      <MenuItem key={key} onSelected={fn} tone={danger ? 'destructive' : undefined}>
        {label}
      </MenuItem>,
    );

  if (item.kind === 'entry') {
    const e = item.entry;
    if (!disabled) {
      add('use', t('lib.useAs'), () => showModal(<UseAsModal id={e.id} />));
      add('ss', e.screensaver ? t('menu.ssOff') : t('menu.ssOn'), () => void run(() => setOptions(e.id, { screensaver: !e.screensaver })));
      if (e.screensaver)
        add('rot', itemInRotation(item, ctx) ? t('menu.rotOff') : t('menu.rotOn'), () =>
          void run(() => setMany([e.id], { shuffleInclude: !itemInRotation(item, ctx) })),
        );
    }
    add('opts', t('common.options'), () => showModal(<OptionsModal id={e.id} />));
    add('onoff', disabled ? t('batch.enable') : t('batch.disable'), () => void run(() => setOptions(e.id, { disabled: !disabled })));
    add(
      'rm',
      t('common.remove'),
      () =>
        showModal(
          <ConfirmModal
            strTitle={t('mine.removeTitle')}
            strDescription={t(e.type === 'custom' ? 'mine.removeCustom' : 'mine.removeOther', { title: e.title })}
            strOKButtonText={t('common.remove')}
            onOK={() => void run(() => uninstall(e.id))}
          />,
        ),
      true,
    );
  } else {
    const c = item.classic;
    if (!disabled) {
      add('use', t('common.use'), () => void run(() => useFolder(classicFolder(c.id), classicName(c))));
      add('rot', itemInRotation(item, ctx) ? t('menu.rotOff') : t('menu.rotOn'), () =>
        void run(() => setMany([`classic:${c.id}`], { shuffleInclude: !itemInRotation(item, ctx) })),
      );
    }
    add('opts', t('common.options'), () => showModal(<ClassicOptionsModal id={c.id} />));
    add('onoff', disabled ? t('batch.enable') : t('batch.disable'), () => void run(() => setClassicOptions(c.id, { disabled: !disabled })));
    add('rm', t('common.remove'), () => void run(() => uninstallClassic(c.id)), true);
  }

  showContextMenu(<Menu label={itemTitle(item)}>{items}</Menu>, target ?? window);
}

interface Selection {
  selected: boolean;
  onToggle: () => void;
}

/** A library item as a row (list view) or a card (grid view). */
const LibraryItem: FC<{ item: LibItem; ctx: LibContext; grid: boolean; selection?: Selection }> = ({ item, ctx, grid, selection }) => {
  const [busy, run] = useBusy();
  const preview = () =>
    void run(() => (item.kind === 'entry' ? previewEntry(item.entry) : previewFolder(classicFolder(item.classic.id))));
  const thumb = item.kind === 'entry' ? { src: item.entry.thumbnail } : { art: item.classic.art, classicId: item.classic.id };
  const off = itemDisabled(item, ctx);
  const check = selection && (
    <DialogButton
      className={selection.selected ? 'dss-row-btn dss-check dss-check-on' : 'dss-row-btn dss-check'}
      onClick={selection.onToggle}
    >
      {selection.selected ? <FaCheckSquare size={18} /> : <FaRegSquare size={18} />}
    </DialogButton>
  );
  const more = (
    <DialogButton
      className="dss-row-btn dss-more"
      disabled={busy}
      onClick={(e: any) => showItemMenu(item, ctx, e?.currentTarget, run)}
    >
      <FaEllipsisH />
    </DialogButton>
  );
  const previewBtn = (
    <DialogButton className="dss-row-btn" disabled={busy} onClick={preview}>
      {t('common.preview')}
    </DialogButton>
  );
  const classes = ['dss-lib', grid ? 'dss-lib-card' : 'dss-lib-row', selection?.selected ? 'dss-selected' : '', off ? 'dss-off' : '']
    .filter(Boolean)
    .join(' ');

  if (grid)
    // one focus group per card, so the grid moves card to card with left/right;
    // when selecting, the checkbox sits on the thumbnail and the card gets an outline
    return (
      <Focusable className={classes} flow-children="column">
        <div className="dss-card-thumb">
          <Thumb {...thumb} onPreview={selection ? selection.onToggle : preview} />
          {selection && (
            <span className={selection.selected ? 'dss-check-badge dss-check-badge-on' : 'dss-check-badge'}>
              {selection.selected ? <FaCheckSquare size={22} /> : <FaRegSquare size={22} />}
            </span>
          )}
        </div>
        <div className="dss-lib-info">
          <div className="dss-title">{itemTitle(item)}</div>
          <ItemMeta item={item} ctx={ctx} />
        </div>
        <Focusable className="dss-lib-actions" flow-children="row">
          {previewBtn}
          {more}
        </Focusable>
      </Focusable>
    );

  return (
    <Focusable className={classes} flow-children="horizontal">
      {check}
      <Thumb {...thumb} onPreview={selection ? selection.onToggle : preview} />
      <div className="dss-lib-info">
        <div className="dss-title">{itemTitle(item)}</div>
        <ItemMeta item={item} ctx={ctx} />
      </div>
      {previewBtn}
      {more}
    </Focusable>
  );
};

/** "In use now": the active screensaver and the boot/suspend/throbber videos, each switchable in place. */
let inUseOpen = true;
const InUseSection: FC = () => {
  const [open, setOpen] = useState(inUseOpen);
  const { options, selected, choose } = useScreensaverChoices();
  return (
    <div className="dss-panel dss-inuse">
      <Focusable>
        <DialogButton
          className="dss-inuse-head"
          onClick={() => {
            inUseOpen = !open;
            setOpen(!open);
          }}
        >
          {open ? <FaChevronDown /> : <FaChevronRight />} {t('lib.inUseNow')}
        </DialogButton>
      </Focusable>
      {open && (
        <Focusable style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          <DropdownItem
            label={t('qam.screensaver')}
            rgOptions={options}
            selectedOption={selected}
            onChange={(o) => void choose(o.data as string)}
          />
          {MOVIE_SLOTS.map((slot) => (
            <MovieSlotRow key={slot} slot={slot} />
          ))}
        </Focusable>
      )}
    </div>
  );
};

/** Batch actions, built from what is selected: only what applies, with how many it affects. */
const BatchBar: FC<{
  selected: LibItem[];
  all: LibItem[];
  ctx: LibContext;
  onSelectAll: () => void;
  onClear: () => void;
  onDone: () => void;
}> = ({ selected, all, ctx, onSelectAll, onClear, onDone }) => {
  const [busy, run] = useBusy();
  const entries = selected.filter((i): i is { kind: 'entry'; entry: InstalledEntry } => i.kind === 'entry');
  const classics = selected.filter((i): i is { kind: 'classic'; classic: Classic } => i.kind === 'classic');
  const entryIds = entries.map((i) => i.entry.id);
  const classicIds = classics.map((i) => i.classic.id);

  // summary by kind: "3 Boot · 2 GIFs · 1 OLED"
  const kinds = new Map<ItemKind, number>();
  selected.forEach((i) => kinds.set(itemKind(i), (kinds.get(itemKind(i)) ?? 0) + 1));
  const summary = [...kinds.entries()].map(([k, n]) => `${n} ${KIND_LABEL(k)}`).join(' · ');

  const toEnable = selected.filter((i) => itemDisabled(i, ctx));
  const toDisable = selected.filter((i) => !itemDisabled(i, ctx));
  const ssCandidates = entries.filter((i) => !i.entry.disabled);
  const ssOn = ssCandidates.filter((i) => !i.entry.screensaver);
  const ssOff = ssCandidates.filter((i) => i.entry.screensaver);
  const screensavers = selected.filter((i) => itemIsScreensaver(i, ctx));
  const rotOn = screensavers.filter((i) => !itemInRotation(i, ctx));
  const rotOff = screensavers.filter((i) => itemInRotation(i, ctx));
  const bootish = entries.filter((i) => isBootish(i) && !i.entry.disabled);
  const drawOn = bootish.filter((i) => i.entry.shuffleExclude);
  const drawOff = bootish.filter((i) => !i.entry.shuffleExclude);
  const fitTargets = entries.filter((i) => i.entry.screensaver && !i.entry.disabled);
  const rotKeys = (list: LibItem[]) => list.map((i) => (i.kind === 'entry' ? i.entry.id : `classic:${i.classic.id}`));

  const setDisabled = (list: LibItem[], value: boolean) =>
    void run(async () => {
      const e = list.filter((i) => i.kind === 'entry').map((i) => (i as { entry: InstalledEntry }).entry.id);
      const c = list.filter((i) => i.kind === 'classic').map((i) => (i as { classic: Classic }).classic.id);
      if (e.length) await setOptionsMany(e, { disabled: value });
      if (c.length) await setClassicOptionsMany(c, { disabled: value });
    });

  const remove = () => {
    const inUse = selected.flatMap((i) => itemUses(i, ctx).map((u) => `${itemTitle(i)} (${u})`));
    showModal(
      <ConfirmModal
        strTitle={t('batch.removeItems', { n: selected.length })}
        strDescription={[
          selected.slice(0, CONFIRM_LIST).map(itemTitle).join(', ') +
            (selected.length > CONFIRM_LIST ? ` ${t('batch.andMore', { n: selected.length - CONFIRM_LIST })}` : '') +
            '.',
          inUse.length ? t('batch.removeInUse', { list: inUse.join(', ') }) : '',
          t('batch.removeDesc'),
        ]
          .filter(Boolean)
          .join(' ')}
        strOKButtonText={t('common.remove')}
        onOK={() =>
          void run(async () => {
            if (entryIds.length) await uninstallMany(entryIds);
            if (classicIds.length) await uninstallClassics(classicIds);
            onClear();
          })
        }
      />,
    );
  };

  const n = (label: string, list: unknown[]) => `${label} (${list.length})`;
  /** Changes to many items are confirmed first, listing what changes and where. */
  const confirm = (label: string, list: LibItem[], fn: () => void) => {
    if (list.length < CONFIRM_FROM) return fn();
    const names = list.slice(0, CONFIRM_LIST).map(itemTitle);
    const rest = list.length - names.length;
    showModal(
      <ConfirmModal
        strTitle={t('batch.confirmTitle', { action: label, n: list.length })}
        strDescription={`${names.join(', ')}${rest > 0 ? ` ${t('batch.andMore', { n: rest })}` : ''}`}
        strOKButtonText={t('batch.apply')}
        onOK={fn}
      />,
    );
  };
  const btn = (key: string, label: string, list: LibItem[], fn: () => void, extra = '') =>
    list.length > 0 && (
      <DialogButton key={key} className={extra} disabled={busy} onClick={() => confirm(label, list, fn)}>
        {n(label, list)}
      </DialogButton>
    );

  return (
    <div className="dss-batch">
      <Focusable className="dss-batch-line" flow-children="horizontal">
        <span className="dss-batch-count">
          {selected.length ? `${t('batch.count', { n: selected.length })}: ${summary}` : t('batch.noneSelected')}
        </span>
        <DialogButton disabled={busy || selected.length === all.length} onClick={onSelectAll}>
          {t('batch.allN', { n: all.length })}
        </DialogButton>
        <DialogButton disabled={busy || !selected.length} onClick={onClear}>
          {t('batch.clear')}
        </DialogButton>
        <DialogButton disabled={busy} onClick={onDone}>
          {t('batch.done')}
        </DialogButton>
      </Focusable>
      {selected.length > 0 && (
        <Focusable className="dss-batch-line" flow-children="horizontal">
          {btn('en', t('batch.enable'), toEnable, () => setDisabled(toEnable, false))}
          {btn('dis', t('batch.disable'), toDisable, () => setDisabled(toDisable, true))}
          {btn('sson', t('batch.ssOn'), ssOn, () => void run(() => setOptionsMany(ssOn.map((i) => i.entry.id), { screensaver: true })))}
          {btn('ssoff', t('batch.ssOff'), ssOff, () => void run(() => setOptionsMany(ssOff.map((i) => i.entry.id), { screensaver: false })))}
          {btn('roton', t('batch.rotOn'), rotOn, () => void run(() => setMany(rotKeys(rotOn), { shuffleInclude: true })))}
          {btn('rotoff', t('batch.rotOff'), rotOff, () => void run(() => setMany(rotKeys(rotOff), { shuffleInclude: false })))}
          {btn('drawon', t('batch.drawOn'), drawOn, () => void run(() => setMany(rotKeys(drawOn), { shuffleExclude: false })))}
          {btn('drawoff', t('batch.drawOff'), drawOff, () => void run(() => setMany(rotKeys(drawOff), { shuffleExclude: true })))}
          {fitTargets.length > 0 && (
            <div className="dss-batch-drop">
              <Dropdown
                rgOptions={[
                  { data: '', label: t('fit.default', { fit: t(`fit.${getState().defaultFit}`) }) },
                  ...BATCH_FITS.map((f) => ({ data: f, label: t(`fit.${f}`) })),
                ]}
                selectedOption={null}
                strDefaultLabel={n(t('batch.fit'), fitTargets)}
                disabled={busy}
                onChange={(o) =>
                  confirm(`${t('batch.fit')}: ${o.data ? t(`fit.${o.data as Fit}`) : t('fit.default', { fit: '' })}`, fitTargets, () =>
                    void run(() => setOptionsMany(fitTargets.map((i) => i.entry.id), { fit: o.data as Fit | '' })),
                  )
                }
              />
            </div>
          )}
          {bootish.length > 0 && (
            <div className="dss-batch-drop">
              <Dropdown
                rgOptions={[
                  { data: '', label: t('opts.movieFitDefault', { fit: t(`movies.fit.${useBackendStateFit()}`) }) },
                  ...MOVIE_FITS.map((f) => ({ data: f, label: t(`movies.fit.${f}`) })),
                ]}
                selectedOption={null}
                strDefaultLabel={n(t('batch.movieFit'), bootish)}
                disabled={busy}
                onChange={(o) =>
                  confirm(`${t('batch.movieFit')} ${o.data ? t(`movies.fit.${o.data as MovieFit}`) : t('opts.movieFitDefault', { fit: '' })}`, bootish, () =>
                    void run(async () => {
                      await setOptionsMany(
                        bootish.map((i) => i.entry.id),
                        { movieFit: o.data as MovieFit | '' },
                      );
                      toast(t('movies.fitApplied'));
                    }),
                  )
                }
              />
            </div>
          )}
          {selected.length > 0 && (
            <DialogButton className="dss-danger" disabled={busy} onClick={remove}>
              {n(t('common.remove'), selected)}
            </DialogButton>
          )}
        </Focusable>
      )}
    </div>
  );
};

const BATCH_FITS: Fit[] = ['cover', 'contain', 'fill', 'none'];
/** Batch actions on this many items or more ask first. */
const CONFIRM_FROM = 3;
const CONFIRM_LIST = 12;
/** The global boot/suspend size, for the "Default (…)" label. */
const useBackendStateFit = () => getState().movies.fit ?? 'original';

const VIEW_KEY = 'deck-animations-library-view';
let libView: 'list' | 'grid' = (() => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
})();
let libSort: LibSort = 'inuse';

const LibraryTab: FC = () => {
  const state = useBackendState();
  const settings = useClientSettings();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<LibSort>(libSort);
  const [view, setView] = useState<'list' | 'grid'>(libView);
  const [count, setCount] = useState(LIBRARY_PAGE);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const ctx: LibContext = {
    activeFolder: folderFromId(settings?.screensaverCurrentId ?? '') || undefined,
    classicOptions: state.classicOptions,
  };

  // a new filter, search or tag starts a new selection: nothing hidden gets acted on
  useEffect(() => {
    setCount(LIBRARY_PAGE);
    setSelected(new Set());
  }, [filter, query, tag]);

  const all: LibItem[] = useMemo(
    () => [
      ...CLASSICS.filter((c) => state.classics.includes(c.id)).map((classic) => ({ kind: 'classic' as const, classic })),
      ...state.installed.map((entry) => ({ kind: 'entry' as const, entry })),
    ],
    [state.installed, state.classics],
  );

  const items = useMemo(() => {
    const list = all.filter(
      (i) => matchesFilter(i, filter, ctx) && matchesQuery(i, query, ctx) && (!tag || itemTags(i).includes(tag)),
    );
    const byName = (a: LibItem, b: LibItem) => itemTitle(a).localeCompare(itemTitle(b));
    const added = (i: LibItem) => (i.kind === 'entry' ? i.entry.addedAt ?? 0 : 0);
    return list.sort((a, b) =>
      sort === 'name'
        ? byName(a, b)
        : sort === 'recent'
          ? added(b) - added(a) || byName(a, b)
          : Number(itemUses(b, ctx).length > 0) - Number(itemUses(a, ctx).length > 0) ||
            Number(itemIsScreensaver(b, ctx)) - Number(itemIsScreensaver(a, ctx)) ||
            byName(a, b),
    );
    // ctx changes with the active screensaver and the classic options
  }, [all, filter, query, tag, sort, ctx.activeFolder, state.classicOptions]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    all.forEach((i) => itemTags(i).forEach((tg) => counts.set(tg, (counts.get(tg) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, TOP_TAGS);
  }, [all]);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const selectedItems = items.filter((i) => selected.has(itemKey(i)));

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
      <InUseSection />
      <Focusable className="dss-chips" flow-children="horizontal">
        {FILTERS.map((f) => {
          const n = all.filter((i) => matchesFilter(i, f, ctx)).length;
          if (!n && f !== 'all' && f !== filter) return null;
          return (
            <DialogButton key={f} className={f === filter ? 'dss-chip dss-chip-on' : 'dss-chip'} onClick={() => setFilter(f)}>
              {f === 'oled' ? 'OLED' : t(`filter.${f}`)} ({n})
            </DialogButton>
          );
        })}
      </Focusable>
      <Focusable className="dss-libbar" flow-children="horizontal">
        <div className="dss-libbar-drop">
          <Dropdown
            rgOptions={LIB_SORTS.map((s) => ({ data: s, label: t(`lib.sort.${s}`) }))}
            selectedOption={sort}
            onChange={(o) => {
              libSort = o.data as LibSort;
              setSort(libSort);
            }}
          />
        </div>
        {tags.length > 0 && (
          <div className="dss-libbar-drop">
            <Dropdown
              rgOptions={[
                { data: '', label: t('lib.tagsAll') },
                ...tags.map(([tg, n]) => ({ data: tg, label: `#${tg} (${n})` })),
              ]}
              selectedOption={tag}
              onChange={(o) => setTag(o.data as string)}
            />
          </div>
        )}
        <DialogButton
          className="dss-icon-btn"
          onClick={() => {
            libView = view === 'list' ? 'grid' : 'list';
            try {
              localStorage.setItem(VIEW_KEY, libView);
            } catch {
              // only a convenience
            }
            setView(libView);
          }}
        >
          {view === 'list' ? <FaTh /> : <FaThList />} {view === 'list' ? t('lib.viewGrid') : t('lib.viewList')}
        </DialogButton>
        {all.length > 0 && !selecting && (
          <DialogButton className="dss-icon-btn" onClick={() => setSelecting(true)}>
            <FaCheckSquare /> {t('batch.select')}
          </DialogButton>
        )}
      </Focusable>
      {selecting && (
        <BatchBar
          selected={selectedItems}
          all={items}
          ctx={ctx}
          onSelectAll={() => setSelected(new Set(items.map(itemKey)))}
          onClear={() => setSelected(new Set())}
          onDone={stopSelecting}
        />
      )}
      {all.length === 0 ? <Hint>{t('lib.empty')}</Hint> : items.length === 0 && <Hint>{t('lib.emptyFilter')}</Hint>}
      <Focusable
        className={view === 'grid' ? 'dss-lib-grid' : 'dss-lib-list'}
        flow-children={view === 'grid' ? 'grid' : 'column'}
        onCancelButton={selecting ? () => stopSelecting() : undefined}
        onCancelActionDescription={selecting ? t('batch.leave') : undefined}
      >
        {items.slice(0, count).map((i) => (
          <LibraryItem
            key={itemKey(i)}
            item={i}
            ctx={ctx}
            grid={view === 'grid'}
            selection={selecting ? { selected: selected.has(itemKey(i)), onToggle: () => toggle(itemKey(i)) } : undefined}
          />
        ))}
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
      .filter((e) => fitsSlot(e, slot) && !e.disabled)
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


const MOVIE_FITS: MovieFit[] = ['original', 'contain', 'cover', 'stretch'];

/** Steam's own player crops a 16:10 video on a 16:9 TV: re-encode the chosen ones. */
const MovieFitRow: FC = () => {
  const state = useBackendState();
  const [busy, run] = useBusy();
  return (
    <PanelSection title={t('movies.fit')}>
      <PanelSectionRow>
        <DropdownItem
          label={t('movies.fit')}
          description={t(state.device.kind === 'tv' ? 'movies.fitDescTv' : 'movies.fitDesc')}
          rgOptions={MOVIE_FITS.map((f) => ({ data: f, label: t(`movies.fit.${f}`) }))}
          selectedOption={state.movies.fit ?? 'original'}
          disabled={busy}
          onChange={(o) =>
            void run(async () => {
              await setMovieOptions({ fit: o.data as MovieFit });
              toast(t('movies.fitApplied'));
            })
          }
        />
      </PanelSectionRow>
    </PanelSection>
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
  /** A generated screensaver: its thumbnail runs the real animation. */
  classicId?: string;
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

const RotationRow: FC<{ item: RotationItem; onSet: (keys: string[], v: boolean) => Promise<unknown>; grid?: boolean }> = ({
  item,
  onSet,
  grid,
}) => {
  const [busy, run] = useBusy();
  if (grid)
    return (
      <Focusable className={item.included ? 'dss-lib dss-lib-card dss-selected' : 'dss-lib dss-lib-card'} flow-children="column">
        <div className="dss-card-thumb">
          <Thumb src={item.thumbnail} art={item.art} classicId={item.classicId} onPreview={() => void run(item.preview)} />
          <span className={item.included ? 'dss-check-badge dss-check-badge-on' : 'dss-check-badge'}>
            {item.included ? <FaCheckSquare size={22} /> : <FaRegSquare size={22} />}
          </span>
        </div>
        <div className="dss-lib-info">
          <div className="dss-title">{item.title}</div>
          {item.inUse.length > 0 && (
            <div className="dss-meta-line">
              <span className="dss-st dss-st-use">
                <FaPlayCircle /> {item.inUse.join(' · ')}
              </span>
            </div>
          )}
        </div>
        <Focusable className="dss-lib-actions" flow-children="row">
          <DialogButton
            className={item.included ? 'dss-row-btn dss-in' : 'dss-row-btn dss-out'}
            disabled={busy}
            onClick={() => void run(() => onSet([item.key], !item.included))}
          >
            {item.included ? t('rot.in') : t('rot.add')}
          </DialogButton>
          {item.uses.map((u) => (
            <DialogButton key={u.label} className="dss-row-btn" disabled={busy} onClick={() => void run(u.fn)}>
              {u.label}
            </DialogButton>
          ))}
        </Focusable>
      </Focusable>
    );
  return (
    <Focusable className="dss-lib dss-lib-row dss-rot-row" flow-children="horizontal">
      {item.position !== undefined && <div className="dss-pos">{item.position}</div>}
      <Thumb src={item.thumbnail} art={item.art} classicId={item.classicId} onPreview={() => void run(item.preview)} />
      <div className="dss-lib-info">
        <div className="dss-title">{item.title}</div>
        {item.inUse.length > 0 && (
          <div className="dss-meta-line">
            <span className="dss-st dss-st-use">
              <FaPlayCircle /> {item.inUse.join(' · ')}
            </span>
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
  const [view, setView] = useState<'list' | 'grid'>(libView);
  useEffect(() => setCount(LIBRARY_PAGE), [query]);
  // the playlist order (up/down arrows) only makes sense as a list
  const sequence = items.some((i) => i.moveUp || i.moveDown);
  const grid = view === 'grid' && !sequence;

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
        {!sequence && (
          <DialogButton
            className="dss-icon-btn"
            style={smallButton}
            onClick={() => {
              libView = view === 'list' ? 'grid' : 'list';
              try {
                localStorage.setItem(VIEW_KEY, libView);
              } catch {
                // only a convenience
              }
              setView(libView);
            }}
          >
            {view === 'list' ? <FaTh /> : <FaThList />} {view === 'list' ? t('lib.viewGrid') : t('lib.viewList')}
          </DialogButton>
        )}
      </Toolbar>
      <Focusable className={grid ? 'dss-lib-grid' : 'dss-lib-list'} flow-children={grid ? 'grid' : 'column'}>
        {shown.slice(0, count).map((item) => (
          <RotationRow key={item.key} item={item} onSet={onSet} grid={grid} />
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
      <MovieFitRow />
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
        title: `${classicName(c)} · ${t(c.oled ? 'type.oled' : 'type.classic')}`,
        art: c.art,
        classicId: c.id,
        included: !!state.classicOptions[c.id]?.shuffleInclude,
        inUse: activeFolder === folder ? [activeLabel] : [],
        uses: [{ label: t('common.use'), fn: () => useFolder(folder, classicName(c)) }],
        preview: () => previewFolder(folder),
      };
    }),
    ...state.installed
      .filter((e) => e.screensaver && !e.disabled)
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

/** Sub-sections of a tab, as chips. */
function SubTabs<V extends string>({
  views,
  view,
  onView,
  label,
}: {
  views: V[];
  view: V;
  onView: (v: V) => void;
  label: (v: V) => string;
}) {
  return (
    <Focusable className="dss-chips dss-subtabs" flow-children="horizontal">
      {views.map((v) => (
        <DialogButton key={v} className={v === view ? 'dss-chip dss-chip-on' : 'dss-chip'} onClick={() => onView(v)}>
          {label(v)}
        </DialogButton>
      ))}
    </Focusable>
  );
}

/** Boot & suspend: the steamdeckrepo catalog. */
const MoviesTab: FC<{ view: MovieView; onView: (v: MovieView) => void; installedIds: Set<string> }> = ({
  view,
  onView,
  installedIds,
}) => (
  <div>
    <SubTabs views={MOVIE_VIEWS} view={view} onView={onView} label={(v) => t(`explore.${v}`)} />
    {view === 'boot' && <RepoTab key="boot" type="boot" installedIds={installedIds} />}
    {view === 'suspend' && <RepoTab key="suspend" type="suspend" installedIds={installedIds} />}
  </div>
);

/** Screensavers: everything that becomes one, in one place. */
const ScreensaversTab: FC<{ view: SsView; onView: (v: SsView) => void }> = ({ view, onView }) => (
  <div>
    <SubTabs
      views={SS_VIEWS}
      view={view}
      onView={onView}
      label={(v) => (v === 'clocks' ? t('oled.clocks') : v === 'art' ? t('ss.art') : t(`explore.${v}`))}
    />
    {view === 'clocks' && <ClassicGrid hint={`${t('oled.hint')} ${t('oled.clocksHint')}`} items={CLOCKS} />}
    {view === 'art' && <ClassicGrid hint={`${t('oled.hint')} ${t('oled.artHint')}`} items={OLED_ART} />}
    {view === 'classics' && <ClassicGrid hint={t('classics.hint')} items={ANIMATIONS} />}
    {view === 'gifs' && <GifsTab />}
  </div>
);

/** Tab content with room for Steam's footer bar, which overlaps the page bottom. */
const Padded: FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ paddingBottom: '90px' }}>{children}</div>;

export const ManagerPage: FC = () => {
  useLanguage();
  const state = useBackendState();
  const [tab, setTab] = useState<TabId>(requestedTab);
  const [movieView, setMovieView] = useState<MovieView>(requestedMovieView);
  const [ssView, setSsView] = useState<SsView>(requestedSsView);
  const [rotationView, setRotationView] = useState<RotationView>('boot');
  const installedIds = useMemo(() => new Set(state.installed.map((e) => e.id)), [state.installed]);

  useEffect(() => {
    refreshState().catch((err) => toast(errorText(err)));
    // also follow requests made while this page stays mounted
    const follow = () => {
      setTab(requestedTab);
      setMovieView(requestedMovieView);
      setSsView(requestedSsView);
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
    // Steam keeps the gamepad-focused element scrolled into view: with a row
    // focused far down the list, touch or wheel scrolling snaps right back to
    // it. Dropping the focus while the pointer is used lets the page scroll.
    const release = (e: Event) => {
      if (root.contains(e.target as Node)) (doc.activeElement as HTMLElement | null)?.blur?.();
    };
    doc.addEventListener('touchstart', release, { capture: true, passive: true });
    doc.addEventListener('wheel', release, { capture: true, passive: true });
    return () => {
      doc.removeEventListener('touchstart', release, { capture: true });
      doc.removeEventListener('wheel', release, { capture: true });
    };
  }, []);

  const libraryCount = state.installed.length + state.classics.length;

  return (
    <div ref={rootRef} className="dss-root" style={{ marginTop: '40px', height: 'calc(100% - 40px)', background: '#0005' }}>
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
            id: 'movies',
            title: t('tab.movies'),
            content: (
              <Padded>
                <MoviesTab
                  view={movieView}
                  onView={(v) => {
                    setMovieView(v);
                    requestedMovieView = v;
                  }}
                  installedIds={installedIds}
                />
              </Padded>
            ),
          },
          {
            id: 'screensavers',
            title: t('tab.screensavers'),
            content: (
              <Padded>
                <ScreensaversTab
                  view={ssView}
                  onView={(v) => {
                    setSsView(v);
                    requestedSsView = v;
                  }}
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
