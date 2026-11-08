import { DialogButton, Focusable, ModalRoot } from '@decky/ui';
import { FC } from 'react';
import { FaDownload, FaThumbsUp } from 'react-icons/fa';

import { ModalFooter, previewEntry, previewMedia, slotsFor, useAsScreensaver, useBusy, useForSlot } from './actions';
import { install, uninstall, useBackendState } from './backend';
import { t, useLanguage } from './i18n';
import { PostLike } from './types';

export const CSS = `
.dss-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 15px; }
.dss-card { background: #0008; border-radius: 4px; overflow: hidden; transition: transform 0.1s, box-shadow 0.1s; }
.dss-card.gpfocus, .dss-card:hover { box-shadow: 0 0 0 2px #fff; transform: scale(1.02); }
.dss-thumb { position: relative; aspect-ratio: 16 / 10; background: #000; overflow: hidden; }
.dss-live { position: absolute; inset: 0; pointer-events: none; }
.dss-live iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; background: transparent; }
.dss-thumb .dss-tag { z-index: 1; }
.dss-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dss-tag { position: absolute; top: 6px; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
.dss-type { left: 6px; background: #000a; color: #ddd; }
.dss-installed { right: 6px; background: #59bf40; color: #fff; }
.dss-info { padding: 8px 10px; }
.dss-title { font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dss-meta { font-size: 12px; color: #9aa; display: flex; gap: 10px; align-items: center; white-space: nowrap; overflow: hidden; }
.dss-row { display: flex; align-items: center; gap: 10px; background: #0008; border-radius: 4px; padding: 8px; }
.dss-row img { width: 112px; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 3px; flex: none; }
.dss-row-info { flex: 1; min-width: 0; }
.dss-row-placeholder { width: 112px; aspect-ratio: 16 / 10; border-radius: 3px; flex: none; display: flex; align-items: center; justify-content: center; background: #1a1f26; color: #67707b; }
.dss-row .dss-row-btn { width: auto; min-width: 0; padding: 0 14px; flex: none; }
.dss-danger { background: #c03030 !important; color: #fff !important; }
.dss-modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; padding-top: 12px; border-top: 1px solid #ffffff1f; }
.dss-modal-footer .DialogButton { width: auto !important; min-width: 120px !important; flex: none; }
.dss-primary { background: #1a9fff !important; color: #fff !important; }
.dss-primary.gpfocus { background: #4db3ff !important; box-shadow: 0 0 0 2px #fff !important; }
/* the red background hid Steam's focus highlight: show it on top */
.dss-danger.gpfocus, .dss-danger:focus, .dss-danger:hover { background: #ff5252 !important; box-shadow: inset 0 0 0 2px #fff, 0 0 0 2px #fff !important; }
.dss-batch { margin: 8px 0 12px; padding: 8px; background: #0008; border-radius: 4px; box-shadow: inset 0 0 0 1px #59bf4066; }
.dss-batch-line { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dss-batch-line + .dss-batch-line { margin-top: 8px; padding-top: 8px; border-top: 1px solid #ffffff14; }
.dss-batch .DialogButton, .dss-libbar .DialogButton, .dss-lib .DialogButton {
  min-width: 0 !important; width: auto !important; height: auto !important; flex: none;
  padding: 6px 12px !important; font-size: 13px !important; line-height: 18px !important; white-space: nowrap;
}
.dss-batch-count { color: #cfd6df; font-size: 13px; margin-right: auto; }
.dss-batch-drop, .dss-libbar-drop { min-width: 190px; }
.dss-batch-drop .DialogDropDown, .dss-libbar-drop .DialogDropDown { padding: 4px 10px !important; font-size: 13px !important; min-height: 0 !important; }

/* library: quiet rows, two buttons each, state as small icons */
.dss-libbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 12px; }
.dss-icon-btn { display: flex !important; align-items: center; gap: 6px; }
.dss-lib-list { display: flex; flex-direction: column; gap: 0; background: #0008; border-radius: 4px; }
.dss-lib-list .dss-lib { background: none; border-radius: 0; }
/* a light rule between rows, and the focused row lit up, so it is clear whose Preview is selected */
.dss-lib-list .dss-lib + .dss-lib { border-top: 1px solid #ffffff26; }
.dss-lib-list .dss-lib-row.gpfocuswithin { background: #ffffff12; box-shadow: inset 4px 0 0 #1a9fff; }
.dss-lib-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.dss-lib { background: #0008; border-radius: 4px; }
.dss-lib-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; }
.dss-lib-row img, .dss-lib-row .dss-row-placeholder { width: 96px; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 3px; display: block; }
.dss-lib-card { display: flex; flex-direction: column; overflow: hidden; }
.dss-lib-card img, .dss-lib-card .dss-row-placeholder { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; display: block; }
.dss-lib-card .dss-thumb-btn { border-radius: 0; }
.dss-lib-card .dss-lib-info { padding: 6px 8px 0; }
.dss-lib-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 8px 8px; justify-content: flex-end; }
.dss-lib-actions .DialogButton { flex: 0 0 auto; }
.dss-lib-info { flex: 1; min-width: 0; }
.dss-lib .dss-more { display: flex !important; align-items: center; padding: 6px 10px !important; }
.dss-lib.dss-selected { box-shadow: inset 0 0 0 2px #59bf40; background: #59bf4022; }
/* grid: outline the card, never tint the video; a checkbox floats on the thumbnail */
.dss-lib-card.dss-selected { background: #0008; box-shadow: 0 0 0 3px #59bf40; }
.dss-card-thumb { position: relative; }
.dss-check-badge { position: absolute; top: 8px; left: 8px; display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 6px; background: #000b; color: #fff; pointer-events: none; box-shadow: 0 0 0 1px #ffffff55; }
.dss-check-badge-on { background: #59bf40; box-shadow: none; }
.dss-lib-card.gpfocuswithin { box-shadow: 0 0 0 2px #fff; }
.dss-lib-card.dss-selected.gpfocuswithin { box-shadow: 0 0 0 3px #59bf40, 0 0 0 5px #fff; }
.dss-lib.dss-off { opacity: 0.55; }
.dss-lib .dss-check { display: flex !important; align-items: center; justify-content: center; padding: 6px 10px !important; }
.dss-lib .dss-check-on { background: #59bf40 !important; color: #fff !important; }
.dss-meta-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 3px; font-size: 12px; color: #9aa; }
.dss-kind { font-weight: bold; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 3px; background: #ffffff14; color: #cfd6df; }
.dss-kind-boot { color: #7fb0ff; }
.dss-kind-suspend { color: #b49cff; }
.dss-kind-gif { color: #f0bd4f; }
.dss-kind-custom { color: #4fd1c5; }
.dss-kind-classic { color: #ff9a6b; }
.dss-kind-oled, .dss-kind-clock { color: #e6e6e6; background: #000; box-shadow: inset 0 0 0 1px #ffffff33; }
.dss-st { display: inline-flex; align-items: center; gap: 4px; color: #8b97a3; }
.dss-st-use { color: #7be06a; font-weight: bold; }
.dss-st-off { color: #ff8a80; }
.dss-inuse { margin: 0 0 12px; }
.dss-inuse-head { display: flex !important; align-items: center; gap: 8px; width: 100% !important; justify-content: flex-start !important; background: none !important; padding: 2px 4px !important; font-weight: bold; }
/* Steam slides a tab in (translateX 40%) while it also jumps the new tab to its
   last focused row: the two motions together look torn. Keep the fade only. */
.dss-root :has(> * > ._TabContentsScroll) { transform: none !important; }
.dss-desc { font-size: 12px; color: #9aa; margin: 4px 0 8px; min-height: 3em; }
/* buttons wrap instead of shrinking: on a narrow card (the Deck's 854 px screen,
   3 cards a row) they go two to a line with their whole label; wide cards keep one row */
.dss-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dss-actions > * { flex: 1 0 auto; }
.dss-card, .dss-lib-card { container-type: inline-size; }
@container (max-width: 320px) {
  .dss-actions > * { flex: 1 0 calc(50% - 4px); }
}
.dss-actions .DialogButton, .dss-lib-actions .DialogButton { text-overflow: clip !important; overflow: visible !important; }
/* Steam's DialogButton has a large min-width/padding; compact it inside cards and rows */
.dss-actions .DialogButton, .dss-row .DialogButton {
  min-width: 0 !important; width: auto !important; height: auto !important;
  padding: 6px 12px !important; font-size: 13px !important; line-height: 18px !important;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dss-classic .dss-thumb { aspect-ratio: 16 / 7; }
.dss-panel { background: #0008; border-radius: 4px; padding: 12px; margin: 15px 0; }
.dss-backup { display: flex; align-items: center; gap: 8px; width: 100%; }
.dss-backup .DialogButton { width: auto !important; min-width: 0 !important; padding: 6px 12px !important; font-size: 13px !important; }
.dss-explain { font-size: 12px; line-height: 18px; color: #cfd6df; background: #0006; border-radius: 4px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.dss-warning { background: #4a3a10cc; box-shadow: inset 0 0 0 1px #c98a00; }
.dss-gif-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.dss-gif { position: relative; aspect-ratio: 1; background: #000; border-radius: 4px; overflow: hidden; transition: transform 0.1s, box-shadow 0.1s; }
.dss-gif img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dss-gif.gpfocus, .dss-gif:hover { box-shadow: 0 0 0 2px #fff; transform: scale(1.04); z-index: 1; }
.dss-row .dss-danger { background: #c03030; color: #fff; }
.dss-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
.dss-chips .DialogButton { width: auto !important; min-width: 0 !important; padding: 4px 12px !important; font-size: 13px !important; line-height: 18px !important; flex: none; }
.dss-chips .dss-chip-on { background: #1a9fff !important; color: #fff !important; }
/* our coloured buttons hide Steam's focus highlight: draw a white ring on top */
.dss-chips .DialogButton.gpfocus, .dss-chip-on.gpfocus, .dss-in.gpfocus, .dss-check-on.gpfocus, .dss-icon-btn.gpfocus {
  box-shadow: 0 0 0 2px #fff, 0 0 12px #ffffff66 !important;
}
.dss-chips .dss-chip-on.gpfocus { background: #4db3ff !important; }
.dss-lib .dss-in { background: #3f9a2e !important; color: #fff !important; }
.dss-lib .dss-in.gpfocus { background: #5cc348 !important; }
.dss-lib .dss-out { opacity: 0.8; }
.dss-item { background: #0008; border-radius: 4px; padding: 8px; }
.dss-item .dss-row { background: none; padding: 0; }
.dss-sub { font-size: 12px; color: #9aa; }
.dss-thumb-btn { flex: none; border-radius: 3px; }
.dss-rot-row img, .dss-rot-row .dss-row-placeholder { width: 80px; }
.dss-row .dss-in { background: #3f9a2e !important; color: #fff !important; }
.dss-row .dss-out { opacity: 0.75; }
.dss-row .dss-move { padding: 6px 10px !important; }
.dss-pos { flex: none; width: 26px; text-align: center; font-weight: bold; color: #9aa; }
.dss-thumb-btn.gpfocus { box-shadow: 0 0 0 2px #fff; }
.dss-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.dss-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: bold; line-height: 16px; color: #fff; white-space: nowrap; }
.dss-badge-boot { background: #2d6cdf; }
.dss-badge-suspend { background: #7b4fe0; }
.dss-badge-gif { background: #c98a00; }
.dss-badge-custom { background: #12968c; }
.dss-badge-classic { background: #d2541a; }
.dss-badge-ss { background: #3f9a2e; }
.dss-badge-slot { background: transparent; box-shadow: inset 0 0 0 1.5px #fff; }
.dss-badge-muted { background: #3d4450; color: #cfd6df; }
.dss-badge-tag { background: #262b33; color: #aab4bf; font-weight: normal; }
.dss-subtabs { margin-top: 15px; }
.dss-subtabs .DialogButton { padding: 6px 16px !important; font-size: 14px !important; }
.dss-slot { display: flex; align-items: center; gap: 12px; background: #0008; border-radius: 4px; padding: 8px 12px; }
.dss-slot img { width: 112px; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 3px; flex: none; }
`;

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

