// "Check for updates" button for the Quick Access panel.
//
// Self-contained on purpose: the same file is copied into every Kitsune Decky
// plugin, so it carries its own strings and needs nothing from the plugin
// besides its repo name, its Decky name and the current UI language.
//
// The installed version comes from Decky itself (DeckyPluginLoader.plugins),
// the latest one from the GitHub Releases API. One request per click, no
// background polling, no backend call.

import { ButtonItem, Navigation, PanelSectionRow } from '@decky/ui';
import { FC, useState } from 'react';

type Lang = 'en' | 'pt-BR';

const STRINGS = {
  en: {
    check: 'Check for updates',
    checking: 'Checking...',
    installed: 'Installed: v{v}',
    current: 'Up to date (v{v})',
    available: 'Update available: v{v}',
    open: 'Open release v{v}',
    error: 'Could not check: {e}',
  },
  'pt-BR': {
    check: 'Verificar atualizações',
    checking: 'Verificando...',
    installed: 'Instalada: v{v}',
    current: 'Atualizado (v{v})',
    available: 'Atualização disponível: v{v}',
    open: 'Abrir release v{v}',
    error: 'Não foi possível verificar: {e}',
  },
} as const;

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current'; latest: string }
  | { kind: 'available'; latest: string; url: string }
  | { kind: 'error'; message: string };

const clean = (v: string) => v.trim().replace(/^v/i, '');

/** Compares the numeric x.y.z part only; anything after it is ignored. */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    clean(v)
      .split(/[-+]/)[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

function installedVersion(pluginName: string): string {
  const loader = (window as any).DeckyPluginLoader;
  const plugin = loader?.plugins?.find((p: { name: string }) => p.name === pluginName);
  return plugin?.version ? clean(String(plugin.version)) : '';
}

async function fetchLatest(repo: string): Promise<{ tag: string; url: string }> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 403 || res.status === 429) throw new Error('GitHub rate limit');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return { tag: clean(String(json.tag_name ?? '')), url: String(json.html_url ?? '') };
}

export const UpdateCheckButton: FC<{ repo: string; pluginName: string; lang: Lang }> = ({
  repo,
  pluginName,
  lang,
}) => {
  const s = STRINGS[lang] ?? STRINGS.en;
  const fill = (text: string, vars: Record<string, string>) =>
    text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const current = installedVersion(pluginName);

  const check = async () => {
    setState({ kind: 'checking' });
    try {
      const { tag, url } = await fetchLatest(repo);
      if (!tag) throw new Error('no release');
      setState(
        current && !isNewer(tag, current)
          ? { kind: 'current', latest: tag }
          : { kind: 'available', latest: tag, url }
      );
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  let description = current ? fill(s.installed, { v: current }) : '';
  let label: string = s.check;
  if (state.kind === 'checking') label = s.checking;
  if (state.kind === 'current') description = fill(s.current, { v: state.latest });
  if (state.kind === 'error') description = fill(s.error, { e: state.message });
  if (state.kind === 'available') {
    description = fill(s.available, { v: state.latest });
    label = fill(s.open, { v: state.latest });
  }

  return (
    <PanelSectionRow>
      <ButtonItem
        layout="below"
        description={description}
        disabled={state.kind === 'checking'}
        onClick={() => {
          if (state.kind === 'available' && state.url) Navigation.NavigateToExternalWeb(state.url);
          else void check();
        }}
      >
        {label}
      </ButtonItem>
    </PanelSectionRow>
  );
};
