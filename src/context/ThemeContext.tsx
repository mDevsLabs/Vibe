/**
 * ============================================================================
 * VIBE SOCIAL PLATFORM — THEME CONTEXT (src/context/ThemeContext.tsx)
 * Global Theme Manager: Light (Default), Dark & System + Personnalisation
 * (couleur d'accent, taille de texte) appliquée via variables CSS.
 * ============================================================================
 */

import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
export type AccentColor = 'white' | 'blue' | 'violet' | 'emerald' | 'rose' | 'amber';
export type FontSize = 'small' | 'medium' | 'large';

interface ThemeContextType {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemeMode) => void;
  accentColor: AccentColor;
  setAccentColor: (c: AccentColor) => void;
  fontSize: FontSize;
  setFontSize: (s: FontSize) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = 'vibe_theme_preference';
const ACCENT_KEY = 'vibe_accent_color';
const FONT_KEY = 'vibe_font_size';

/** Couleurs d'accent disponibles (hex clairs, lisibles avec du texte noir). */
export const ACCENT_COLORS: Record<AccentColor, { label: string; hex: string }> = {
  white: { label: 'Blanc', hex: '#ffffff' },
  blue: { label: 'Bleu', hex: '#7cc4ff' },
  violet: { label: 'Violet', hex: '#c4b5fd' },
  emerald: { label: 'Émeraude', hex: '#6ee7b7' },
  rose: { label: 'Rose', hex: '#fda4af' },
  amber: { label: 'Ambre', hex: '#fcd34d' },
};

const FONT_SIZES: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px',
};

function loadStored<T extends string>(key: string, allowed: T[], fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const saved = localStorage.getItem(key) as T | null;
  return saved && allowed.includes(saved) ? saved : fallback;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Global default is 'light' as explicitly requested
  const [theme, setThemeState] = useState<ThemeMode>(() => loadStored<ThemeMode>(STORAGE_KEY, ['light', 'dark', 'system'], 'light'));
  const [accentColor, setAccentState] = useState<AccentColor>(() => loadStored<AccentColor>(ACCENT_KEY, ['white', 'blue', 'violet', 'emerald', 'rose', 'amber'], 'white'));
  const [fontSize, setFontState] = useState<FontSize>(() => loadStored<FontSize>(FONT_KEY, ['small', 'medium', 'large'], 'medium'));

  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Listen to OS system theme changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  // Apply theme attributes to document and update mobile theme-color meta tag
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      body.classList.add('dark');
      body.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      body.classList.add('light');
      body.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }

    // Update mobile status bar theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', resolvedTheme === 'dark' ? '#000000' : '#ffffff');
    }
  }, [resolvedTheme]);

  // Personnalisation : couleur d'accent (variable CSS) + taille de texte racine
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--vibe-accent', ACCENT_COLORS[accentColor].hex);
    root.style.fontSize = FONT_SIZES[fontSize];
  }, [accentColor, fontSize]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, newTheme);
    }
  };

  const setAccentColor = (c: AccentColor) => {
    setAccentState(c);
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACCENT_KEY, c);
    }
  };

  const setFontSize = (s: FontSize) => {
    setFontState(s);
    if (typeof window !== 'undefined') {
      localStorage.setItem(FONT_KEY, s);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, accentColor, setAccentColor, fontSize, setFontSize }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
