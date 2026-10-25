/**
 * Theme context.
 *
 * Dark by default, with a light variant one tap away. The choice persists so a
 * trader who prefers light does not have to re-select it every launch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { darkTheme, lightTheme, type Theme } from "../theme";
import { getMeta, setMeta } from "../db/store";

interface ThemeValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue>({ theme: darkTheme, toggle: () => undefined });

const META_KEY = "theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<"dark" | "light">("dark");

  // Read the stored preference once. A failure here is not worth blocking the
  // app over: it falls back to the dark default.
  useEffect(() => {
    try {
      const stored = getMeta(META_KEY);
      if (stored === "light" || stored === "dark") setName(stored);
    } catch {
      // Storage read failed; the default theme stands.
    }
  }, []);

  const toggle = useCallback(() => {
    setName((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        setMeta(META_KEY, next);
      } catch {
        // Persisting failed; the in-memory choice still applies this session.
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ theme: name === "dark" ? darkTheme : lightTheme, toggle }),
    [name, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

export function useThemeToggle(): () => void {
  return useContext(ThemeContext).toggle;
}
