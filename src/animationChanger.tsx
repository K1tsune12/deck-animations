// Living alongside (and moving away from) Animation Changer: a warning while
// it's installed, and the import in Settings.

import { ButtonItem, ConfirmModal, DialogButton, Focusable, PanelSection, PanelSectionRow, showModal } from '@decky/ui';
import { FC, useEffect, useState } from 'react';

import { toast, useBusy } from './actions';
import {
  AcBackup,
  backupAnimationChanger,
  deleteAcBackup,
  getAcBackups,
  importAnimationChanger,
  restoreAcBackup,
  useBackendState,
} from './backend';
import { t, useLanguage } from './i18n';

const AC_NAME = 'Animation Changer';

const isInstalled = () => !!(window as any).DeckyPluginLoader?.plugins?.some((p: any) => p.name === AC_NAME);

async function runImport(): Promise<void> {
  const r = await importAnimationChanger();
  toast(
    t('ac.done', { n: r.imported, already: r.already }) +
      (r.missing.length ? ' ' + t('ac.missing', { n: r.missing.length }) : ''),
  );
}

function confirmUninstall(run: (fn: () => Promise<unknown>) => Promise<void>): void {
  showModal(
    <ConfirmModal
      strTitle={t('ac.uninstall')}
      strDescription={t('ac.uninstallConfirm')}
      strOKButtonText={t('ac.uninstall')}
      onOK={() =>
        void run(async () => {
          await (window as any).DeckyBackend.call('utilities/uninstall_plugin', AC_NAME);
          toast(t('ac.uninstalled'));
        })
      }
    />,
  );
}

/** Top-of-page warning while Animation Changer is installed: both plugins write the same Steam folder. */
export const AnimationChangerBanner: FC = () => {
  useLanguage();
  const state = useBackendState();
  const [busy, run] = useBusy();
  if (!isInstalled()) return null;

  return (
    <div className="dss-panel dss-warning">
      <div className="dss-title">⚠️ {t('ac.bannerTitle')}</div>
      <div style={{ color: '#cfd6df', fontSize: '12px', margin: '4px 0 10px' }}>{t('ac.banner')}</div>
      <Focusable style={{ display: 'flex', gap: '10px' }}>
        {!state.importedAnimationChanger && (
          <DialogButton style={{ width: 'auto', minWidth: 0, padding: '0 16px' }} disabled={busy} onClick={() => void run(runImport)}>
            {t('ac.import')}
          </DialogButton>
        )}
        <DialogButton
          className="dss-danger"
          style={{ width: 'auto', minWidth: 0, padding: '0 16px' }}
          disabled={busy}
          onClick={() => confirmUninstall(run)}
        >
          {t('ac.uninstall')}
        </DialogButton>
      </Focusable>
    </div>
  );
};

/** Settings: import, back up, restore and delete backups of Animation Changer. */
export const AnimationChangerSection: FC = () => {
  useLanguage();
  const state = useBackendState();
  const [busy, run] = useBusy();
  const [backups, setBackups] = useState<AcBackup[]>([]);

  useEffect(() => {
    getAcBackups().then(setBackups).catch(() => {});
  }, []);

  const backup = () =>
    run(async () => {
      setBackups(await backupAnimationChanger());
      toast(t('ac.backedUp'));
    });

  const restore = (b: AcBackup) =>
    showModal(
      <ConfirmModal
        strTitle={t('ac.restore')}
        strDescription={t('ac.restoreConfirm', { name: b.name })}
        strOKButtonText={t('ac.restore')}
        onOK={() =>
          void run(async () => {
            await restoreAcBackup(b.name);
            toast(t('ac.restored'));
          })
        }
      />,
    );

  const remove = (b: AcBackup) =>
    showModal(
      <ConfirmModal
        strTitle={t('ac.deleteBackup')}
        strDescription={t('ac.deleteConfirm', { name: b.name })}
        strOKButtonText={t('ac.deleteBackup')}
        onOK={() =>
          void run(async () => {
            setBackups(await deleteAcBackup(b.name));
            toast(t('ac.deleted'));
          })
        }
      />,
    );

  return (
    <PanelSection title={t('ac.title')}>
      <PanelSectionRow>
        <div className="dss-explain">
          <div>⚠️ {t('ac.explainConflict')}</div>
          <div>📥 {t('ac.explainImport')}</div>
          <div>💾 {t('ac.explainBackup')}</div>
          <div>♻️ {t('ac.explainRestore')}</div>
          <div>🗑️ {t('ac.explainDelete')}</div>
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ fontSize: '12px', color: '#9aa', lineHeight: '18px' }}>
          {!state.animationChangerFound
            ? t('ac.notFound')
            : state.importedAnimationChanger
              ? t('ac.alreadyImported')
              : t('ac.desc')}
        </div>
      </PanelSectionRow>
      {state.animationChangerFound && (
        <>
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              disabled={busy}
              description={t('ac.importDesc')}
              onClick={() => void run(runImport)}
            >
              {t('ac.import')}
            </ButtonItem>
          </PanelSectionRow>
          <PanelSectionRow>
            <ButtonItem layout="below" disabled={busy} description={t('ac.backupDesc')} onClick={() => void backup()}>
              {t('ac.backup')}
            </ButtonItem>
          </PanelSectionRow>
        </>
      )}
      {backups.length > 0 && (
        <PanelSectionRow>
          <div style={{ fontWeight: 'bold', margin: '8px 0 4px' }}>{t('ac.backups')}</div>
        </PanelSectionRow>
      )}
      {backups.map((b) => (
        <PanelSectionRow key={b.name}>
          <Focusable className="dss-backup" flow-children="horizontal">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div>{new Date(b.created * 1000).toLocaleString()}</div>
              <div style={{ fontSize: '12px', color: '#9aa' }}>{t('ac.backupVideos', { n: b.videos })}</div>
            </div>
            <DialogButton disabled={busy} onClick={() => restore(b)}>
              {t('ac.restore')}
            </DialogButton>
            <DialogButton className="dss-danger" disabled={busy} onClick={() => remove(b)}>
              {t('ac.deleteBackup')}
            </DialogButton>
          </Focusable>
        </PanelSectionRow>
      ))}
      {isInstalled() && (
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy} onClick={() => confirmUninstall(run)}>
            {t('ac.uninstall')}
          </ButtonItem>
        </PanelSectionRow>
      )}
    </PanelSection>
  );
};
