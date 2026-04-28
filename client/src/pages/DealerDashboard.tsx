import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { FileText, PlusCircle, Users, LogOut, ClipboardList, Bell, CheckCircle2, FileCheck, Clock, Share2, FilePlus2, Palette, ScrollText, Package, Send, X, Settings } from "lucide-react";
import { Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { YouTubeChannelWidget } from "@/components/YouTubeChannelWidget";

interface AppTile {
  href: string;
  label: string;
  icon: React.ElementType;
  color: string;
}

function AppIcon({ tile }: { tile: AppTile }) {
  const Icon = tile.icon;
  return (
    <Link href={tile.href}>
      <div
        className="flex flex-col items-center gap-2 sm:gap-3 cursor-pointer group select-none w-full"
        data-testid={`tile-${tile.href.replace(/\//g, "-").replace(/^-/, "")}`}
      >
        <div className="relative w-[90%] mx-auto">
          <div
            className={cn(
              "w-full aspect-square rounded-[18%] flex items-center justify-center relative overflow-hidden",
              "transition-all duration-200 ease-out",
              "group-hover:scale-105 group-hover:shadow-2xl group-active:scale-95",
              "shadow-lg",
              tile.color,
            )}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/10 to-transparent pointer-events-none" />
            <div className="absolute inset-0 ring-1 ring-inset ring-white/30 pointer-events-none rounded-[18%]" />
            <Icon className="w-[38%] h-[38%] text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] relative z-10" strokeWidth={1.5} />
          </div>
        </div>
        <span className="text-xs sm:text-sm font-semibold text-center text-gray-700 leading-tight w-full drop-shadow-sm">
          {tile.label}
        </span>
      </div>
    </Link>
  );
}

export default function DealerDashboard() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  const { data: enquiries = [] } = useQuery<any[]>({
    queryKey: ["/api/dealer/enquiries"],
    staleTime: 0,
    refetchInterval: 30000,
  });



  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("dismissed_dealer_notifications") || "[]")); }
    catch { return new Set(); }
  });

  const dismissNotification = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem("dismissed_dealer_notifications", JSON.stringify([...next]));
      return next;
    });
  }, []);

  type NotifItem = { id: string; icon: React.ElementType; color: string; message: string; sub: string; href: string; time?: string };

  const allNotifications: NotifItem[] = [
    ...(enquiries as any[])
      .filter((e: any) => e.linkedOfferStatus === "Sent")
      .map((e: any) => ({
        id: `offer-ready-${e.id}`,
        icon: FileCheck,
        color: "text-green-600 bg-green-50",
        message: t("dealerPortal.offerReady", { subject: e.subject || e.referenceNumber }),
        sub: t("dealerPortal.offerReadySub"),
        href: `/dealer/offers/${e.linkedOfferId}`,
        time: e.updatedAt ?? e.date,
      })),
    ...(enquiries as any[])
      .filter((e: any) => e.linkedOfferId && e.linkedOfferStatus && e.linkedOfferStatus !== "Sent")
      .map((e: any) => ({
        id: `offer-status-${e.id}`,
        icon: FilePlus2,
        color: "text-blue-600 bg-blue-50",
        message: e.linkedOfferStatus === "Draft"
          ? t("dealerPortal.offerInPreparation", { subject: e.subject || e.referenceNumber })
          : t("dealerPortal.offerCreated", { subject: e.subject || e.referenceNumber }),
        sub: e.linkedOfferStatus === "Draft"
          ? t("dealerPortal.offerInPreparationSub")
          : t("dealerPortal.offerCreatedSub"),
        href: `/dealer/offers/${e.linkedOfferId}`,
        time: e.updatedAt ?? e.date,
      })),
    ...(enquiries as any[])
      .filter((e: any) => e.status === "pending" && !e.linkedOfferId)
      .map((e: any) => ({
        id: `awaiting-${e.id}`,
        icon: Clock,
        color: "text-gray-500 bg-gray-100",
        message: t("dealerPortal.awaitingOffer", { subject: e.subject || e.referenceNumber }),
        sub: t("dealerPortal.awaitingOfferSub"),
        href: `/dealer/requests`,
        time: e.createdAt ?? e.date,
      })),
  ].slice(0, 8);

  const notifications = allNotifications.filter(n => !dismissedIds.has(n.id));

  const markedRef = useRef(false);
  useEffect(() => {
    if (notifications.length > 0 && !markedRef.current) {
      markedRef.current = true;
      const ids = notifications.map(n => n.id);
      sessionStorage.setItem("seen_dealer_notifications", JSON.stringify(ids));
    }
  }, [notifications]);

  const seenIds = (() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("seen_dealer_notifications") || "[]")); }
    catch { return new Set(); }
  })();
  const unseenNotifications = notifications.filter(n => !seenIds.has(n.id));
  const pendingCount = unseenNotifications.length;

  const today = format(new Date(), "EEEE, MMMM d");

  const tiles: AppTile[] = [
    {
      href: "/dealer/requests",
      label: t("dealerPortal.myRequests"),
      icon: FileText,
      color: "bg-gradient-to-br from-violet-500 to-purple-700",
    },

    {
      href: "/dealer/supplier-offers",
      label: t("dealerPortal.supplierOffers"),
      icon: Package,
      color: "bg-gradient-to-br from-indigo-400 to-blue-600",
    },
    {
      href: "/dealer/offers",
      label: t("dealerPortal.customerOffers"),
      icon: Send,
      color: "bg-gradient-to-br from-orange-400 to-red-500",
    },
    {
      href: "/dealer/customers",
      label: t("dealerPortal.crm"),
      icon: Users,
      color: "bg-gradient-to-br from-sky-400 to-blue-600",
    },
    {
      href: "/dealer/share-hub",
      label: t("dealerPortal.shareHub"),
      icon: Share2,
      color: "bg-gradient-to-br from-cyan-400 to-blue-600",
    },
    {
      href: "/dealer/settings",
      label: t("dealerPortal.settings"),
      icon: Settings,
      color: "bg-gradient-to-br from-slate-400 to-slate-600",
    },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col relative overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[45%]" aria-hidden>
        <div className="absolute -left-20 top-10 w-72 h-72 rounded-full bg-red-500 opacity-70 blur-2xl" />
        <div className="absolute -left-10 top-40 w-56 h-56 rounded-full bg-yellow-400 opacity-60 blur-2xl" />
        <div className="absolute left-0 bottom-16 w-80 h-80 rounded-full bg-blue-500 opacity-60 blur-2xl" />
        <div className="absolute -left-16 bottom-40 w-48 h-48 rounded-full bg-green-400 opacity-55 blur-xl" />
        <div className="absolute left-12 top-1/2 w-40 h-40 rounded-full bg-pink-500 opacity-50 blur-xl" />
        <div className="absolute -left-8 top-1/4 w-52 h-52 rounded-full bg-orange-400 opacity-50 blur-2xl" />
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-0 w-[45%]" aria-hidden>
        <div className="absolute -right-20 top-8 w-72 h-72 rounded-full bg-cyan-400 opacity-65 blur-2xl" />
        <div className="absolute -right-10 top-48 w-60 h-60 rounded-full bg-purple-500 opacity-60 blur-2xl" />
        <div className="absolute right-0 bottom-20 w-80 h-80 rounded-full bg-rose-500 opacity-60 blur-2xl" />
        <div className="absolute -right-14 bottom-44 w-48 h-48 rounded-full bg-lime-400 opacity-55 blur-xl" />
        <div className="absolute right-10 top-1/2 w-44 h-44 rounded-full bg-violet-500 opacity-50 blur-xl" />
        <div className="absolute -right-6 top-1/4 w-52 h-52 rounded-full bg-teal-400 opacity-50 blur-2xl" />
      </div>

      <header className="h-14 border-b border-white/40 bg-white/30 backdrop-blur-md sticky top-0 z-50 relative flex items-center justify-end px-4 md:px-6 gap-4">
        <Link href="/" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex items-center gap-2 cursor-pointer select-none">
            <img src="/api/dashboard-logo" className="h-8 w-auto object-contain" alt="QuotePilot" />
            <span className="font-display font-bold text-base tracking-tight text-gray-800">QuotePilot</span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-gray-600 hover:text-red-500 hover:bg-white/40"
            onClick={() => logout()}
            title={t("common.logout")}
            data-testid="button-dealer-logout"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 md:p-12 relative z-10">
        <div className="w-full max-w-[1400px] flex flex-col gap-12">
          <div className="text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1" data-testid="text-today-date">{today}</p>
            <h1 className="text-4xl font-display font-bold text-gray-800 drop-shadow-sm" data-testid="text-dealer-welcome">
              {t("dashboard.welcome", { name: user?.name?.split(" ")[0] || "" })}
            </h1>
          </div>

          <div className="dashboard-tile-row" data-testid="dealer-tile-grid">
            {tiles.map(tile => (
              <div key={tile.href} className="dashboard-tile-cell">
                <AppIcon tile={tile} />
              </div>
            ))}
          </div>

          {/* Notifications box */}
          <div className="w-full max-w-2xl mx-auto backdrop-blur-md bg-white/40 border border-white/50 rounded-2xl shadow-lg overflow-hidden" data-testid="dealer-notifications-box">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/40">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-bold text-gray-700">{t("dashboard.notifications")}</span>
              </div>
            </div>
            {notifications.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
                <CheckCircle2 className="w-4 h-4" />
                {t("dashboard.allCaughtUp")}
              </div>
            ) : (
              <ul className="divide-y divide-white/30">
                {notifications.map(n => {
                  const Icon = n.icon;
                  return (
                    <li key={n.id}>
                      <Link href={n.href}>
                        <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/30 transition-colors cursor-pointer group/notif" data-testid={`dealer-notif-item-${n.id}`}>
                          <span className={cn("mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0", n.color)}>
                            <Icon className="w-3.5 h-3.5" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{n.message}</p>
                            <p className="text-xs text-gray-500 truncate">{n.sub}</p>
                          </div>
                          {n.time && (
                            <span className="text-[11px] text-gray-400 shrink-0 mt-0.5">
                              {formatDistanceToNow(new Date(n.time), { addSuffix: true })}
                            </span>
                          )}
                          <button
                            onClick={(e) => dismissNotification(n.id, e)}
                            className="shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/60 opacity-0 group-hover/notif:opacity-100 transition-opacity"
                            title={t("dashboard.dismiss")}
                            data-testid={`button-dismiss-notif-${n.id}`}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="w-full max-w-2xl mx-auto">
            <YouTubeChannelWidget maxVideos={6} />
          </div>
        </div>
      </main>
    </div>
  );
}
