"""Deck Animations backend (formerly "Decky Screensavers"): boot, suspend and
screensaver videos for the Steam Deck, from steamdeckrepo.com, GIPHY, generated
classics and your own files.

Steam lists every folder under <steam>/config/uioverrides/screensavers/ that has
an index.html as "<folder> (User Created)". Each installed video gets its own
folder with the bundled player page; the shuffle folder hardlinks every video
so it costs no extra disk space.
"""

import hashlib
import json
import os
import random
import re
import shutil
import ssl
import struct
import time
from urllib.parse import unquote

import aiohttp
import decky

try:
    import certifi

    _SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL_CTX = ssl.create_default_context()

REPO_URL = "https://steamdeckrepo.com/api/posts/all"
DOWNLOAD_URL = "https://steamdeckrepo.com/post/download/{id}"
REPO_TTL_SEC = 6 * 3600  # the API rate-limits; the full list rarely changes

_PLUGIN_DIR = os.environ.get("DECKY_PLUGIN_DIR") or os.path.dirname(os.path.abspath(__file__))
_PLAYER_DIR = os.path.join(_PLUGIN_DIR, "assets", "player")
_PLAYER_FILES = ("index.html", "player.js", "main.css")
_CLASSICS_DIR = os.path.join(_PLUGIN_DIR, "assets", "classics")
CLASSICS = ("polygons", "starfield", "pipes", "rain", "bubbles", "curves")
_CLASSIC_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <title>Decky Screensaver</title>
    <link rel="stylesheet" href="common.css" />
    <script src="common.js"></script>
    <script src="config.js"></script>
    <script src="main.js" defer></script>
</head>
<body></body>
</html>
"""

GIPHY_API = "https://api.giphy.com/v1/gifs/{endpoint}"
GIPHY_MP4 = "https://media.giphy.com/media/{id}/giphy.mp4"
_GIPHY_ID_RE = re.compile(r"^[A-Za-z0-9]{5,40}$")

SCREENSAVERS_DIR = os.path.join(decky.DECKY_USER_HOME, ".steam", "root", "config", "uioverrides", "screensavers")
VIDEOS_DIR = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "videos")
REPO_CACHE = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "repo.json")
STATE_PATH = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "state.json")
CUSTOM_DIR = os.path.join(decky.DECKY_USER_HOME, "Videos", "Deck Animations")
_OLD_CUSTOM_DIR = os.path.join(decky.DECKY_USER_HOME, "Videos", "Screensavers")
# the plugin was called "Decky Screensavers"; Decky names data/settings dirs after it
_OLD_PLUGIN_NAME = "Decky Screensavers"

# Boot/suspend videos: Steam plays these overrides instead of its own movies.
MOVIES_DIR = os.path.join(decky.DECKY_USER_HOME, ".steam", "root", "config", "uioverrides", "movies")
MOVIE_FILES = {
    "boot": "deck_startup.webm",
    "suspend": "steam_os_suspend.webm",
    "throbber": "steam_os_suspend_from_throbber.webm",
}
SLOT_TYPE = {"boot": "boot", "suspend": "suspend", "throbber": "suspend"}

# Animation Changer (the plugin this one can import from). Decky names a
# plugin's data/settings dirs after its folder in ~/homebrew/plugins.
AC_NAME = "Animation Changer"
DECKY_HOME = os.environ.get("DECKY_HOME") or os.path.dirname(os.path.dirname(decky.DECKY_PLUGIN_RUNTIME_DIR))
BACKUP_DIR = os.path.join(decky.DECKY_USER_HOME, "Backups")
# what Steam's CEF on the Deck plays: WebM (VP8/VP9/AV1) and MP4 (H.264/HEVC/AV1/VP9)
CUSTOM_EXTS = (".webm", ".mp4", ".m4v")

SHUFFLE_FOLDER = "deck-animations-rotation"
PREVIEW_FOLDER = "decky-preview"  # holds whatever the Preview button shows
FITS = ("contain", "cover", "none")
# earlier names of the rotation folder ("Decky Shuffle" broke Steam's host mapping)
_OLD_SHUFFLE_FOLDERS = ("Decky Shuffle", "decky-shuffle")
MARKER = ".decky-screensavers"  # kept from the old name so existing folders stay ours

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
_MAX_URL_BYTES = 1 << 30
_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
_FOLDER_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,50}[a-z0-9])?$")
_WEBM_MAGIC = b"\x1a\x45\xdf\xa3"  # EBML header

BACKLIGHT_DIR = "/sys/class/backlight"
_BL_UNBLANK, _BL_POWERDOWN = "0", "4"  # FB_BLANK_* values for bl_power
_DISPLAY_OFF_FLAG = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, "display-off")

_state = {
    "installed": {},
    # videos/GIFs play playsPerVideo times; classics (endless) run classicSeconds
    # order: "random" or "sequence" (the user's order, keys in "sequence": video ids / "classic:<id>")
    "shuffle": {
        "enabled": False,
        "boomerang": False,
        "playsPerVideo": 2,
        "classicSeconds": 60,
        "order": "random",
        "sequence": [],
    },
    # plays: stop single-video screensavers after this many plays (0 = loop forever)
    "playback": {"limit": False, "plays": 3, "after": "black"},
    "classics": [],
    # per classic: {"shuffleInclude": bool}; classics join Shuffle only when asked
    "classicOptions": {},
    "giphyKey": "",
    # library ids used as boot/suspend/throbber videos ("" = Steam's default)
    # randomizeEveryMin: also re-pick every N minutes (0 = off); lastShuffle: epoch seconds
    "movies": {"boot": "", "suspend": "", "throbber": "", "shuffleOnBoot": False, "randomizeEveryMin": 0, "lastShuffle": 0},
    "importedAnimationChanger": False,
    "lastBootId": "",
}
_repo = {"fetched_at": 0, "posts": []}


def _load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _save_state():
    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(_state, f, indent=2)
    os.replace(tmp, STATE_PATH)


def _slim(post):
    """Keep only what the frontend needs from a steamdeckrepo post."""
    return {
        "id": post["id"],
        "title": post.get("title") or post["id"],
        "description": post.get("content") or "",
        "author": (post.get("user") or {}).get("steam_name") or "",
        "thumbnail": post.get("thumbnail") or "",
        "video": post.get("video") or "",
        "duration": post.get("video_duration") or 0,
        "likes": post.get("likes") or 0,
        "downloads": post.get("downloads") or 0,
        "type": "suspend" if post.get("type") == "suspend_video" else "boot",
        "created_at": post.get("created_at") or "",
        "url": post.get("url") or "",
    }


def _folder_name(title, video_id):
    """A folder name that isn't taken. Steam serves each screensaver from
    https://uioverride-<folder>.steamscreensavers.host, so the name must be a
    valid DNS label: lowercase letters, digits and hyphens, short enough to
    stay under 63 characters with the prefix."""
    name = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    if len(name) > 40:
        cut = name[:41]
        name = cut[: cut.rfind("-")] if "-" in cut else name[:40]
    name = name.strip("-") or video_id.lower()
    used = {entry["folder"] for entry in _state["installed"].values() if entry["id"] != video_id}
    used.add(SHUFFLE_FOLDER)
    candidate = name
    if candidate in used or (
        os.path.exists(os.path.join(SCREENSAVERS_DIR, candidate))
        and not os.path.exists(os.path.join(SCREENSAVERS_DIR, candidate, MARKER))
    ):
        candidate = f"{name}-{video_id.lower()}"
    return candidate


def _link_or_copy(src, dst):
    if os.path.lexists(dst):
        os.remove(dst)
    try:
        os.link(src, dst)
    except OSError:
        shutil.copyfile(src, dst)


def _own_tree(path):
    """The backend runs as root (for the backlight); hand files in the user's
    home back to the user so Steam and the user can manage them."""
    if getattr(os, "geteuid", lambda: -1)() != 0:
        return
    st = os.stat(decky.DECKY_USER_HOME)
    for root, dirs, files in os.walk(path):
        for name in [root] + [os.path.join(root, n) for n in dirs + files]:
            try:
                os.chown(name, st.st_uid, st.st_gid)
            except OSError:
                pass


def _write_player(folder, config):
    """(Re)write the player page into a screensaver folder."""
    path = os.path.join(SCREENSAVERS_DIR, folder)
    os.makedirs(path, exist_ok=True)
    for name in _PLAYER_FILES:
        shutil.copyfile(os.path.join(_PLAYER_DIR, name), os.path.join(path, name))
    with open(os.path.join(path, "config.js"), "w", encoding="utf-8") as f:
        f.write(f"window.SCREENSAVER_CONFIG = {json.dumps(config)};\n")
    with open(os.path.join(path, MARKER), "w", encoding="utf-8") as f:
        f.write("Managed by the Deck Animations plugin.\n")
    return path


def _webm_duration(path):
    """Seconds from the WebM Segment Info (TimecodeScale 0x2AD7B1, Duration 0x4489)."""
    try:
        with open(path, "rb") as f:
            head = f.read(256 * 1024)
    except OSError:
        return 0.0
    scale = 1_000_000  # default: millisecond ticks
    i = head.find(b"\x2a\xd7\xb1")
    if i >= 0 and head[i + 3] & 0x80:
        size = head[i + 3] & 0x7F
        scale = int.from_bytes(head[i + 4 : i + 4 + size], "big") or scale
    i = head.find(b"\x44\x89")
    while i >= 0 and i + 11 <= len(head):
        if head[i + 2] == 0x84:
            return struct.unpack(">f", head[i + 3 : i + 7])[0] * scale / 1e9
        if head[i + 2] == 0x88:
            return struct.unpack(">d", head[i + 3 : i + 11])[0] * scale / 1e9
        i = head.find(b"\x44\x89", i + 1)
    return 0.0


def _mp4_duration(path):
    """Seconds from the MP4 movie header (moov/mvhd), wherever moov sits."""
    try:
        with open(path, "rb") as f:
            end = os.fstat(f.fileno()).st_size
            pos = 0
            while pos + 8 <= end:
                f.seek(pos)
                size, kind = struct.unpack(">I4s", f.read(8))
                header = 8
                if size == 1:
                    size = struct.unpack(">Q", f.read(8))[0]
                    header = 16
                elif size == 0:
                    size = end - pos
                if kind == b"moov":
                    moov = f.read(min(size - header, 4 << 20))
                    i = moov.find(b"mvhd")
                    if i < 0:
                        return 0.0
                    body = moov[i + 4 :]
                    if body[0] == 1:  # version 1: 64-bit times
                        scale, duration = struct.unpack(">IQ", body[20:32])
                    else:
                        scale, duration = struct.unpack(">II", body[12:20])
                    return duration / scale if scale else 0.0
                if size < header:
                    return 0.0
                pos += size
    except (OSError, struct.error, IndexError):
        pass
    return 0.0


def _video_kind(path):
    """'webm' or 'mp4' from the file's magic bytes, else None."""
    try:
        with open(path, "rb") as f:
            head = f.read(12)
    except OSError:
        return None
    if head[:4] == _WEBM_MAGIC:
        return "webm"
    if head[4:8] == b"ftyp":
        return "mp4"
    return None


