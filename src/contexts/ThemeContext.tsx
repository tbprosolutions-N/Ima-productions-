import React, { createContext, useContext, useEffect } from 'react';
import { updateFaviconForPalette } from '@/lib/favicon';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Light mode only; dark mode removed per product requirement.
  const theme: Theme = 'light';

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';
    try { localStorage.setItem('theme', 'light'); } catch { }
  }, []);

  useEffect(() => {
    let palette = localStorage.getItem('ima_palette') || 'bw';
    // Customer request: system is black & white; migrate any saved magenta to bw
    if (palette === 'magenta') {
      palette = 'bw';
      localStorage.setItem('ima_palette', 'bw');
    }
    document.documentElement.dataset.palette = palette;
    updateFaviconForPalette(palette);
  }, []);

  const toggleTheme = () => { /* no-op: light only */ };
  const setTheme = (_newTheme: Theme) => { /* no-op: light only */ };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
