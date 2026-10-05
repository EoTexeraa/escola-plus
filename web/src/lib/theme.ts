import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const listeners = new Set<() => void>();
const media = window.matchMedia('(prefers-color-scheme: dark)');

function read(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

let current: Theme = read();

export function setTheme(t: Theme) {
  current = t;
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  try {
    if (t === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', t);
  } catch { /* armazenamento indisponível: só não lembra a escolha */ }
  listeners.forEach((l) => l());
}

media.addEventListener('change', () => listeners.forEach((l) => l()));

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

/** Tema global (um único estado para o app todo). */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current);
  const isDark = useSyncExternalStore(subscribe, () => current === 'dark' || (current === 'system' && media.matches));
  return { theme, isDark, setTheme, toggle: () => setTheme(isDark ? 'light' : 'dark') };
}
