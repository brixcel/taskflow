import { createContext } from 'react';

export const THEME_STORAGE_KEY = 'taskflow_theme';

export const ThemeContext = createContext({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});
