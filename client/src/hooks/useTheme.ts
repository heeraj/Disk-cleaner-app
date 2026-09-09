import { useCallback, useEffect, useState } from 'react';
import type { ThemeMode } from '../types';

const KEY = 'disk-cleaner-theme';

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return 'light';
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function useTheme(initial?: ThemeMode) {
  const [theme, setThemeState] = useState<ThemeMode>(() => initial ?? readStored());

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: ThemeMode) => setThemeState(t), []);
  const toggle = useCallback(
    () => setThemeState((t) => (t === 'light' ? 'dark' : 'light')),
    []
  );

  return { theme, setTheme, toggle };
}
