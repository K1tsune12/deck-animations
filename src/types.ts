/** A steamdeckrepo.com post, as slimmed down by the backend. */
export interface RepoPost {
  id: string;
  title: string;
  description: string;
  author: string;
  thumbnail: string;
  video: string;
  /** Seconds. */
  duration: number;
  likes: number;
  downloads: number;
  type: 'boot' | 'suspend';
  created_at: string;
  url: string;
}

/** A video installed as a screensaver folder. */
export interface InstalledEntry {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  video: string;
  duration: number;
  type: 'boot' | 'suspend' | 'custom' | 'gif';
  url: string;
  /** Folder name under uioverrides/screensavers (also the name Steam shows). */
  folder: string;
  /** Play forward, then in reverse, in a loop. */
  boomerang: boolean;
  /** 'cover' crops to fill the screen, 'contain' scales to fit, 'none' keeps the original size. */
  fit?: Fit;
  /** Listed in Steam's screensavers (otherwise it only lives in the library). */
  screensaver?: boolean;
  /** Kept in the library but out of everything: Steam's list, the rotation, boot/suspend. */
  disabled?: boolean;
  /** Size when Steam plays it at boot/suspend (unset = the global choice). */
  movieFit?: MovieFit;
  /** Kept out of boot/suspend randomization. */
  shuffleExclude?: boolean;
  /** Part of the Shuffle screensaver (default true for screensavers). */
  shuffleInclude?: boolean;
  /** File name in the library (repo videos predate it: `<id>.webm`). */
  file?: string;
  /** Free-form search tags (GIFs get the search term and GIPHY's words). */
  tags?: string[];
  /** Exact length in seconds, read from the file. */
  videoDuration?: number;
  /** Original path, for videos imported from the Deck. */
  source?: string;
  /** Epoch seconds it joined the library (missing for older entries). */
  addedAt?: number;
}

export interface ShuffleSettings {
  enabled: boolean;
  boomerang: boolean;
  /** Times each video/GIF plays before the next one (boomerang: forward + reverse). */
  playsPerVideo: number;
  /** How long each classic (no natural end) stays on screen. */
  classicSeconds: number;
  /** Random order, or the user's sequence. */
  order: 'random' | 'sequence';
  /** Keys (video ids, "classic:<id>") in the user's order. */
  sequence: string[];
}

export interface PlaybackSettings {
  /** Stop single-video screensavers after `plays` plays. */
  limit: boolean;
  plays: number;
  /** After the last play: fade to black, or also switch the backlight off. */
  after: 'black' | 'off';
  /** Endless screensavers (classics, clocks) end after this many minutes (0 = never). */
  pageMinutes: number;
}

export type DeviceKind = 'handheld' | 'tv';
export type DeviceSetting = 'auto' | DeviceKind;

export interface DeviceInfo {
  setting: DeviceSetting;
  /** What's in effect: the setting, or what was detected for "auto". */
  kind: DeviceKind;
  detected: {
    kind: DeviceKind;
    battery: boolean;
    internalPanel: boolean;
    backlight: boolean;
    vendor: string;
    product: string;
    oled: boolean;
  };
}

/** Per classic/clock options (clock ones only matter for clocks). */
export interface ClassicOptions {
  shuffleInclude?: boolean;
  /** Kept in the library but out of Steam's list and the rotation. */
  disabled?: boolean;
  color?: string;
  color2?: string;
  font?: 'sans' | 'thin' | 'serif' | 'mono';
  size?: 's' | 'm' | 'l' | 'xl';
  hours?: '24' | '12';
  seconds?: boolean;
  date?: boolean;
  /** Brightness in percent (20-100). */
  dim?: number;
  locale?: string;
  /** Slide to a new spot every so often (default), bounce off the edges, wander, or stay pinned. */
  motion?: ClockMotion;
  /** How fast the moving ones go. */
  speed?: ClockSpeed;
  /** Where a pinned clock sits. */
  position?: ClockPosition;
  /** Custom spot, percent of the free space (0 = left/top, 100 = right/bottom). */
  x?: number;
  y?: number;
  /** OLED art only: lay a digital clock over the animation. */
  clock?: boolean;
  /** OLED art only: the overlay clock's colour ("" = the art's main colour). */
  clockColor?: string;
}

export const CLOCK_MOTIONS = ['drift', 'bounce', 'float', 'fixed'] as const;
export type ClockMotion = (typeof CLOCK_MOTIONS)[number];
export const CLOCK_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type ClockSpeed = (typeof CLOCK_SPEEDS)[number];

export const CLOCK_POSITIONS = [
  'center',
  'top-left',
  'top',
  'top-right',
  'left',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
  'custom',
] as const;
export type ClockPosition = (typeof CLOCK_POSITIONS)[number];

export type Fit = 'contain' | 'cover' | 'none' | 'fill';
/** Boot/suspend videos re-encoded to 16:9 for Steam's own player (TV). */
export type MovieFit = 'original' | 'contain' | 'cover' | 'stretch';

export type MovieSlot = 'boot' | 'suspend' | 'throbber';

/** Library ids Steam plays at boot / suspend ("" = Steam's own video). */
export interface MovieSettings {
  boot: string;
  suspend: string;
  throbber: string;
  shuffleOnBoot: boolean;
  /** Also re-pick every N minutes while no game runs (0 = off). */
  randomizeEveryMin: number;
  /** Epoch seconds of the last pick. */
  lastShuffle: number;
  fit?: MovieFit;
}

export const MOVIE_SLOTS: MovieSlot[] = ['boot', 'suspend', 'throbber'];

/** Which library type fits a slot. */
export const SLOT_TYPE: Record<MovieSlot, 'boot' | 'suspend'> = { boot: 'boot', suspend: 'suspend', throbber: 'suspend' };

export interface BackendState {
  installed: InstalledEntry[];
  shuffle: ShuffleSettings;
  playback: PlaybackSettings;
  /** Installed generated screensavers (ids from CLASSICS). */
  classics: string[];
  /** Per installed classic; classics join Shuffle only when shuffleInclude is set. */
  classicOptions: Record<string, ClassicOptions>;
  device: DeviceInfo;
  /** Fit used by videos without their own (cover on a TV, contain on a handheld). */
  defaultFit: Fit;
  hasGiphyKey: boolean;
  movies: MovieSettings;
  /** Animation Changer's settings exist on this Deck (installed or not). */
  animationChangerFound: boolean;
  importedAnimationChanger: boolean;
  shuffleFolder: string;
  screensaversDir: string;
  customDir: string;
}

/** A GIPHY search result. */
export interface GifResult {
  id: string;
  title: string;
  /** Small animated preview (webp). */
  thumbnail: string;
  width: number;
  height: number;
  url: string;
  tags: string[];
}

export type PostLike = RepoPost | InstalledEntry;
