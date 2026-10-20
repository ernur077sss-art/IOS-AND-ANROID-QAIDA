"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { translate, type Locale } from "@qayda/domain";

const Context = createContext({
  locale: "ru" as Locale,
  large: false,
  setLocale: (value: Locale) => {
    void value;
  },
  setLarge: (value: boolean) => {
    void value;
  },
});
const KEY = "qayda-display-preferences-v1";
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("ru");
  const [large, updateLarge] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved?.locale === "kk") updateLocale("kk");
      if (saved?.large === true) updateLarge(true);
    } catch {
      /* Preferences are optional when storage is blocked. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.reading = large ? "large" : "normal";
  }, [locale, large]);
  const save = (nextLocale: Locale, nextLarge: boolean) => {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ locale: nextLocale, large: nextLarge }),
      );
    } catch {
      /* In-memory settings still work. */
    }
  };
  const setLocale = (v: Locale) => {
    updateLocale(v);
    save(v, large);
  };
  const setLarge = (v: boolean) => {
    updateLarge(v);
    save(locale, v);
  };
  return (
    <Context.Provider value={{ locale, large, setLocale, setLarge }}>
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const preferences = useContext(Context);
  return {
    ...preferences,
    t: (value: string) => translate(value, preferences.locale),
  };
}
export function DisplayControls() {
  const { locale, setLocale, large, setLarge, t } = usePreferences();
  return (
    <div
      className="display-controls"
      role="group"
      aria-label={t("Настройки чтения")}
    >
      <div className="language-controls" role="group" aria-label={t("Язык")}>
        <button
          type="button"
          lang="kk"
          aria-pressed={locale === "kk"}
          onClick={() => setLocale("kk")}
        >
          Қазақша
        </button>
        <button
          type="button"
          lang="ru"
          aria-pressed={locale === "ru"}
          onClick={() => setLocale("ru")}
        >
          Русский
        </button>
      </div>
      <button
        type="button"
        className="reading-toggle secondary"
        aria-pressed={large}
        onClick={() => setLarge(!large)}
      >
        <span aria-hidden="true">Aа</span>{" "}
        {t(large ? "Обычный текст" : "Крупный текст")}
      </button>
    </div>
  );
}
