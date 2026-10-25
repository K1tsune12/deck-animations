// Living alongside (and moving away from) Animation Changer: a warning while
// it's installed, and the import in Settings.

import { ButtonItem, ConfirmModal, DialogButton, Focusable, PanelSection, PanelSectionRow, showModal } from '@decky/ui';
import { FC } from 'react';

import { toast, useBusy } from './actions';
import { importAnimationChanger, useBackendState } from './backend';
import { t, useLanguage } from './i18n';

const AC_NAME = 'Animation Changer';

const isInstalled = () => !!(window as any).DeckyPluginLoader?.plugins?.some((p: any) => p.name === AC_NAME);

async function runImport(): Promise<void> {
  const r = await importAnimationChanger();
  toast(
    t('ac.done', { n: r.imported, already: r.already, backup: r.backup }) +
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
            {t('ac.button')}
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

/** Settings: import (or re-import) Animation Changer's videos and choices. */
export const AnimationChangerSection: FC = () => {
  useLanguage();
  const state = useBackendState();
  const [busy, run] = useBusy();

  return (
    <PanelSection title={t('ac.title')}>
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
        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy} onClick={() => void run(runImport)}>
            {t('ac.button')}
          </ButtonItem>
        </PanelSectionRow>
      )}
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
