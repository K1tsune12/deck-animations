import { DialogButton, Focusable, ModalRoot } from '@decky/ui';
import { FC } from 'react';
import { FaDownload, FaThumbsUp } from 'react-icons/fa';

import { slotsFor, useAsScreensaver, useBusy, useForSlot } from './actions';
import { install, uninstall, useBackendState } from './backend';
import { t, useLanguage } from './i18n';
import { PostLike } from './types';

export const CSS = `
.dss-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 15px; }
.dss-card { background: #0008; border-radius: 4px; overflow: hidden; transition: transform 0.1s, box-shadow 0.1s; }
.dss-card.gpfocus, .dss-card:hover { box-shadow: 0 0 0 2px #fff; transform: scale(1.02); }
.dss-thumb { position: relative; aspect-ratio: 16 / 10; background: #000; }
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
.dss-desc { font-size: 12px; color: #9aa; margin: 4px 0 8px; min-height: 3em; }
.dss-actions { display: flex; gap: 8px; }
.dss-actions > * { flex: 1; }
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
    </ModalRoot>
  );
};
