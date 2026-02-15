import React, { createContext, useContext, useEffect, useState } from 'react';
import { updateFaviconForPalette } from '@/lib/favicon';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Production default: Light Mode. No system preference — explicit light unless user toggled.
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    return (stored === 'dark' || stored === 'light') ? stored : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.style.colorScheme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

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

  const toggleTheme = () => {
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

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
