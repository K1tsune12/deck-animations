import { definePlugin, routerHook, toaster } from '@decky/api';
import {
  ButtonItem,
  DialogButton,
  DropdownItem,
  Focusable,
  Navigation,
  PanelSection,
  PanelSectionRow,
  ToggleField,
  staticClasses,
} from '@decky/ui';
import { useEffect } from 'react';
import { FaFilm, FaPhotoVideo } from 'react-icons/fa';

import { fitsSlot, useScreensaverChoices } from './actions';
import { refreshState, setBoomerang, setMovie, shuffleMovies, useBackendState } from './backend';
import { CLASSICS, classicFolder, classicName } from './classics';
import { startClientSettings, stopClientSettings, useClientSettings } from './clientSettings';
import { initLanguage, t, useLanguage } from './i18n';
import { MANAGER_ROUTE, ManagerPage, openManager } from './ManagerPage';
import { setRotation } from './SettingsPanel';
import { startAutoRandomize, stopAutoRandomize } from './autoRandomize';
import { startScreenOffWatcher, stopScreenOffWatcher } from './screenOff';
import {
  BOUNCING_LOGO_ID,
  SLIDESHOW_ID,
  activateFolder,
  folderFromId,
  getLastActive,
  previewScreensaver,
  setActiveScreensaver,
} from './steam';
import { MOVIE_SLOTS } from './types';

const FOLDER_PREFIX = 'folder:';
const DEFAULT_MOVIE = '__steam__';

const toast = (body: string) => toaster.toast({ title: 'Deck Animations', body });

function QuickPanel() {
  useLanguage();
  const state = useBackendState();
  const { options, selected, choose, activeFolder } = useScreensaverChoices();

  useEffect(() => {
    refreshState().catch(() => {});
  }, []);

  const activeEntry = state.installed.find((e) => e.folder === activeFolder);
  const rotating = state.shuffle.enabled && activeFolder === state.shuffleFolder;
  const fail = (err: unknown) => toast(String((err as Error)?.message ?? err));

  return (
    <>
      <PanelSection title={t('qam.screensaver')}>
        <PanelSectionRow>
          <DropdownItem
            label={t('qam.active')}
            strDefaultLabel={t('qam.choose')}
            rgOptions={options}
            selectedOption={selected}
            onChange={(o) => void choose(o.data as string)}
          />
        </PanelSectionRow>
        <PanelSectionRow>
          <ToggleField
            label={t('settings.shuffleToggle')}
            checked={rotating}
            onChange={(v) => setRotation(v, state.shuffleFolder).catch(fail)}
          />
        </PanelSectionRow>
        {activeEntry && (
          <PanelSectionRow>
            <ToggleField
              label={t('common.boomerang')}
              description={t('common.boomerangDesc')}
              checked={activeEntry.boomerang}
              onChange={(v) => setBoomerang(activeEntry.id, v).catch(fail)}
            />
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() => {
              Navigation.CloseSideMenus();
              setTimeout(() => void previewScreensaver(), 400);
            }}
          >
            {t('qam.preview')}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title={t('qam.movies')}>
        {MOVIE_SLOTS.map((slot) => (
          <PanelSectionRow key={slot}>
            <DropdownItem
              label={t(`slotLong.${slot}`).split(' (')[0]}
              rgOptions={[
                { data: DEFAULT_MOVIE, label: t('movies.default') },
                ...state.installed
                  .filter((e) => fitsSlot(e, slot))
                  .sort((a, b) => a.title.localeCompare(b.title))
                  .map((e) => ({ data: e.id, label: e.title })),
              ]}
              selectedOption={state.movies[slot] || DEFAULT_MOVIE}
              onChange={(o) => setMovie(slot, o.data === DEFAULT_MOVIE ? '' : (o.data as string)).catch(fail)}
            />
          </PanelSectionRow>
        ))}
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            onClick={() =>
              shuffleMovies()
                .then(() => toast(t('movies.shuffled')))
                .catch(fail)
            }
          >
            {t('movies.shuffleNow')}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      {/* the library has its own button in the title bar */}
      <PanelSection>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => openManager('boot')}>
            {t('qam.browse')}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => openManager('rotation')}>
            {t('tab.rotation')}
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => openManager('settings')}>
            {t('qam.settings')}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}

export default definePlugin(() => {
  routerHook.addRoute(MANAGER_ROUTE, ManagerPage);
  void initLanguage();
  startClientSettings();
  refreshState().catch(() => {});
  startScreenOffWatcher();
  startAutoRandomize();

  return {
    name: 'Deck Animations',
    // title with a shortcut to the library on the right, like CSS Loader's header buttons
    titleView: (
      <Focusable
        className={staticClasses.Title}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: 0 }}
      >
        <div>Deck Animations</div>
        <DialogButton
          style={{ height: '28px', width: '40px', minWidth: 0, padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => openManager('library')}
        >
          <FaPhotoVideo />
        </DialogButton>
      </Focusable>
    ),
    content: <QuickPanel />,
    icon: <FaFilm />,
    onDismount() {
      stopScreenOffWatcher();
      stopAutoRandomize();
      stopClientSettings();
      routerHook.removeRoute(MANAGER_ROUTE);
    },
  };
});
