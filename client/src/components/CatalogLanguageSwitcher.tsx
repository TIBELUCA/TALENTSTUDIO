import { useState, useEffect } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export type CatalogLang = "it" | "en" | "de" | "fr" | "es" | "pt";

const FLAGS: { code: CatalogLang; flag: string; label: string }[] = [
  { code: "it", flag: "🇮🇹", label: "Italiano" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "de", flag: "🇩🇪", label: "Deutsch" },
  { code: "fr", flag: "🇫🇷", label: "Français" },
  { code: "es", flag: "🇪🇸", label: "Español" },
  { code: "pt", flag: "🇵🇹", label: "Português" },
];

const STORAGE_KEY = "catalog-language";

export function useCatalogLanguage(): [CatalogLang, (l: CatalogLang) => void] {
  const { language } = useLanguage();
  const [catalogLang, setCatalogLang] = useState<CatalogLang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && FLAGS.some(f => f.code === saved)) return saved as CatalogLang;
    return (language === "it" || language === "en") ? language : "it";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, catalogLang);
  }, [catalogLang]);

  return [catalogLang, setCatalogLang];
}

interface CatalogLanguageSwitcherProps {
  value: CatalogLang;
  onChange: (lang: CatalogLang) => void;
  className?: string;
}

export function CatalogLanguageSwitcher({ value, onChange, className = "" }: CatalogLanguageSwitcherProps) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`} data-testid="catalog-language-switcher">
      {FLAGS.map(f => (
        <button
          key={f.code}
          type="button"
          onClick={() => onChange(f.code)}
          title={f.label}
          className={`text-lg px-1.5 py-1 rounded transition-all ${
            value === f.code
              ? "bg-primary/10 ring-1 ring-primary/40 scale-110"
              : "opacity-40 hover:opacity-80 hover:bg-muted"
          }`}
          data-testid={`btn-catalog-lang-${f.code}`}
        >
          {f.flag}
        </button>
      ))}
    </div>
  );
}
