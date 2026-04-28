import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LogOut, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import headerLogo from "@assets/ChatGPT_Image_28_apr_2026,_10_20_34_1777364462068.png";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const [location] = useLocation();
  const isHome = location === "/" || location === "";
  const isFullWidth = location === "/campaigns/timeline";

  return (
    <div className="min-h-screen bg-white flex flex-col relative overflow-hidden">

      {/* Paint explosion — left side */}
      <div className="pointer-events-none fixed inset-y-0 left-0 w-[45%]" aria-hidden>
        <div className="absolute -left-20 top-10 w-72 h-72 rounded-full bg-red-500 opacity-70 blur-2xl" />
        <div className="absolute -left-10 top-40 w-56 h-56 rounded-full bg-yellow-400 opacity-60 blur-2xl" />
        <div className="absolute left-0 bottom-16 w-80 h-80 rounded-full bg-blue-500 opacity-60 blur-2xl" />
        <div className="absolute -left-16 bottom-40 w-48 h-48 rounded-full bg-green-400 opacity-55 blur-xl" />
        <div className="absolute left-12 top-1/2 w-40 h-40 rounded-full bg-pink-500 opacity-50 blur-xl" />
        <div className="absolute -left-8 top-1/4 w-52 h-52 rounded-full bg-orange-400 opacity-50 blur-2xl" />
      </div>

      {/* Paint explosion — right side */}
      <div className="pointer-events-none fixed inset-y-0 right-0 w-[45%]" aria-hidden>
        <div className="absolute -right-20 top-8 w-72 h-72 rounded-full bg-cyan-400 opacity-65 blur-2xl" />
        <div className="absolute -right-10 top-48 w-60 h-60 rounded-full bg-purple-500 opacity-60 blur-2xl" />
        <div className="absolute right-0 bottom-20 w-80 h-80 rounded-full bg-rose-500 opacity-60 blur-2xl" />
        <div className="absolute -right-14 bottom-44 w-48 h-48 rounded-full bg-lime-400 opacity-55 blur-xl" />
        <div className="absolute right-10 top-1/2 w-44 h-44 rounded-full bg-violet-500 opacity-50 blur-xl" />
        <div className="absolute -right-6 top-1/4 w-52 h-52 rounded-full bg-teal-400 opacity-50 blur-2xl" />
      </div>

      {/* Top bar */}
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
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 relative z-10 flex flex-col">
        {isFullWidth ? (
          <div className="flex-1 w-full animate-slide-up">
            {children}
          </div>
        ) : (
          <div className="p-4 md:p-8 max-w-7xl mx-auto w-full animate-slide-up">
            {children}
          </div>
        )}
      </main>
    </div>
  );
}
