# 🎬 Deck Animations

**Everything your Steam Deck shows when you're not playing, in one place: boot and suspend videos, screensavers, GIFs and live-generated classics.**

A [Decky Loader](https://github.com/SteamDeckHomebrew/decky-loader) plugin. Browse thousands of community animations, build a library, pick what plays at boot, at suspend and when the Deck is idle, and let it rotate for you.

> 🦊 Made by **K1tsune12**. Picks up where [Animation Changer](https://github.com/TheLogicMaster/SDH-AnimationChanger) left off, and imports everything you already downloaded with it.

---

## ✨ Features

### 🔍 Explore
- 🚀 **Boot & suspend videos**: browse ~8,700 animations from [steamdeckrepo.com](https://steamdeckrepo.com) with search, sorting and a video preview.
- 🕹️ **Classics**: six screensavers generated live, sharp at any size and endless:
  Polygon Trails, Starfield, Pipes, **Digital Rain** (with any colour 🎨), Bubbles and Curves.
- 🐸 **GIFs**: search GIPHY in a grid (with your own free API key) or just paste a GIPHY link.
- 📁 **Your own videos**: `.webm` or `.mp4` (H.264, HEVC, VP9, AV1) from a direct link, any file on the Deck, or a whole folder at once.

### 📚 Library
- Everything you add, in one list with **filters** (screensavers, boot, suspend, custom, GIFs, classics) and **search** by name, author, type or **#tags**.
- ✏️ Rename items and tag them; GIFs get tags automatically.
- 👀 **Full-screen preview** of anything, exactly as it will look, without changing what's active.
- Per item: **Boomerang** 🔁 (forward, then in reverse), and **size on screen** (fill, fit or original size).

### 🔄 Rotation
- 🌅 **Boot**, 🌙 **Suspend** and 🖼️ **Screensaver**, each with what's in use, its randomization, and the list of what's in the rotation, with batch select.
- 🎲 Randomize boot/suspend **on every boot** (once per real boot) and/or **every X minutes**: never while a game is running, and it never wakes the Deck.
- 🖼️ **Screensaver rotation**: random order or **your own order** (▲ ▼), videos and GIFs by **number of plays**, classics by **seconds**, with crossfades.
- 🌑 **When it finishes**: stop after N plays (one video) or after one full pass (rotation), then go black or **turn the display off**. Any button brings it back.

### ⚙️ Settings
- ⏱️ Steam's own **screensaver and sleep timeouts** (battery and plugged in) and "show while playing a game", without leaving the plugin.
- 💾 **Storage**: what the library uses by type, and a one-tap cache cleanup.
- 🌐 **English** and **Português (Brasil)**, following Steam's language by default.

### 🧳 Coming from Animation Changer?
Deck Animations warns you while it's still installed, and **Settings → Migrate from Animation Changer** explains every option:
- 📥 **Import**: brings its downloaded videos and your choices (current videos, randomize on boot, exclusions) into the library through hardlinks, with nothing downloaded again and no extra space used. Its own files stay, so it keeps working until you remove it.
- 💾 **Back up**: saves its videos and settings to `~/Backups`, without importing anything.
- ♻️ **Restore**: puts a backup back into Animation Changer (its current settings are kept aside first).
- 🗑️ **Delete**: removes a backup; videos still used elsewhere stay.

---

## 🛠️ How it works

| What | How |
|---|---|
| 🖼️ Screensavers | Steam lists every folder in `~/.steam/root/config/uioverrides/screensavers/` that has an `index.html`. Each one is served from `https://uioverride-<folder>.steamscreensavers.host`, so folder names are kept to lowercase letters, digits and hyphens. |
| 🎞️ Player | A small page per screensaver (`assets/player/`) with a hardlink to the video. The rotation folder holds every item; classics run in a same-origin iframe. |
| 🔁 Boomerang | Chromium can't play video backwards, so the first forward pass snapshots each frame (`requestVideoFrameCallback`) and plays them back on a canvas. |
| 🌅 Boot & suspend | Symlinks in `~/.steam/root/config/uioverrides/movies/`. Only symlinks are ever replaced; a real file you put there is kept as `*.orig`. Any WebM or MP4 works, since Steam's player detects the format from the content. |
| ⚙️ Active screensaver & timeouts | Steam client settings, written with `SteamClient.Settings.SetSetting` and read live from `RegisterForSettingsArrayChanges`. |
| 🌑 Display off | `/sys/class/backlight/*/bl_power`, which is why the backend runs as root. Files it creates in your home are handed back to your user, and the display always comes back on when the screensaver closes or the plugin reloads. |
| 🧩 Steam quirks handled | The idle screensaver no longer flickers away when a menu is open (it's restarted as a forced one), and touch scrolling no longer snaps back to the focused item. |

🗂️ Uninstalling only removes the screensaver folders the plugin generated. Your library, settings and backups stay on the Deck.

---

## 📦 Install

> ⚠️ **Remove any other plugin that changes boot or suspend animations first** (Animation Changer or similar). They write to the same Steam folder (`uioverrides/movies`), so whichever runs last wins, and their randomize-on-boot would keep overwriting your choices. Coming from Animation Changer? Import first (see above), then uninstall it: its videos stay safe in your library and backup.

**From ZIP (Decky Developer Mode)**
1. Decky → ⚙️ Settings → General → enable **Developer Mode**.
2. Developer → **Install Plugin from ZIP** → pick the zip from the [Releases](../../releases).

**Manual:** copy the `Deck Animations` folder (with `dist/`, `assets/`, `main.py`, `plugin.json`) into `~/homebrew/plugins/` and restart Decky.

## 🧑‍💻 Build

```bash
pnpm install
pnpm run build   # outputs dist/index.js
```

---

## 💛 Credits

- Boot and suspend videos are made by the [steamdeckrepo.com](https://steamdeckrepo.com) community and belong to their authors; the plugin only downloads them to your Deck.
- GIF search is **Powered by GIPHY**.
- Catalog API and boot/suspend override layout based on [Animation Changer](https://github.com/TheLogicMaster/SDH-AnimationChanger) by TheLogicMaster.
- Classics are original recreations inspired by the screensavers of the 90s.

📄 License: BSD-3-Clause