def _video_duration(path):
    return _mp4_duration(path) if path.endswith(".mp4") else _webm_duration(path)


def _video_file(video_id):
    """File name of a video in VIDEOS_DIR (repo videos predate the field)."""
    return _state["installed"][video_id].get("file") or video_id + ".webm"


def _video_path(video_id):
    return os.path.join(VIDEOS_DIR, _video_file(video_id))


def _plays():
    playback = _state["playback"]
    return playback["plays"] if playback["limit"] else 0


def _sync_entry(video_id):
    """Create or remove a library video's screensaver folder to match its flag."""
    entry = _state["installed"][video_id]
    if entry.get("screensaver", True):
        _write_single(video_id)
    else:
        _remove_folder(entry["folder"])


def _write_single(video_id):
    entry = _state["installed"][video_id]
    name = "video" + os.path.splitext(_video_file(video_id))[1]
    config = {
        "mode": "single",
        "videos": [name],
        "fits": [entry.get("fit", "contain")],
        "boomerang": entry["boomerang"],
        "plays": _plays(),
    }
    path = _write_player(entry["folder"], config)
    _link_or_copy(_video_path(video_id), os.path.join(path, name))
    _own_tree(path)


def _set_backlight(on):
    """Blank or unblank every panel backlight. Needs root (plugin flag)."""
    names = os.listdir(BACKLIGHT_DIR)
    if not names:
        raise RuntimeError("no backlight device found")
    for name in names:
        with open(os.path.join(BACKLIGHT_DIR, name, "bl_power"), "w", encoding="ascii") as f:
            f.write(_BL_UNBLANK if on else _BL_POWERDOWN)
    decky.logger.info(f"display {'on' if on else 'off'} ({', '.join(names)})")
    if on:
        if os.path.exists(_DISPLAY_OFF_FLAG):
            os.remove(_DISPLAY_OFF_FLAG)
    else:
        with open(_DISPLAY_OFF_FLAG, "w", encoding="ascii") as f:
            f.write("1")


def _remove_folder(folder):
    path = os.path.join(SCREENSAVERS_DIR, folder)
    # never touch folders we didn't create
    if os.path.isdir(path) and os.path.exists(os.path.join(path, MARKER)):
        shutil.rmtree(path, ignore_errors=True)


def _in_shuffle(video_id):
    entry = _state["installed"][video_id]
    return entry.get("screensaver", True) and entry.get("shuffleInclude", True) and os.path.exists(_video_path(video_id))


