import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LogOut, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import headerLogo from "@assets/ChatGPT_Image_28_apr_2026,_10_20_34_1777364462068.png";

export function AppHeader() {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const [location] = useLocation();
  const isHome = location === "/" || location === "";

  return (
    <header className="h-14 border-b border-white/40 bg-white/30 backdrop-blur-md sticky top-0 z-50 relative flex items-center px-4 md:px-6 gap-2">
      {!isHome && (
        <button
          onClick={() => window.history.back()}
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/50 transition-colors text-gray-600 hover:text-gray-900 shrink-0"
          data-testid="button-header-back"
          aria-label="Go back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
      )}
      <div className="flex-1" />
      <Link href="/" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex items-center cursor-pointer select-none">
          <img src={headerLogo} className="h-36 w-auto object-contain" alt="Talent Studio" data-testid="img-header-logo" />
        </div>
      </Link>

      <div className="flex items-center gap-2">
        {isHome && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-gray-600 hover:bg-white/40"
            onClick={() => window.location.reload()}
            title="Aggiorna pagina"
            aria-label="Aggiorna pagina"
            data-testid="button-header-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-gray-600 hover:text-red-500 hover:bg-white/40"
          onClick={() => logout()}
          title={t("common.logout")}
          data-testid="button-header-logout"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
