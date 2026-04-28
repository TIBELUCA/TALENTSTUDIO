import { createContext, useContext, useEffect, ReactNode } from "react";
import { Language, translations } from "./translations";

type TranslationKey = keyof typeof translations.en;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string, params?: Record<string, string>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const FIXED_LANGUAGE: Language = "it";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const language: Language = FIXED_LANGUAGE;
  const setLanguage = (_lang: Language) => {
    // App is Italian-only; switching is intentionally a no-op.
  };

  useEffect(() => {
    try { localStorage.removeItem("app-language"); } catch { /* ignore */ }
    document.documentElement.lang = language;
  }, [language]);

  const t = (path: string, params?: Record<string, string>) => {
    const keys = path.split(".");
    let value: any = translations[language];

    for (const key of keys) {
      if (value[key] === undefined) return path;
      value = value[key];
    }

    if (typeof value !== "string") return path;

    if (params) {
      return Object.entries(params).reduce(
        (acc, [key, val]) => acc.replace(`{${key}}`, val),
        value
      );
    }

    return value;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
