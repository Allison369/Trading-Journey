/**
 * Theme.
 *
 * Dark is the default because the app is used at 3am in a dark room as often as
 * during the day. Light is fully supported, not a washed-out afterthought.
 *
 * The choice is persisted and applied to `<html data-theme>` so the CSS token
 * sets switch together. An inline script in index.html applies the saved theme
 * before first paint, so there is no flash of the wrong theme on reload.
 */

import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "tradevault.theme";

function readInitial(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
    // First visit: respect the operating system's preference, but default dark.
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
    return "dark";
  } catch {
    return "dark";
  }
}

export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Storage can be unavailable (private mode). The theme still applies for
      // this session; it just will not be remembered. Not worth an error.
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === "dark" ? "light" : "dark")), []);

  return { theme, toggle, setTheme };
}
