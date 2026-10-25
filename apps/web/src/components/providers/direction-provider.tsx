'use client';

import * as React from 'react';

export type Direction = 'rtl' | 'ltr';
export type Locale = 'ar' | 'en';

interface DirectionContextType {
  dir: Direction;
  locale: Locale;
  setDirection: (dir: Direction) => void;
  toggleDirection: () => void;
  isRtl: boolean;
}

const DirectionContext = React.createContext<DirectionContextType | undefined>(
  undefined,
);

const STORAGE_KEY_DIR = 'uacm-dir';
const STORAGE_KEY_LOCALE = 'uacm-locale';

export interface DirectionProviderProps {
  children: React.ReactNode;
  defaultDirection?: Direction;
  defaultLocale?: Locale;
}

export function DirectionProvider({
  children,
  defaultDirection = 'rtl',
  defaultLocale = 'ar',
}: DirectionProviderProps) {
  const [dir, setDirState] = React.useState<Direction>(defaultDirection);
  const [locale, setLocaleState] = React.useState<Locale>(defaultLocale);

  // Initialize from localStorage if available
  React.useEffect(() => {
    try {
      const savedDir = localStorage.getItem(
        STORAGE_KEY_DIR,
      ) as Direction | null;
      const savedLocale = localStorage.getItem(
        STORAGE_KEY_LOCALE,
      ) as Locale | null;

      if (savedDir && (savedDir === 'rtl' || savedDir === 'ltr')) {
        setDirState(savedDir);
      }
      if (savedLocale && (savedLocale === 'ar' || savedLocale === 'en')) {
        setLocaleState(savedLocale);
      }
    } catch {
      // Ignore SSR/storage access errors
    }
  }, []);

  // Sync with document element
  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = dir;
      document.documentElement.lang = locale;
    }
  }, [dir, locale]);

  const setDirection = React.useCallback((newDir: Direction) => {
    const newLocale: Locale = newDir === 'rtl' ? 'ar' : 'en';
    setDirState(newDir);
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY_DIR, newDir);
      localStorage.setItem(STORAGE_KEY_LOCALE, newLocale);
    } catch {
      // Ignore
    }
    if (typeof document !== 'undefined') {
      document.documentElement.dir = newDir;
      document.documentElement.lang = newLocale;
    }
  }, []);

  const toggleDirection = React.useCallback(() => {
    setDirection(dir === 'rtl' ? 'ltr' : 'rtl');
  }, [dir, setDirection]);

  const value = React.useMemo(
    () => ({
      dir,
      locale,
      setDirection,
      toggleDirection,
      isRtl: dir === 'rtl',
    }),
    [dir, locale, setDirection, toggleDirection],
  );

  return (
    <DirectionContext.Provider value={value}>
      <div dir={dir} data-direction={dir} className="w-full min-h-screen">
        {children}
      </div>
    </DirectionContext.Provider>
  );
}

export function useDirection(): DirectionContextType {
  const context = React.useContext(DirectionContext);
  if (!context) {
    throw new Error('useDirection must be used within a DirectionProvider');
  }
  return context;
}
