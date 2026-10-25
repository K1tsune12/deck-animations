import { toaster } from '@decky/api';
import { ButtonItem, DropdownItem, PanelSection, PanelSectionRow, SliderField, ToggleField } from '@decky/ui';
import { FC, useEffect, useRef, useState } from 'react';

import { StorageInfo, clearCache, getStorage, setPlayback, setShuffle, useBackendState } from './backend';
import { AnimationChangerSection } from './animationChanger';
import { getClientSettings, useClientSettings } from './clientSettings';
import { LANGUAGE_NAMES, LangSetting, getLangSetting, setLangSetting, t, useLanguage } from './i18n';
import {
  IDLE_CHOICES,
  SLIDESHOW_ID,
  SettingField,
  activateFolder,
  getLastActive,
  setActiveScreensaver,
  setIntSetting,
} from './steam';

const toast = (body: string) => toaster.toast({ title: 'Deck Animations', body });
const guard = (p: Promise<unknown>) => p.catch((err) => toast(String((err as Error)?.message ?? err)));

function formatIdle(sec: number): string {
  if (sec <= 0) return t('settings.disabled');
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${+(sec / 3600).toFixed(1)} h`;
}

function idleOptions(current: number) {
  const values = Array.from(new Set([...IDLE_CHOICES, current])).sort((a, b) => a - b);
  return values.map((v) => ({ data: v, label: formatIdle(v) }));
}

const IdleDropdown: FC<{ label: string; field: number; value: number }> = ({ label, field, value }) => (
  <PanelSectionRow>
    <DropdownItem
      label={label}
      rgOptions={idleOptions(value)}
      selectedOption={value}
      onChange={(o) => setIntSetting(field, o.data as number)}
    />
  </PanelSectionRow>
);

const formatBytes = (n: number) =>
  n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;

const StorageSection: FC = () => {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => getStorage().then(setInfo).catch(() => {});
  useEffect(() => void load(), []);

  const types = (['boot', 'suspend', 'gif', 'custom'] as const).filter((k) => info?.library[k]);
  const total = types.reduce((sum, k) => sum + (info?.library[k]?.bytes ?? 0), 0);

  return (
    <PanelSection title={t('storage.title')}>
      <PanelSectionRow>
        <div style={{ fontSize: '13px', lineHeight: '20px' }}>
          {!info ? (
            '…'
          ) : (
            <>
              <div>
                <b>{t('storage.library')}</b>: {formatBytes(total)}
              </div>
              {types.map((k) => (
                <div key={k} style={{ color: '#9aa' }}>
                  {t(`filter.${k}`)}: {formatBytes(info.library[k]!.bytes)} ({info.library[k]!.count})
                </div>
              ))}
              <div style={{ marginTop: '6px' }}>
                <b>{t('storage.cache')}</b>: {formatBytes(info.cache)}
              </div>
            </>
          )}
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={busy}
          description={t('storage.clearDesc')}
          onClick={async () => {
            setBusy(true);
            try {
              toast(t('storage.cleared', { size: formatBytes(await clearCache()) }));
              await load();
            } catch (err) {
              toast(String((err as Error)?.message ?? err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('storage.clear')}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
};

/** A slider whose backend write is debounced while it's being dragged. */
function useDebouncedValue(value: number, commit: (v: number) => void): [number, (v: number) => void] {
  const [local, setLocal] = useState(value);
  const timer = useRef<number>();
  useEffect(() => setLocal(value), [value]);
  return [
    local,
    (v: number) => {
      setLocal(v);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => commit(v), 400);
    },
  ];
}

const PREVIOUS_KEY = 'decky-screensavers:beforeShuffle';

/** Turn screensaver rotation on (Shuffle becomes the active screensaver) or off
 *  (back to whatever was active before). */
export async function setRotation(on: boolean, shuffleFolder: string): Promise<void> {
  const current = getClientSettings()?.screensaverCurrentId ?? getLastActive();
  const shuffleId = 'uioverride-' + shuffleFolder;
  if (on) {
    if (current && current !== shuffleId) {
      try {
        localStorage.setItem(PREVIOUS_KEY, current);
      } catch {
        // only used to restore later
      }
    }
    await setShuffle({ enabled: true });
    if (!(await activateFolder(shuffleFolder))) throw new Error(t('rot.emptyShuffle'));
  } else {
    await setShuffle({ enabled: false });
    if (current === shuffleId) {
      let previous = '';
      try {
        previous = localStorage.getItem(PREVIOUS_KEY) ?? '';
      } catch {
        // fall back to Steam's slideshow
      }
      setActiveScreensaver(previous && previous !== shuffleId ? previous : SLIDESHOW_ID);
    }
  }
}

/** What happens when a screensaver finishes (shown in Settings and the Rotation tab). */
export const FinishSection: FC = () => {
  useLanguage();
  const state = useBackendState();
  const [plays, setPlays] = useDebouncedValue(state.playback.plays, (v) => void guard(setPlayback({ plays: v })));
  return (
      <PanelSection title={t('settings.playCount')}>
        <PanelSectionRow>
          <ToggleField
            label={t('settings.limit')}
            description={t('settings.limitDesc')}
            checked={state.playback.limit}
            onChange={(v) => void guard(setPlayback({ limit: v }))}
          />
        </PanelSectionRow>
        {state.playback.limit && (
          <>
            <PanelSectionRow>
              <SliderField
                label={t('settings.plays')}
                description={t('settings.playsDesc')}
                value={plays}
                min={1}
                max={20}
                step={1}
                showValue
                onChange={setPlays}
              />
            </PanelSectionRow>
            <PanelSectionRow>
              <DropdownItem
                label={t('settings.then')}
                rgOptions={[
                  { data: 'black', label: t('settings.black') },
                  { data: 'off', label: t('settings.off') },
                ]}
                selectedOption={state.playback.after}
                onChange={(o) => void guard(setPlayback({ after: o.data }))}
              />
            </PanelSectionRow>
          </>
        )}
      </PanelSection>
  );
};

/** Screensaver rotation settings (shown in the Rotation tab). */
export const ShuffleSection: FC = () => {
  useLanguage();
  const state = useBackendState();
  const settings = useClientSettings();
  const active = (settings?.screensaverCurrentId ?? getLastActive()) === 'uioverride-' + state.shuffleFolder;
  const [plays, setPlays] = useDebouncedValue(
    state.shuffle.playsPerVideo,
    (v) => void guard(setShuffle({ playsPerVideo: v })),
  );
  const [classicSeconds, setClassicSeconds] = useDebouncedValue(
    state.shuffle.classicSeconds,
    (v) => void guard(setShuffle({ classicSeconds: v })),
  );
  const on = state.shuffle.enabled && active;

  return (
    <PanelSection title={t('settings.shuffle')}>
      <PanelSectionRow>
        <ToggleField
          label={t('settings.shuffleToggle')}
          description={t('settings.shuffleDesc')}
          checked={on}
          onChange={(v) => void guard(setRotation(v, state.shuffleFolder))}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <DropdownItem
          label={t('settings.order')}
          rgOptions={[
            { data: 'random', label: t('settings.orderRandom') },
            { data: 'sequence', label: t('settings.orderSequence') },
          ]}
          selectedOption={state.shuffle.order}
          onChange={(o) => void guard(setShuffle({ order: o.data }))}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label={t('settings.playsPerVideo')}
          description={t('settings.playsPerVideoDesc')}
          value={plays}
          min={1}
          max={10}
          step={1}
          showValue
          onChange={setPlays}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <SliderField
          label={t('settings.classicSeconds')}
          description={t('settings.classicSecondsDesc')}
          value={classicSeconds}
          min={10}
          max={300}
          step={10}
          showValue
          onChange={setClassicSeconds}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ToggleField
          label={t('settings.shuffleBoomerang')}
          checked={state.shuffle.boomerang}
          onChange={(v) => void guard(setShuffle({ boomerang: v }))}
        />
      </PanelSectionRow>
    </PanelSection>
  );
};

export const SettingsPanel: FC = () => {
  useLanguage();
  const state = useBackendState();
  const settings = useClientSettings();
  const [lang, setLang] = useState<LangSetting>(getLangSetting);

  return (
    <>

      {settings && (
        <PanelSection title={t('settings.power')}>
          <IdleDropdown
            label={t('settings.ssBattery')}
            field={SettingField.idleScreensaverBatterySec}
            value={settings.idleScreensaverBatterySec}
          />
          <IdleDropdown
            label={t('settings.ssAc')}
            field={SettingField.idleScreensaverAcSec}
            value={settings.idleScreensaverAcSec}
          />
          <IdleDropdown
            label={t('settings.sleepBattery')}
            field={SettingField.idleSuspendBatterySec}
            value={settings.idleSuspendBatterySec}
          />
          <IdleDropdown
            label={t('settings.sleepAc')}
            field={SettingField.idleSuspendAcSec}
            value={settings.idleSuspendAcSec}
          />
          <PanelSectionRow>
            <ToggleField
              label={t('settings.inGame')}
              checked={settings.screensaverWhileInGame}
              onChange={(v) => setIntSetting(SettingField.screensaverWhileInGame, v ? 1 : 0)}
            />
          </PanelSectionRow>
        </PanelSection>
      )}

      <AnimationChangerSection />

      <StorageSection />

      <PanelSection title={t('settings.language')}>
        <PanelSectionRow>
          <DropdownItem
            label={t('settings.language')}
            rgOptions={[
              { data: 'auto', label: t('settings.langAuto') },
              { data: 'en', label: LANGUAGE_NAMES.en },
              { data: 'pt-BR', label: LANGUAGE_NAMES['pt-BR'] },
            ]}
            selectedOption={lang}
            onChange={(o) => {
              setLang(o.data);
              void setLangSetting(o.data);
            }}
          />
        </PanelSectionRow>
      </PanelSection>
    </>
  );
};
