import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { translate, type Locale } from "@qayda/domain";
const KEY = "qayda-display-preferences-v1";
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
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("ru");
  const [large, updateLarge] = useState(false);
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const raw =
          Platform.OS === "web"
            ? globalThis.localStorage?.getItem(KEY)
            : await SecureStore.getItemAsync(KEY);
        const saved = JSON.parse(raw ?? "null");
        if (active) {
          if (saved?.locale === "kk") updateLocale("kk");
          if (saved?.large === true) updateLarge(true);
        }
      } catch {
        /* A blocked store must not prevent catalog access. */
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);
  const save = (nextLocale: Locale, nextLarge: boolean) => {
    const value = JSON.stringify({ locale: nextLocale, large: nextLarge });
    if (Platform.OS === "web") {
      try {
        globalThis.localStorage?.setItem(KEY, value);
      } catch {
        /* Optional preferences. */
      }
    } else void SecureStore.setItemAsync(KEY, value).catch(() => {});
  };
  return (
    <Context.Provider
      value={{
        locale,
        large,
        setLocale: (v) => {
          updateLocale(v);
          save(v, large);
        },
        setLarge: (v) => {
          updateLarge(v);
          save(locale, v);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const value = useContext(Context);
  return { ...value, t: (text: string) => translate(text, value.locale) };
}