def _classic_in_shuffle(classic_id):
    return classic_id in _state["classics"] and _state["classicOptions"].get(classic_id, {}).get("shuffleInclude", False)


def _sync_shuffle():
    """Rebuild the shuffle folder from the screensavers marked for it (or remove it)."""
    _remove_folder(SHUFFLE_FOLDER)
    shuffle = _state["shuffle"]
    ids = [vid for vid in _state["installed"] if _in_shuffle(vid)]
    classics = [c for c in CLASSICS if _classic_in_shuffle(c)]
    if not shuffle["enabled"] or not (ids or classics):
        return
    items = [
        {
            "key": vid,
            "kind": "video",
            "src": f"videos/{_video_file(vid)}",
            "fit": _state["installed"][vid].get("fit", "contain"),
            "boomerang": bool(_state["installed"][vid].get("boomerang")),
        }
        for vid in ids
    ] + [{"key": f"classic:{c}", "kind": "page", "src": f"classics/{c}/index.html"} for c in classics]
    if shuffle["order"] == "sequence":
        # the user's order; anything not placed yet goes at the end
        rank = {key: i for i, key in enumerate(shuffle["sequence"])}
        items.sort(key=lambda item: rank.get(item["key"], len(rank)))
    path = _write_player(
        SHUFFLE_FOLDER,
        {
            "mode": "shuffle",
            "items": items,
            "boomerang": shuffle["boomerang"],
            "playsPerVideo": shuffle["playsPerVideo"],
            "classicSeconds": shuffle["classicSeconds"],
            # "stop when done": one full pass through the list, then black
            "stopAfterPass": bool(_state["playback"]["limit"]),
            "order": shuffle["order"],
        },
    )
    os.makedirs(os.path.join(path, "videos"), exist_ok=True)
    for vid in ids:
        name = _video_file(vid)
        _link_or_copy(os.path.join(VIDEOS_DIR, name), os.path.join(path, "videos", name))
    # classics run in a same-origin iframe, so they get their own copy here
    for c in classics:
        _write_classic_files(os.path.join(path, "classics", c), c)
    _own_tree(path)


def _classic_folder(classic_id):
    return f"classic-{classic_id}"


def _write_classic_files(path, classic_id):
    """The page of a generated screensaver from assets/classics, into path."""
    os.makedirs(path, exist_ok=True)
    for name in ("common.css", "common.js"):
        shutil.copyfile(os.path.join(_CLASSICS_DIR, name), os.path.join(path, name))
    shutil.copyfile(os.path.join(_CLASSICS_DIR, classic_id, "main.js"), os.path.join(path, "main.js"))
    with open(os.path.join(path, "index.html"), "w", encoding="utf-8") as f:
        f.write(_CLASSIC_HTML)
    options = {k: v for k, v in _state["classicOptions"].get(classic_id, {}).items() if k != "shuffleInclude"}
    with open(os.path.join(path, "config.js"), "w", encoding="utf-8") as f:
        f.write(f"window.CLASSIC_CONFIG = {json.dumps(options)};\n")


def _write_classic(classic_id):
    """Install a generated screensaver as its own Steam screensaver folder."""
    path = os.path.join(SCREENSAVERS_DIR, _classic_folder(classic_id))
    _write_classic_files(path, classic_id)
    with open(os.path.join(path, MARKER), "w", encoding="utf-8") as f:
        f.write("Managed by the Deck Animations plugin.\n")
    _own_tree(path)


async def _download(url, dest, kind):
    """Download url to dest, checking it really is a `kind` ('webm'/'mp4') video."""
    tmp = dest + ".part"
    try:
        async with aiohttp.ClientSession() as web:
            async with web.get(url, ssl=_SSL_CTX) as res:
                if res.status != 200:
                    raise RuntimeError(f"HTTP {res.status}")
                with open(tmp, "wb") as f:
                    async for chunk in res.content.iter_chunked(1 << 16):
                        f.write(chunk)
        if _video_kind(tmp) != kind:
            raise RuntimeError(f"not a {kind} file")
        os.replace(tmp, dest)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def _add_local_entry(video_id, name, title, kind, extra=None):
    """Register a video already placed in VIDEOS_DIR as `name` (library only)."""
    entry = {
        "id": video_id,
        "title": title,
        "author": "",
        "thumbnail": "",
        "video": "",
        "duration": 0,
        "type": kind,
        "url": "",
        "file": name,
        "boomerang": False,
        "fit": "contain",
        "screensaver": False,
        "shuffleExclude": False,
        **(extra or {}),
    }
    _state["installed"][video_id] = entry
    entry["folder"] = _folder_name(title, video_id)
    entry["videoDuration"] = _video_duration(os.path.join(VIDEOS_DIR, name))
    _sync_entry(video_id)
    return entry


def _movie_candidates(slot):
    """Library videos randomization may pick for a slot: boot videos for boot,
    suspend videos for suspend/throbber (GIFs and your own are picked by hand)."""
    return [
        vid
        for vid, entry in _state["installed"].items()
        if entry["type"] == SLOT_TYPE[slot]
        and not entry.get("shuffleExclude")
        and os.path.exists(_video_path(vid))
    ]


def _clean_tags(tags):
    """Lowercase, trimmed, unique, at most 16 tags of up to 24 chars."""
    out = []
    for tag in tags or []:
        tag = re.sub(r"\s+", " ", str(tag)).strip().lower()[:24]
        if tag and tag not in out:
            out.append(tag)
    return out[:16]


_SLUG_STOPWORDS = {"gif", "by", "the", "a", "an", "of", "and", "to", "in", "on", "with"}


def _slug_tags(slug, gif_id):
    """Words of a GIPHY slug ("happy-fun-gif-by-netflix-<id>") minus the id and filler."""
    words = [w for w in str(slug or "").lower().split("-") if w and w != gif_id.lower()]
    return [w for w in words if w not in _SLUG_STOPWORDS and len(w) > 1]


def _boot_id():
    """Changes on every system boot (Linux); empty elsewhere."""
    try:
        with open("/proc/sys/kernel/random/boot_id", encoding="ascii") as f:
            return f.read().strip()
    except OSError:
        return ""


RANDOMIZE_EVERY_CHOICES = (0, 15, 30, 60, 120)


def _shuffle_movies():
    for slot in MOVIE_FILES:
        pool = _movie_candidates(slot)
        if pool:
            _state["movies"][slot] = random.choice(pool)
    _state["movies"]["lastShuffle"] = time.time()


