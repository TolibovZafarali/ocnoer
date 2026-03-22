"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "ocnoer-admin-theme";

type AdminTheme = "light" | "dark";

type AdminThemeContextValue = {
  theme: AdminTheme;
  toggleTheme: () => void;
};

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

type AdminThemeProviderProps = {
  children: ReactNode;
};

export function AdminThemeProvider({ children }: AdminThemeProviderProps) {
  const [theme, setTheme] = useState<AdminTheme>("light");
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(STORAGE_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }

    setHasLoadedPreference(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedPreference) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [hasLoadedPreference, theme]);

  const contextValue = useMemo<AdminThemeContextValue>(
    () => ({
      theme,
      toggleTheme: () => {
        setTheme((previousTheme) =>
          previousTheme === "dark" ? "light" : "dark"
        );
      }
    }),
    [theme]
  );

  return (
    <AdminThemeContext.Provider value={contextValue}>
      <div
        className={theme === "dark" ? "admin-area-theme admin-theme-dark" : "admin-area-theme"}
        data-admin-theme={theme}
      >
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
}

export function AdminThemeToggle() {
  const context = useContext(AdminThemeContext);

  if (!context) {
    throw new Error("AdminThemeToggle must be used within AdminThemeProvider.");
  }

  const { theme, toggleTheme } = context;
  const isDarkTheme = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={isDarkTheme}
      className="admin-theme-toggle rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
    >
      {isDarkTheme ? "Light mode" : "Dark mode"}
    </button>
  );
}
