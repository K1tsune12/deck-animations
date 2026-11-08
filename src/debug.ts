// A small in-page log for things that are hard to catch live (preview and
// screensaver activity). Read it from the CEF debugger: window.__deckAnimLog.

const MAX_LINES = 300;

export function log(...parts: unknown[]): void {
  const w = window as any;
  const lines: string[] = (w.__deckAnimLog ??= []);
  lines.push(`${new Date().toISOString().slice(11, 23)} ${parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}`);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
}