export const PostCard: FC<{ post: PostLike; installed: boolean; onActivate: () => void }> = ({
  post,
  installed,
  onActivate,
}) => (
  <Focusable className="dss-card" onActivate={onActivate}>
    <div className="dss-thumb">
      <img src={post.thumbnail} loading="lazy" />
      <span className="dss-tag dss-type">{t(`tag.${post.type}`)}</span>
      {installed && <span className="dss-tag dss-installed">{t('common.inLibrary')}</span>}
    </div>
    <div className="dss-info">
      <div className="dss-title">{post.title}</div>
      <div className="dss-meta">
        <span>{post.author}</span>
        {'downloads' in post && (
          <>
            <span>
              <FaDownload size={10} /> {fmt(post.downloads)}
            </span>
            <span>
              <FaThumbsUp size={10} /> {fmt(post.likes)}
            </span>
          </>
        )}
      </div>
    </div>
  </Focusable>
);

export const PostModal: FC<{ post: PostLike; closeModal?: () => void }> = ({ post, closeModal }) => {
  useLanguage();
  const state = useBackendState();
  const entry = state.installed.find((e) => e.id === post.id);
  const [busy, run] = useBusy();

  return (
    <ModalRoot closeModal={closeModal}>
      <div style={{ display: 'flex', gap: '15px' }}>
        <video
          src={post.video}
          poster={post.thumbnail}
          autoPlay
          loop
          muted
          style={{ width: '55%', aspectRatio: '16 / 10', background: '#000', borderRadius: '4px' }}
        />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: 0 }}>{post.title}</h3>
          <div style={{ color: '#9aa', fontSize: '0.85em' }}>
            {t('repo.by', { author: post.author })}
            {post.duration ? ` · ${post.duration}s` : ''}
          </div>
          {'description' in post && post.description && (
            <p style={{ fontSize: '0.8em', overflowWrap: 'anywhere', maxHeight: '6em', overflow: 'hidden' }}>
              {post.description}
            </p>
          )}
          <div style={{ flex: 1 }} />
          <Focusable style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <DialogButton
              disabled={busy || !(entry || post.video)}
              onClick={() => void run(() => (entry ? previewEntry(entry) : previewMedia(post.video, 'video')))}
            >
              {t('common.previewFull')}
            </DialogButton>
            {!entry && (
              <DialogButton disabled={busy} onClick={() => void run(() => install(post))}>
                {busy ? t('common.downloading') : t('repo.addLibrary')}
              </DialogButton>
            )}
            {entry && (
              <DialogButton disabled={busy} onClick={() => void run(() => useAsScreensaver(entry))}>
                {t('useAs.screensaver')}
              </DialogButton>
            )}
            {entry &&
              slotsFor(entry).map((slot) => (
                <DialogButton key={slot} disabled={busy} onClick={() => void run(() => useForSlot(entry, slot))}>
                  {t(`slotLong.${slot}`)}
                  {state.movies[slot] === entry.id ? ' ✓' : ''}
                </DialogButton>
              ))}
            {entry && (
              <DialogButton
                disabled={busy}
                style={{ background: 'var(--gpColor-Red, #c03030)', color: '#fff' }}
                onClick={() => void run(() => uninstall(entry.id))}
              >
                {t('common.remove')}
              </DialogButton>
            )}
          </Focusable>
        </div>
      </div>
      <ModalFooter onClose={closeModal} />
    </ModalRoot>
  );
};
