import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatPanel } from "./components/ChatPanel";
import "./index.css";

const queryClient = new QueryClient();

const THEME_STORAGE_KEY = "fla-theme";

type Theme = "light" | "dark";

function App() {
  const getInitialTheme = useMemo<() => Theme>(() => {
    return () => {
      if (typeof window === "undefined") {
        return "dark";
      }
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        return stored;
      }
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      return prefersDark ? "dark" : "light";
    };
  }, []);

  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage failures
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        theme === "dark"
          ? "bg-slate-950 text-slate-100"
          : "bg-slate-100 text-slate-900"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="Foreign Language Assessment logosu"
              className="h-12 w-auto"
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Yabancı Dil Mülakat Koçu
              </p>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                TOEFL tarzı konuşma pratiği için rehberiniz
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-slate-500 dark:hover:text-white"
            aria-label="Tema değiştir"
          >
            {theme === "dark" ? "Açık Tema" : "Koyu Tema"}
          </button>
        </header>
        <ChatPanel />
        <footer className="text-center text-xs text-slate-500 dark:text-slate-400">
          İngilizce konuşma pratiği için tasarlandı · Tüm yönlendirmeler ve değerlendirmeler Türkçe arayüz üzerinden sunulur
        </footer>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