def _apply_movies():
    """Point Steam's movie overrides at the chosen library videos. Only ever
    replaces symlinks; a real file someone put there is kept as *.orig."""
    os.makedirs(MOVIES_DIR, exist_ok=True)
    for slot, name in MOVIE_FILES.items():
        path = os.path.join(MOVIES_DIR, name)
        video_id = _state["movies"].get(slot, "")
        if video_id and (video_id not in _state["installed"] or not os.path.exists(_video_path(video_id))):
            _state["movies"][slot] = video_id = ""
        if os.path.islink(path):
            os.remove(path)
        if not video_id:
            continue
        if os.path.exists(path):
            orig = path + ".orig"
            if os.path.exists(orig):
                os.remove(path)
            else:
                os.replace(path, orig)
        os.symlink(_video_path(video_id), path)
        if getattr(os, "geteuid", lambda: -1)() == 0:
            st = os.stat(decky.DECKY_USER_HOME)
            os.lchown(path, st.st_uid, st.st_gid)
    _own_tree(MOVIES_DIR)


def _find_animation_changer():
    """(data_dir, config_path) of Animation Changer, or None. Looks up its
    folder via plugin.json; if it's uninstalled, recognises its config.json."""
    settings_root = os.path.join(DECKY_HOME, "settings")
    plugins_root = os.path.join(DECKY_HOME, "plugins")
    folders = []
    try:
        for folder in os.listdir(plugins_root):
            meta = _load_json(os.path.join(plugins_root, folder, "plugin.json"), {})
            if isinstance(meta, dict) and meta.get("name") == AC_NAME:
                folders.append(folder)
    except OSError:
        pass
    try:
        folders += sorted(os.listdir(settings_root))
    except OSError:
        pass
    for folder in folders:
        config_path = os.path.join(settings_root, folder, "config.json")
        config = _load_json(config_path, None)
        if isinstance(config, dict) and {"downloads", "randomize", "throbber"} <= config.keys():
            return os.path.join(DECKY_HOME, "data", folder), config_path
    return None


_AC_BACKUP_PREFIX = "Animation Changer "


def _ac_backup(ac_data, ac_config):
    """Back up Animation Changer: hardlinks for the videos (no extra space), a
    copy of its config, and where both came from (for restoring)."""
    backup = os.path.join(BACKUP_DIR, f"{_AC_BACKUP_PREFIX}{time.strftime('%Y-%m-%d %H%M%S')}")
    if os.path.isdir(ac_data):
        _link_tree(ac_data, os.path.join(backup, "data"))
    os.makedirs(os.path.join(backup, "settings"), exist_ok=True)
    shutil.copyfile(ac_config, os.path.join(backup, "settings", "config.json"))
    with open(os.path.join(backup, "backup.json"), "w", encoding="utf-8") as f:
        json.dump({"data": ac_data, "config": ac_config, "created": time.time()}, f, indent=2)
    _own_tree(BACKUP_DIR)
    return backup


def _ac_backup_path(name):
    """Path of a backup by folder name; refuses anything outside BACKUP_DIR."""
    name = str(name or "")
    if not name.startswith(_AC_BACKUP_PREFIX) or "/" in name or "\\" in name or ".." in name:
        raise RuntimeError("invalid backup")
    path = os.path.join(BACKUP_DIR, name)
    if not os.path.isdir(path):
        raise RuntimeError("backup not found")
    return path


def _list_ac_backups():
    backups = []
    if not os.path.isdir(BACKUP_DIR):
        return backups
    for name in os.listdir(BACKUP_DIR):
        path = os.path.join(BACKUP_DIR, name)
        if not name.startswith(_AC_BACKUP_PREFIX) or not os.path.isdir(path):
            continue
        meta = _load_json(os.path.join(path, "backup.json"), {})
        videos = os.path.join(path, "data", "downloads")
        count = len([n for n in os.listdir(videos) if n.endswith(".webm")]) if os.path.isdir(videos) else 0
        backups.append({"name": name, "created": meta.get("created") or os.path.getmtime(path), "videos": count})
    return sorted(backups, key=lambda b: b["created"], reverse=True)


def _link_tree(src, dst):
    """Mirror src into dst with hardlinks (copies across filesystems)."""
    for root, _, files in os.walk(src):
        target = os.path.join(dst, os.path.relpath(root, src))
        os.makedirs(target, exist_ok=True)
        for name in files:
            source = os.path.join(root, name)
            if os.path.islink(source):
                continue
            _link_or_copy(source, os.path.join(target, name))


def _import_file(src):
    """Add a video from the Deck's storage as a screensaver. Returns its entry."""
    src = os.path.realpath(src)
    if not os.path.isfile(src):
        raise RuntimeError("file not found")
    kind = _video_kind(src)
    if os.path.splitext(src)[1].lower() not in CUSTOM_EXTS or not kind:
        raise RuntimeError("unsupported file: use .webm or .mp4 (H.264, HEVC, VP9 or AV1)")
    for entry in _state["installed"].values():
        if entry.get("source") == src:
            return entry
    digest = hashlib.sha1(f"{src}:{os.path.getsize(src)}".encode()).hexdigest()[:10]
    video_id = f"local-{digest}"
    name = f"{video_id}.{kind}"
    _link_or_copy(src, os.path.join(VIDEOS_DIR, name))
    title = os.path.splitext(os.path.basename(src))[0]
    return _add_local_entry(video_id, name, title, "custom", {"source": src, "screensaver": True})


def _cache_files():
    """Files the plugin can recreate: catalog cache and interrupted downloads."""
    files = [REPO_CACHE] if os.path.exists(REPO_CACHE) else []
    files += [os.path.join(VIDEOS_DIR, n) for n in os.listdir(VIDEOS_DIR) if n.endswith(".part")]
    return files


def _migrate_old_name():
    """Bring settings, library and custom folder over from the old plugin name.
    Runs once: only when this plugin has no state yet and the old one does."""
    old_settings = os.path.join(os.path.dirname(decky.DECKY_PLUGIN_SETTINGS_DIR), _OLD_PLUGIN_NAME)
    old_runtime = os.path.join(os.path.dirname(decky.DECKY_PLUGIN_RUNTIME_DIR), _OLD_PLUGIN_NAME)
    if not os.path.exists(STATE_PATH) and os.path.isfile(os.path.join(old_settings, "state.json")):
        os.makedirs(decky.DECKY_PLUGIN_SETTINGS_DIR, exist_ok=True)
        for name in os.listdir(old_settings):
            shutil.move(os.path.join(old_settings, name), os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, name))
        if os.path.isdir(old_runtime):
            os.makedirs(decky.DECKY_PLUGIN_RUNTIME_DIR, exist_ok=True)
            for name in os.listdir(old_runtime):
                target = os.path.join(decky.DECKY_PLUGIN_RUNTIME_DIR, name)
                if not os.path.exists(target):
                    shutil.move(os.path.join(old_runtime, name), target)
        decky.logger.info(f"migrated settings and library from '{_OLD_PLUGIN_NAME}'")
    if os.path.isdir(_OLD_CUSTOM_DIR) and not os.path.exists(CUSTOM_DIR):
        os.rename(_OLD_CUSTOM_DIR, CUSTOM_DIR)
        decky.logger.info(f"renamed {_OLD_CUSTOM_DIR} to {CUSTOM_DIR}")


def _public_state():
    return {
        "installed": list(_state["installed"].values()),
        "shuffle": _state["shuffle"],
        "playback": _state["playback"],
        "classics": _state["classics"],
        "classicOptions": _state["classicOptions"],
        "hasGiphyKey": bool(_state["giphyKey"]),
        "movies": _state["movies"],
        "animationChangerFound": _find_animation_changer() is not None,
        "importedAnimationChanger": _state["importedAnimationChanger"],
        "shuffleFolder": SHUFFLE_FOLDER,
        "screensaversDir": SCREENSAVERS_DIR,
        "customDir": CUSTOM_DIR,
    }


class Plugin:
    """Decky plugin entry point."""

    async def _main(self):
        global _repo
        try:
            _migrate_old_name()
        except Exception:  # pylint: disable=broad-except
            decky.logger.exception("migration from the old plugin name failed")
        os.makedirs(VIDEOS_DIR, exist_ok=True)
        os.makedirs(SCREENSAVERS_DIR, exist_ok=True)
        if not os.path.isdir(CUSTOM_DIR):
            os.makedirs(CUSTOM_DIR, exist_ok=True)
            _own_tree(os.path.dirname(CUSTOM_DIR))
        loaded = _load_json(STATE_PATH, {})
        _state["installed"] = loaded.get("installed", {})
        for entry in _state["installed"].values():
            src = entry.get("source", "")
            if src.startswith(_OLD_CUSTOM_DIR + os.sep):
                entry["source"] = CUSTOM_DIR + src[len(_OLD_CUSTOM_DIR):]
        loaded_shuffle = loaded.get("shuffle", {})
        _state["shuffle"].update(loaded_shuffle)
        # before plays/seconds were split there was one "clipSeconds" for everything
        if "clipSeconds" in _state["shuffle"]:
            if "classicSeconds" not in loaded_shuffle:
                _state["shuffle"]["classicSeconds"] = _state["shuffle"]["clipSeconds"]
            del _state["shuffle"]["clipSeconds"]
        _state["playback"].update(loaded.get("playback", {}))
        _state["classics"] = [c for c in loaded.get("classics", []) if c in CLASSICS]
        _state["classicOptions"] = {k: v for k, v in loaded.get("classicOptions", {}).items() if k in CLASSICS}
        _state["giphyKey"] = loaded.get("giphyKey", "")
        _state["movies"].update(loaded.get("movies", {}))
        _state["importedAnimationChanger"] = loaded.get("importedAnimationChanger", False)
        _state["lastBootId"] = loaded.get("lastBootId", "")
        _repo = _load_json(REPO_CACHE, _repo)

        # never leave the panel dark across a plugin/Steam restart
        if os.path.exists(_DISPLAY_OFF_FLAG):
            try:
                _set_backlight(True)
            except Exception:  # pylint: disable=broad-except
                decky.logger.exception("failed to restore backlight")

        # refresh player files in case the plugin was updated
        try:
            for folder in _OLD_SHUFFLE_FOLDERS:
                _remove_folder(folder)
            for video_id in list(_state["installed"]):
                entry = _state["installed"][video_id]
                if not os.path.exists(_video_path(video_id)):
                    _remove_folder(entry["folder"])
                    del _state["installed"][video_id]
                    continue
                if not _FOLDER_RE.match(entry["folder"]):
                    _remove_folder(entry["folder"])
                    entry["folder"] = _folder_name(entry["title"] or video_id, video_id)
                if not entry.get("videoDuration"):
                    entry["videoDuration"] = _video_duration(_video_path(video_id))
                # everything installed before the library existed was a screensaver
                entry.setdefault("screensaver", True)
                entry.setdefault("shuffleExclude", False)
                if entry["type"] == "gif" and "tags" not in entry:
                    # GIFs added before tags existed: use the words of the title
                    entry["tags"] = _clean_tags(_slug_tags(re.sub(r"[^a-z0-9]+", "-", entry["title"].lower()), video_id))
                _sync_entry(video_id)
            for classic_id in _state["classics"]:
                _write_classic(classic_id)
            _sync_shuffle()
            _save_state()
        except Exception:  # pylint: disable=broad-except
            decky.logger.exception("failed to refresh screensaver folders")

        # "shuffle on boot" runs once per system boot, not on every plugin
        # reload (Decky restarts plugins on updates and its own restarts)
        try:
            boot_id = _boot_id()
            if _state["movies"]["shuffleOnBoot"] and boot_id != _state["lastBootId"]:
                _shuffle_movies()
            _state["lastBootId"] = boot_id
            _apply_movies()
            _save_state()
        except Exception:  # pylint: disable=broad-except
            decky.logger.exception("failed to apply boot/suspend videos")
        decky.logger.info("Deck Animations backend loaded")

    async def _unload(self):
        if os.path.exists(_DISPLAY_OFF_FLAG):
            try:
                _set_backlight(True)
            except Exception:  # pylint: disable=broad-except
                decky.logger.exception("failed to restore backlight")
        decky.logger.info("Deck Animations backend unloaded")

    async def _uninstall(self):
        for entry in _state["installed"].values():
            _remove_folder(entry["folder"])
        for classic_id in _state["classics"]:
            _remove_folder(_classic_folder(classic_id))
        _remove_folder(SHUFFLE_FOLDER)
        _remove_folder(PREVIEW_FOLDER)
        decky.logger.info("Deck Animations uninstalled; screensaver folders removed")

    async def get_repo(self, force: bool = False):
        """Return the steamdeckrepo catalog, cached for REPO_TTL_SEC."""
        global _repo
        if not force and _repo["posts"] and time.time() - _repo["fetched_at"] < REPO_TTL_SEC:
            return {"ok": True, "posts": _repo["posts"]}
        try:
            async with aiohttp.ClientSession() as web:
                async with web.get(REPO_URL, ssl=_SSL_CTX) as res:
                    if res.status == 429:
                        raise RuntimeError("steamdeckrepo rate limit hit, try again in a minute")
                    if res.status != 200:
                        raise RuntimeError(f"steamdeckrepo returned HTTP {res.status}")
                    data = await res.json(content_type=None)
            posts = [_slim(p) for p in data["posts"] if p.get("type") in ("boot_video", "suspend_video") and p.get("video")]
            _repo = {"fetched_at": time.time(), "posts": posts}
            with open(REPO_CACHE, "w", encoding="utf-8") as f:
                json.dump(_repo, f)
            return {"ok": True, "posts": posts}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("get_repo failed")
            if _repo["posts"]:
                return {"ok": True, "posts": _repo["posts"], "stale": True, "error": str(err)}
            return {"ok": False, "error": str(err)}

    async def get_state(self):
        return _public_state()

    async def install(self, post: dict):
        """Download a repo video into the library."""
        try:
            video_id = post.get("id", "")
            if not _ID_RE.match(video_id):
                return {"ok": False, "error": "invalid id"}
            dest = os.path.join(VIDEOS_DIR, video_id + ".webm")
            if not os.path.exists(dest):
                # the download endpoint counts the download on the site; the CDN link is the fallback
                urls = [DOWNLOAD_URL.format(id=video_id)]
                if str(post.get("video", "")).startswith("https://"):
                    urls.append(post["video"])
                last_error = None
                for url in urls:
                    try:
                        await _download(url, dest, "webm")
                        break
                    except Exception as err:  # pylint: disable=broad-except
                        decky.logger.warning(f"download from {url} failed: {err}")
                        last_error = err
                else:
                    raise RuntimeError(f"download failed: {last_error}")

            entry = _state["installed"].get(video_id)
            if not entry:
                entry = {k: post.get(k, "") for k in ("id", "title", "author", "thumbnail", "video", "duration", "type", "url")}
                entry["folder"] = _folder_name(entry["title"] or video_id, video_id)
                entry.update(boomerang=False, fit="contain", screensaver=False, shuffleExclude=False)
                _state["installed"][video_id] = entry
            entry["videoDuration"] = _video_duration(dest)
            _sync_entry(video_id)
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("install failed")
            return {"ok": False, "error": str(err)}

    async def uninstall(self, video_id: str):
        try:
            if video_id not in _state["installed"]:
                return {"ok": False, "error": "not installed"}
            # only our copy/hardlink in VIDEOS_DIR goes; an imported original stays where it was
            path = _video_path(video_id)
            entry = _state["installed"].pop(video_id)
            _remove_folder(entry["folder"])
            if _ID_RE.match(video_id) and os.path.exists(path):
                os.remove(path)
            for slot in MOVIE_FILES:
                if _state["movies"][slot] == video_id:
                    _state["movies"][slot] = ""
            _apply_movies()
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("uninstall failed")
            return {"ok": False, "error": str(err)}

    async def import_video(self, path: str):
        """Import one video file picked on the Deck."""
        try:
            _import_file(path)
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("import_video failed")
            return {"ok": False, "error": str(err)}

    async def import_url(self, url: str):
        """Download a direct video link (.webm/.mp4) into the custom folder and
        add it to the library, like a file picked on the Deck."""
        try:
            url = str(url or "").strip()
            if not re.match(r"^https?://", url):
                return {"ok": False, "error": "use a direct http(s) link to a .webm or .mp4 file"}
            base = re.sub(r"[^\w .()-]+", "", os.path.basename(unquote(url.split("?")[0].split("#")[0])))
            stem = os.path.splitext(base)[0].strip() or "video"
            os.makedirs(CUSTOM_DIR, exist_ok=True)
            tmp = os.path.join(CUSTOM_DIR, f".{stem}.download")
            try:
                async with aiohttp.ClientSession() as web:
                    async with web.get(url, ssl=_SSL_CTX) as res:
                        if res.status != 200:
                            raise RuntimeError(f"HTTP {res.status}")
                        size = 0
                        with open(tmp, "wb") as f:
                            async for chunk in res.content.iter_chunked(1 << 16):
                                size += len(chunk)
                                if size > _MAX_URL_BYTES:
                                    raise RuntimeError("file is larger than 1 GB")
                                f.write(chunk)
                kind = _video_kind(tmp)
                if not kind:
                    raise RuntimeError("not a .webm or .mp4 video")
                dest = os.path.join(CUSTOM_DIR, f"{stem}.{kind}")
                n = 2
                while os.path.exists(dest):
                    dest = os.path.join(CUSTOM_DIR, f"{stem} ({n}).{kind}")
                    n += 1
                os.replace(tmp, dest)
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)
            _own_tree(CUSTOM_DIR)
            entry = _import_file(dest)
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state(), "title": entry["title"]}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("import_url failed")
            return {"ok": False, "error": str(err)}

    async def scan_custom_folder(self):
        """Import every supported video in CUSTOM_DIR that isn't installed yet."""
        try:
            known = {e.get("source") for e in _state["installed"].values()}
            added, skipped = 0, []
            for name in sorted(os.listdir(CUSTOM_DIR)):
                src = os.path.realpath(os.path.join(CUSTOM_DIR, name))
                if not os.path.isfile(src) or src in known:
                    continue
                try:
                    _import_file(src)
                    added += 1
                except RuntimeError:
                    skipped.append(name)
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state(), "added": added, "skipped": skipped}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("scan_custom_folder failed")
            return {"ok": False, "error": str(err)}

    async def set_boomerang(self, video_id: str, enabled: bool):
        return await self.set_options(video_id, {"boomerang": enabled})

    async def set_options(self, video_id: str, patch: dict):
        """Per-video options: screensaver (bool, listed in Steam), boomerang (bool),
        fit ('contain' | 'cover'), shuffleExclude (bool, kept out of boot shuffle),
        tags (list of str), title (str)."""
        try:
            entry = _state["installed"].get(video_id)
            if not entry:
                return {"ok": False, "error": "not installed"}
            for key in ("screensaver", "boomerang", "shuffleExclude", "shuffleInclude"):
                if key in patch:
                    entry[key] = bool(patch[key])
            if patch.get("fit") in FITS:
                entry["fit"] = patch["fit"]
            if isinstance(patch.get("tags"), list):
                entry["tags"] = _clean_tags(patch["tags"])
            # display name only: the Steam folder keeps its name so the active
            # screensaver id doesn't change
            if isinstance(patch.get("title"), str) and patch["title"].strip():
                entry["title"] = patch["title"].strip()[:80]
            _sync_entry(video_id)
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("set_options failed")
            return {"ok": False, "error": str(err)}

    async def get_storage(self):
        """Disk use: library by type (hardlinks counted once) and clearable cache."""
        try:
            by_type, seen = {}, set()
            for video_id, entry in _state["installed"].items():
                path = _video_path(video_id)
                if not os.path.exists(path):
                    continue
                st = os.stat(path)
                if (st.st_dev, st.st_ino) in seen:
                    continue
                seen.add((st.st_dev, st.st_ino))
                bucket = by_type.setdefault(entry["type"], {"bytes": 0, "count": 0})
                bucket["bytes"] += st.st_size
                bucket["count"] += 1
            return {"ok": True, "library": by_type, "cache": sum(os.path.getsize(p) for p in _cache_files())}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("get_storage failed")
            return {"ok": False, "error": str(err)}

    async def clear_cache(self):
        """Delete what can be rebuilt: the catalog cache, partial downloads and
        the preview folder. The library itself is never touched."""
        global _repo
        try:
            freed = 0
            for path in _cache_files():
                freed += os.path.getsize(path)
                os.remove(path)
            _remove_folder(PREVIEW_FOLDER)
            _repo = {"fetched_at": 0, "posts": []}
            return {"ok": True, "freed": freed}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("clear_cache failed")
            return {"ok": False, "error": str(err)}

    async def prepare_preview(self, video_id: str):
        """Point the preview folder at any library video (screensaver or not),
        with its current options, so it can be shown full screen."""
        try:
            entry = _state["installed"].get(video_id)
            if not entry:
                return {"ok": False, "error": "not installed"}
            name = "video" + os.path.splitext(_video_file(video_id))[1]
            _remove_folder(PREVIEW_FOLDER)
            path = _write_player(
                PREVIEW_FOLDER,
                {"mode": "single", "videos": [name], "fits": [entry.get("fit", "contain")], "boomerang": entry["boomerang"], "plays": 0},
            )
            _link_or_copy(_video_path(video_id), os.path.join(path, name))
            _own_tree(path)
            return {"ok": True, "folder": PREVIEW_FOLDER}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("prepare_preview failed")
            return {"ok": False, "error": str(err)}

    async def end_preview(self):
        """Remove the preview folder so it doesn't linger in Steam's list."""
        _remove_folder(PREVIEW_FOLDER)
        return {"ok": True}

    async def set_movie(self, slot: str, video_id: str):
        """Use a library video (or "" for Steam's default) as the boot/suspend/throbber video."""
        try:
            if slot not in MOVIE_FILES:
                return {"ok": False, "error": "unknown slot"}
            # any library video works: Steam's player sniffs the container, so an
            # MP4 behind the .webm override name plays fine (checked on a Deck)
            if video_id and video_id not in _state["installed"]:
                return {"ok": False, "error": "not installed"}
            _state["movies"][slot] = video_id
            _apply_movies()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("set_movie failed")
            return {"ok": False, "error": str(err)}

    async def shuffle_movies(self):
        """Pick new random boot/suspend/throbber videos right now."""
        try:
            _shuffle_movies()
            _apply_movies()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("shuffle_movies failed")
            return {"ok": False, "error": str(err)}

    async def set_movie_options(self, patch: dict):
        if "shuffleOnBoot" in patch:
            _state["movies"]["shuffleOnBoot"] = bool(patch["shuffleOnBoot"])
        if patch.get("randomizeEveryMin") in RANDOMIZE_EVERY_CHOICES:
            _state["movies"]["randomizeEveryMin"] = patch["randomizeEveryMin"]
            # count the interval from now, not from the last boot
            _state["movies"]["lastShuffle"] = time.time()
        _save_state()
        return {"ok": True, "state": _public_state()}

    async def get_ac_backups(self):
        try:
            return {"ok": True, "backups": _list_ac_backups()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("get_ac_backups failed")
            return {"ok": False, "error": str(err)}

    async def backup_animation_changer(self):
        """Only back up Animation Changer (nothing is imported)."""
        try:
            found = _find_animation_changer()
            if not found:
                return {"ok": False, "error": "Animation Changer settings not found"}
            backup = _ac_backup(*found)
            return {"ok": True, "backup": backup, "backups": _list_ac_backups()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("backup_animation_changer failed")
            return {"ok": False, "error": str(err)}

    async def restore_ac_backup(self, name: str):
        """Put a backup's videos and config back into Animation Changer. Its
        current config is kept as config.json.before-restore."""
        try:
            path = _ac_backup_path(name)
            meta = _load_json(os.path.join(path, "backup.json"), {})
            found = _find_animation_changer()
            ac_data = meta.get("data") or (found and found[0])
            ac_config = meta.get("config") or (found and found[1])
            if not ac_data or not ac_config:
                return {"ok": False, "error": "don't know where Animation Changer keeps its files"}
            if os.path.isdir(os.path.join(path, "data")):
                _link_tree(os.path.join(path, "data"), ac_data)
            saved = os.path.join(path, "settings", "config.json")
            if os.path.isfile(saved):
                os.makedirs(os.path.dirname(ac_config), exist_ok=True)
                if os.path.isfile(ac_config):
                    shutil.copyfile(ac_config, ac_config + ".before-restore")
                shutil.copyfile(saved, ac_config)
            _own_tree(ac_data)
            _own_tree(os.path.dirname(ac_config))
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("restore_ac_backup failed")
            return {"ok": False, "error": str(err)}

    async def delete_ac_backup(self, name: str):
        """Delete one backup (hardlinked videos still in use elsewhere stay there)."""
        try:
            shutil.rmtree(_ac_backup_path(name))
            return {"ok": True, "backups": _list_ac_backups()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("delete_ac_backup failed")
            return {"ok": False, "error": str(err)}

    async def import_animation_changer(self):
        """Bring Animation Changer's downloaded videos and choices into the
        library (hardlinks: its own copy stays untouched). No backup here;
        that's a separate action."""
        try:
            found = _find_animation_changer()
            if not found:
                return {"ok": False, "error": "Animation Changer settings not found"}
            ac_data, ac_config = found
            config = _load_json(ac_config, {})

            # 2. downloaded videos -> library (same ids as our steamdeckrepo installs)
            imported, already, missing = 0, 0, []
            for anim in config.get("downloads", []):
                video_id = str(anim.get("id", ""))
                src = os.path.join(ac_data, "downloads", f"{video_id}.webm")
                if not _ID_RE.match(video_id) or not os.path.isfile(src):
                    missing.append(anim.get("name") or video_id)
                    continue
                if video_id in _state["installed"]:
                    already += 1
                    continue
                name = f"{video_id}.webm"
                _link_or_copy(src, os.path.join(VIDEOS_DIR, name))
                _add_local_entry(
                    video_id,
                    name,
                    str(anim.get("name") or video_id),
                    "suspend" if anim.get("target") == "suspend" else "boot",
                    {
                        "author": str(anim.get("author") or ""),
                        "thumbnail": str(anim.get("preview_image") or ""),
                        "video": str(anim.get("preview_video") or ""),
                        "url": str(anim.get("source") or ""),
                    },
                )
                imported += 1

            # 3. choices: current videos, shuffle on boot, shuffle exclusions
            for video_id in config.get("shuffle_exclusions", []):
                if video_id in _state["installed"]:
                    _state["installed"][video_id]["shuffleExclude"] = True
            for slot in MOVIE_FILES:
                video_id = config.get(slot, "")
                if video_id in _state["installed"]:
                    _state["movies"][slot] = video_id
            _state["movies"]["shuffleOnBoot"] = config.get("randomize") == "all"
            _state["importedAnimationChanger"] = True
            _apply_movies()
            _save_state()

            skipped_other = len(config.get("custom_animations", [])) + len(config.get("custom_sets", []))
            return {
                "ok": True,
                "state": _public_state(),
                "imported": imported,
                "already": already,
                "missing": missing,
                "skippedOther": skipped_other,
            }
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("import_animation_changer failed")
            return {"ok": False, "error": str(err)}

    async def set_classic_options(self, classic_id: str, patch: dict):
        try:
            if classic_id not in CLASSICS:
                return {"ok": False, "error": "unknown classic"}
            options = _state["classicOptions"].setdefault(classic_id, {})
            if "shuffleInclude" in patch:
                options["shuffleInclude"] = bool(patch["shuffleInclude"])
            if "color" in patch:
                color = str(patch["color"] or "")
                if color and not _COLOR_RE.match(color):
                    return {"ok": False, "error": "invalid color"}
                options["color"] = color
                if classic_id in _state["classics"]:
                    _write_classic(classic_id)
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("set_classic_options failed")
            return {"ok": False, "error": str(err)}

    async def set_many(self, ids: list, patch: dict):
        """Batch "in rotation" changes: shuffleInclude (screensavers, incl.
        "classic:<id>") and shuffleExclude (boot/suspend randomization)."""
        try:
            for item in ids:
                item = str(item)
                if item.startswith("classic:"):
                    classic_id = item[len("classic:"):]
                    if classic_id in CLASSICS and "shuffleInclude" in patch:
                        _state["classicOptions"].setdefault(classic_id, {})["shuffleInclude"] = bool(patch["shuffleInclude"])
                    continue
                entry = _state["installed"].get(item)
                if not entry:
                    continue
                for key in ("shuffleInclude", "shuffleExclude"):
                    if key in patch:
                        entry[key] = bool(patch[key])
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("set_many failed")
            return {"ok": False, "error": str(err)}

    async def install_classic(self, classic_id: str):
        try:
            if classic_id not in CLASSICS:
                return {"ok": False, "error": "unknown classic"}
            _write_classic(classic_id)
            if classic_id not in _state["classics"]:
                _state["classics"].append(classic_id)
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state(), "folder": _classic_folder(classic_id)}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("install_classic failed")
            return {"ok": False, "error": str(err)}

    async def uninstall_classic(self, classic_id: str):
        try:
            if classic_id in _state["classics"]:
                _state["classics"].remove(classic_id)
                _remove_folder(_classic_folder(classic_id))
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("uninstall_classic failed")
            return {"ok": False, "error": str(err)}

    async def set_giphy_key(self, key: str):
        _state["giphyKey"] = (key or "").strip()
        _save_state()
        return {"ok": True, "state": _public_state()}

    async def search_gifs(self, query: str = "", offset: int = 0):
        """GIPHY search (or trending when query is empty). Needs the user's API key."""
        if not _state["giphyKey"]:
            return {"ok": False, "error": "no GIPHY API key"}
        try:
            params = {"api_key": _state["giphyKey"], "limit": "30", "offset": str(int(offset)), "rating": "pg-13"}
            endpoint = "trending"
            if query.strip():
                endpoint = "search"
                params["q"] = query.strip()[:50]
            async with aiohttp.ClientSession() as web:
                async with web.get(GIPHY_API.format(endpoint=endpoint), params=params, ssl=_SSL_CTX) as res:
                    if res.status in (401, 403):
                        raise RuntimeError("GIPHY rejected the API key")
                    if res.status == 429:
                        raise RuntimeError("GIPHY rate limit hit, try again later")
                    if res.status != 200:
                        raise RuntimeError(f"GIPHY returned HTTP {res.status}")
                    data = await res.json(content_type=None)
            gifs = []
            for gif in data.get("data", []):
                images = gif.get("images", {})
                still = images.get("fixed_width", {})
                gifs.append(
                    {
                        "id": gif["id"],
                        "title": gif.get("title") or gif["id"],
                        "thumbnail": still.get("webp") or still.get("url", ""),
                        "width": int(still.get("width") or 200),
                        "height": int(still.get("height") or 150),
                        "url": gif.get("url", ""),
                        "tags": _clean_tags(_slug_tags(gif.get("slug"), gif["id"]) + [gif.get("username") or ""]),
                    }
                )
            total = data.get("pagination", {}).get("total_count", len(gifs))
            return {"ok": True, "gifs": gifs, "total": total}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("search_gifs failed")
            return {"ok": False, "error": str(err)}

    async def install_gif(self, gif: dict):
        """Download a GIPHY GIF as MP4 (smaller and smoother than the .gif) and add it."""
        try:
            gif_id = str(gif.get("id", ""))
            if not _GIPHY_ID_RE.match(gif_id):
                return {"ok": False, "error": "invalid GIPHY id"}
            video_id = f"gif-{gif_id}"[:32]
            if video_id not in _state["installed"]:
                name = f"{video_id}.mp4"
                await _download(GIPHY_MP4.format(id=gif_id), os.path.join(VIDEOS_DIR, name), "mp4")
                title = str(gif.get("title") or "GIF").strip()[:80] or "GIF"
                thumb = str(gif.get("thumbnail") or "")
                extra = {
                    "author": "GIPHY",
                    "thumbnail": thumb if thumb.startswith("https://") else "",
                    "url": str(gif.get("url") or ""),
                    "fit": "cover",
                    "screensaver": True,
                    "tags": _clean_tags(list(gif.get("tags") or [])),
                }
                _add_local_entry(video_id, name, title, "gif", extra)
                _sync_shuffle()
                _save_state()
            return {"ok": True, "state": _public_state(), "folder": _state["installed"][video_id]["folder"]}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("install_gif failed")
            return {"ok": False, "error": str(err)}

    async def set_playback(self, patch: dict):
        """Play-count limit for single-video screensavers, and what happens after."""
        try:
            playback = _state["playback"]
            if "limit" in patch:
                playback["limit"] = bool(patch["limit"])
            if "plays" in patch:
                playback["plays"] = max(1, min(100, int(patch["plays"])))
            if patch.get("after") in ("black", "off"):
                playback["after"] = patch["after"]
            for video_id in _state["installed"]:
                _sync_entry(video_id)
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("set_playback failed")
            return {"ok": False, "error": str(err)}

    async def set_display_power(self, on: bool):
        """Turn the panel backlight off/on (used after the last play)."""
        try:
            _set_backlight(bool(on))
            return {"ok": True}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("set_display_power failed")
            return {"ok": False, "error": str(err)}

    async def set_shuffle(self, patch: dict):
        try:
            shuffle = _state["shuffle"]
            if "enabled" in patch:
                shuffle["enabled"] = bool(patch["enabled"])
            if "boomerang" in patch:
                shuffle["boomerang"] = bool(patch["boomerang"])
            if "playsPerVideo" in patch:
                shuffle["playsPerVideo"] = max(1, min(20, int(patch["playsPerVideo"])))
            if "classicSeconds" in patch:
                shuffle["classicSeconds"] = max(5, min(600, int(patch["classicSeconds"])))
            if patch.get("order") in ("random", "sequence"):
                shuffle["order"] = patch["order"]
            if isinstance(patch.get("sequence"), list):
                shuffle["sequence"] = [str(k) for k in patch["sequence"]][:1000]
            _sync_shuffle()
            _save_state()
            return {"ok": True, "state": _public_state()}
        except Exception as err:  # pylint: disable=broad-except
            decky.logger.exception("set_shuffle failed")
            return {"ok": False, "error": str(err)}
