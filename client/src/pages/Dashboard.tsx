import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  FileText, Plus, Users, SlidersHorizontal, Inbox, LogOut, RefreshCw, Trash2,
  Bell, RotateCcw, ClipboardList, CheckCircle2, Wrench, Share2, Plane, Clock, X, Building2, Landmark, Activity, CalendarRange,
  Mail, Phone, MapPin, Video, MessageCircle, Ruler, Pencil, Check, RotateCw, ListTodo, Youtube, HardDrive,
} from "lucide-react";
import { Link } from "wouter";
import { format, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import headerLogo from "@assets/ChatGPT_Image_28_apr_2026,_10_20_34_1777364462068.png";
import { useEffect, useCallback, useRef, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";

interface AppTile {
  href: string;
  label: string;
  icon: React.ElementType;
  color: string;
  masterOnly?: boolean;
  featureKey?: string;
  allowedRoles?: string[];
}


function TileVisual({ tile, badgeCount }: { tile: AppTile; badgeCount?: number }) {
  const Icon = tile.icon;
  const showBadge = typeof badgeCount === "number" && badgeCount > 0;
  const badgeText = showBadge ? (badgeCount! > 99 ? "99+" : String(badgeCount)) : "";
  return (
    <div className="flex flex-col items-center gap-2 sm:gap-3 select-none w-full">
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
        {showBadge && (
          <div
            className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] sm:min-w-[24px] sm:h-[24px] px-1.5 rounded-full bg-red-500 text-white text-[11px] sm:text-xs font-bold flex items-center justify-center shadow-md ring-2 ring-white pointer-events-none z-20"
            data-testid={`badge-tile-${tile.href.replace(/\//g, "-").replace(/^-/, "")}`}
          >
            {badgeText}
          </div>
        )}
      </div>
      <span className="text-xs sm:text-sm font-semibold text-center text-gray-700 leading-tight w-full drop-shadow-sm">
        {tile.label}
      </span>
    </div>
  );
}

function AppIcon({ tile, badgeCount }: { tile: AppTile; badgeCount?: number }) {
  return (
    <Link href={tile.href}>
      <div
        className="cursor-pointer group w-full"
        data-testid={`tile-${tile.href.replace(/\//g, "-").replace(/^-/, "")}`}
      >
        <TileVisual tile={tile} badgeCount={badgeCount} />
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user, isMaster, features, logout, role, hasRole } = useAuth();
  const { t } = useLanguage();

  const INTERNAL_ONLY_ROLES = ["amministrazione", "tecnico", "produzione", "service"];
  const isInternalOnly = INTERNAL_ONLY_ROLES.includes(role);
  const canAccessEnquiries = isMaster;
  const canAccessValidations = isMaster;

  const { data: enquiries = [] } = useQuery<any[]>({
    queryKey: ["/api/enquiries"],
    staleTime: 0,
    refetchInterval: 30000,
    enabled: canAccessEnquiries,
  });

  const { data: pendingValidations } = useQuery<{ customers: any[]; contacts: any[] }>({
    queryKey: ["/api/pending-validations"],
    staleTime: 0,
    refetchInterval: 30000,
    enabled: canAccessValidations,
  });

  const canAccessEmail = isMaster;
  const { data: emailUnread } = useQuery<{ unreadCount: number; totalCount: number }>({
    queryKey: ["/api/email/unread-count"],
    staleTime: 0,
    refetchInterval: 60000,
    enabled: canAccessEmail,
  });

  const { data: allOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/orders"],
    staleTime: 0,
    refetchInterval: 30000,
    enabled: isMaster,
  });

  const pendingValidationCount = (pendingValidations?.customers?.length ?? 0) + (pendingValidations?.contacts?.length ?? 0);

  type NotifItem = { id: number; icon: React.ElementType; color: string; message: string; sub: string; href: string; time?: string };

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("dismissed_notifications") || "[]")); }
    catch { return new Set(); }
  });

  const dismissNotification = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem("dismissed_notifications", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const pendingConfirmationOrders = isMaster ? allOrders.filter((o: any) => (o.confirmationStatus ?? "pending") === "pending" && !o.deletedAt) : [];

  const allNotifications: NotifItem[] = [
    ...pendingConfirmationOrders.map((o: any) => ({
      id: o.id + 8000000,
      icon: ClipboardList,
      color: "text-amber-500 bg-amber-50",
      message: t("masterDashboard.orderToConfirm", { jobNumber: o.jobNumber }),
      sub: t("masterDashboard.orderToConfirmSub"),
      href: `/orders/${o.id}`,
      time: o.updatedAt || o.createdAt,
    })),
    ...(pendingValidations?.customers ?? []).filter((c: any) => c.accountStatus === "Pending Validation").map((c: any) => ({
      id: c.id + 2000000,
      icon: Clock,
      color: "text-amber-500 bg-amber-50",
      message: t("masterDashboard.companyPendingValidation", { name: c.name }),
      sub: t("masterDashboard.companyPendingValidationSub"),
      href: `/crm/companies/${c.id}`,
      time: c.createdAt,
    })),
    ...(pendingValidations?.customers ?? []).filter((c: any) => c.accountStatus === "Pending Deletion").map((c: any) => ({
      id: c.id + 4000000,
      icon: Trash2,
      color: "text-red-500 bg-red-50",
      message: t("masterDashboard.companyDeletionRequested", { name: c.name }),
      sub: t("masterDashboard.companyDeletionRequestedSub"),
      href: `/crm/companies/${c.id}`,
      time: c.updatedAt || c.createdAt,
    })),
    ...(pendingValidations?.contacts ?? []).filter((c: any) => c.contactStatus === "Pending Validation").map((c: any) => ({
      id: c.id + 3000000,
      icon: Clock,
      color: "text-amber-500 bg-amber-50",
      message: t("masterDashboard.contactPendingValidation", { name: `${c.firstName} ${c.lastName}` }),
      sub: t("masterDashboard.contactPendingValidationSub"),
      href: `/crm/contacts/${c.id}`,
      time: c.createdAt,
    })),
    ...(pendingValidations?.contacts ?? []).filter((c: any) => c.contactStatus === "Pending Deletion").map((c: any) => ({
      id: c.id + 5000000,
      icon: Trash2,
      color: "text-red-500 bg-red-50",
      message: t("masterDashboard.contactDeletionRequested", { name: `${c.firstName} ${c.lastName}` }),
      sub: t("masterDashboard.contactDeletionRequestedSub"),
      href: `/crm/contacts/${c.id}`,
      time: c.updatedAt || c.createdAt,
    })),
    ...(enquiries as any[])
      .filter((e: any) => e.status === "pending")
      .map((e: any) => ({
        id: e.id,
        icon: Inbox,
        color: "text-blue-500 bg-blue-50",
        message: t("masterDashboard.newEnquiry", { subject: e.subject || e.referenceNumber }),
        sub: t("masterDashboard.newEnquirySub", { dealer: e.dealer ? `${e.dealer.name} ${e.dealer.surname || ""}`.trim() : "dealer" }),
        href: `/enquiries/${e.id}`,
        time: e.createdAt ?? e.date,
      })),
    ...(enquiries as any[])
      .filter((e: any) => e.status === "revision_requested")
      .map((e: any) => ({
        id: e.id * 1000,
        icon: RotateCcw,
        color: "text-amber-500 bg-amber-50",
        message: t("masterDashboard.revisionRequested", { subject: e.subject || e.referenceNumber }),
        sub: t("masterDashboard.revisionRequestedSub", { dealer: e.dealer ? `${e.dealer.name} ${e.dealer.surname || ""}`.trim() : "dealer" }),
        href: `/enquiries/${e.id}`,
        time: e.updatedAt ?? e.date,
      })),
  ].slice(0, 8);

  const notifications = allNotifications.filter(n => !dismissedIds.has(String(n.id)));

  const markedRef = useRef(false);
  useEffect(() => {
    if (notifications.length > 0 && !markedRef.current) {
      markedRef.current = true;
      const ids = notifications.map(n => String(n.id));
      sessionStorage.setItem("seen_notifications", JSON.stringify(ids));
    }
  }, [notifications]);

  const seenIds = (() => {
    try { return new Set(JSON.parse(sessionStorage.getItem("seen_notifications") || "[]")); }
    catch { return new Set(); }
  })();
  const unseenNotifications = notifications.filter(n => !seenIds.has(String(n.id)));
  const pendingEnquiryCount = unseenNotifications.length;

  const today = format(new Date(), "EEEE, MMMM d");

  const allTiles: AppTile[] = [
    {
      href: "/talents",
      label: "Talent",
      icon: Users,
      color: "bg-gradient-to-br from-pink-500 to-rose-600",
    },
    {
      href: "/crm",
      label: "Brand & CRM",
      icon: Building2,
      color: "bg-gradient-to-br from-sky-400 to-blue-600",
    },
    {
      href: "/quotes",
      label: "Preventivi",
      icon: FileText,
      color: "bg-gradient-to-br from-violet-500 to-purple-700",
    },
    {
      href: "/campaigns",
      label: "Campagne",
      icon: ClipboardList,
      color: "bg-gradient-to-br from-indigo-400 to-indigo-700",
    },
    {
      href: "/campaigns/timeline",
      label: "Timeline",
      icon: CalendarRange,
      color: "bg-gradient-to-br from-teal-400 to-cyan-600",
    },
    {
      href: "/email",
      label: "Email",
      icon: Mail,
      color: "bg-gradient-to-br from-red-400 to-rose-600",
    },
    {
      href: "/recap",
      label: "Recap",
      icon: Activity,
      color: "bg-gradient-to-br from-fuchsia-500 to-pink-600",
    },
    {
      href: "/drive-archive",
      label: "Drive",
      icon: HardDrive,
      color: "bg-gradient-to-br from-yellow-400 via-green-500 to-blue-500",
    },
    {
      href: "/settings",
      label: t("masterDashboard.settings"),
      icon: SlidersHorizontal,
      color: "bg-gradient-to-br from-rose-400 to-pink-600",
      masterOnly: true,
    },
  ];

  const visibleTiles = allTiles.filter(tile => {
    if (tile.masterOnly) return isMaster;
    if (tile.allowedRoles) {
      if (isMaster) return true;
      if (!tile.allowedRoles.includes(role)) return false;
    }
    if (tile.featureKey) return isMaster || !!(features as any)?.[tile.featureKey];
    return true;
  });

  // ---- Dashboard tile reordering (iOS-style edit mode) ----
  const queryClient = useQueryClient();
  const { data: tileOrderData } = useQuery<{ order: string[] | null }>({
    queryKey: ["/api/user-preferences/dashboard-tile-order"],
  });
  const savedOrder = tileOrderData?.order ?? null;

  // Computed each render (small list); ensures up-to-date labels/icons
  // when language or feature flags change.
  const orderedTiles: AppTile[] = (() => {
    if (!savedOrder || savedOrder.length === 0) return visibleTiles;
    const byHref = new Map(visibleTiles.map(t => [t.href, t]));
    const used = new Set<string>();
    const result: AppTile[] = [];
    for (const href of savedOrder) {
      const t = byHref.get(href);
      if (t && !used.has(href)) {
        result.push(t);
        used.add(href);
      }
    }
    for (const t of visibleTiles) {
      if (!used.has(t.href)) result.push(t);
    }
    return result;
  })();

  const [editMode, setEditMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<AppTile[] | null>(null);
  const tilesToRender = editMode && localOrder ? localOrder : orderedTiles;

  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const pendingOrderRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (editMode) {
      setLocalOrder(orderedTiles);
      dirtyRef.current = false;
    } else {
      setLocalOrder(null);
      dirtyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  // While in edit mode, if the saved order arrives/changes and the user
  // has not yet modified anything, re-sync local state so the first drag
  // doesn't overwrite the persisted order with a stale baseline.
  useEffect(() => {
    if (editMode && !dirtyRef.current) {
      setLocalOrder(orderedTiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedTiles.map(t => t.href).join("|"), editMode]);

  const saveOrderMutation = useMutation({
    mutationFn: (order: string[]) =>
      apiRequest("PUT", "/api/user-preferences/dashboard-tile-order", { order }),
    onMutate: (order: string[]) => {
      // Optimistic update so the UI keeps the new order immediately,
      // even before the server responds and the query refetches.
      queryClient.setQueryData(
        ["/api/user-preferences/dashboard-tile-order"],
        { order },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-preferences/dashboard-tile-order"] });
    },
  });

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const order = pendingOrderRef.current;
    if (order) {
      pendingOrderRef.current = null;
      saveOrderMutation.mutate(order);
    }
  }, [saveOrderMutation]);

  const scheduleSave = useCallback((order: string[]) => {
    pendingOrderRef.current = order;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const o = pendingOrderRef.current;
      if (o) {
        pendingOrderRef.current = null;
        saveOrderMutation.mutate(o);
      }
    }, 350);
  }, [saveOrderMutation]);

  const resetOrderMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/user-preferences/dashboard-tile-order"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-preferences/dashboard-tile-order"] });
      pendingOrderRef.current = null;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      dirtyRef.current = false;
      setLocalOrder(null);
      setEditMode(false);
    },
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const src = result.source.index;
    const dst = result.destination.index;
    if (src === dst) return;
    const base = localOrder ?? orderedTiles;
    const next = Array.from(base);
    const [moved] = next.splice(src, 1);
    next.splice(dst, 0, moved);
    dirtyRef.current = true;
    setLocalOrder(next);
    scheduleSave(next.map(t => t.href));
  };

  const exitEditMode = useCallback(() => {
    flushSave();
    setEditMode(false);
  }, [flushSave]);

  // Clear any pending debounced save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingOrderRef.current = null;
    };
  }, []);

  // Long-press to enter edit mode (touch + mouse)
  const longPressTimerRef = useRef<number | null>(null);
  const handleLongPressStart = useCallback(() => {
    if (editMode) return;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      setEditMode(true);
    }, 600);
  }, [editMode]);
  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  return (
    <div className="min-h-screen bg-white flex flex-col relative overflow-hidden">

      {/* Paint explosion — left side (full effect on desktop only) */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[45%] hidden md:block" aria-hidden>
        <div className="absolute -left-20 top-10 w-72 h-72 rounded-full bg-red-500 opacity-70 blur-2xl" />
        <div className="absolute -left-10 top-40 w-56 h-56 rounded-full bg-yellow-400 opacity-60 blur-2xl" />
        <div className="absolute left-0 bottom-16 w-80 h-80 rounded-full bg-blue-500 opacity-60 blur-2xl" />
        <div className="absolute -left-16 bottom-40 w-48 h-48 rounded-full bg-green-400 opacity-55 blur-xl" />
        <div className="absolute left-12 top-1/2 w-40 h-40 rounded-full bg-pink-500 opacity-50 blur-xl" />
        <div className="absolute -left-8 top-1/4 w-52 h-52 rounded-full bg-orange-400 opacity-50 blur-2xl" />
      </div>

      {/* Paint explosion — right side (full effect on desktop only) */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[45%] hidden md:block" aria-hidden>
        <div className="absolute -right-20 top-8 w-72 h-72 rounded-full bg-cyan-400 opacity-65 blur-2xl" />
        <div className="absolute -right-10 top-48 w-60 h-60 rounded-full bg-purple-500 opacity-60 blur-2xl" />
        <div className="absolute right-0 bottom-20 w-80 h-80 rounded-full bg-rose-500 opacity-60 blur-2xl" />
        <div className="absolute -right-14 bottom-44 w-48 h-48 rounded-full bg-lime-400 opacity-55 blur-xl" />
        <div className="absolute right-10 top-1/2 w-44 h-44 rounded-full bg-violet-500 opacity-50 blur-xl" />
        <div className="absolute -right-6 top-1/4 w-52 h-52 rounded-full bg-teal-400 opacity-50 blur-2xl" />
      </div>

      {/* Mobile-only accent bubbles — top-left & bottom-right corners */}
      <div className="pointer-events-none absolute inset-0 md:hidden" aria-hidden>
        {/* Top-left cluster */}
        <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full bg-pink-400 opacity-55 blur-2xl" />
        <div className="absolute -top-8 left-10 w-36 h-36 rounded-full bg-red-500 opacity-45 blur-2xl" />
        <div className="absolute top-16 -left-10 w-40 h-40 rounded-full bg-orange-400 opacity-50 blur-2xl" />
        <div className="absolute top-32 left-4 w-28 h-28 rounded-full bg-yellow-400 opacity-45 blur-xl" />
        {/* Bottom-right cluster */}
        <div className="absolute -bottom-16 -right-16 w-60 h-60 rounded-full bg-cyan-400 opacity-55 blur-2xl" />
        <div className="absolute -bottom-8 right-12 w-36 h-36 rounded-full bg-blue-500 opacity-45 blur-2xl" />
        <div className="absolute bottom-20 -right-10 w-40 h-40 rounded-full bg-violet-500 opacity-50 blur-2xl" />
        <div className="absolute bottom-36 right-4 w-28 h-28 rounded-full bg-purple-500 opacity-45 blur-xl" />
      </div>

      {/* Top bar */}
      <header className="h-14 border-b border-white/40 bg-white/30 backdrop-blur-md sticky top-0 z-50 relative flex items-center justify-end px-4 md:px-6 gap-4">
        <Link href="/" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex items-center cursor-pointer select-none">
            <img src={headerLogo} className="h-36 w-auto object-contain" alt="Talent Studio" data-testid="img-dashboard-logo" />
          </div>
        </Link>

        <div className="flex items-center gap-2">
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
      <main className="flex-1 flex items-center justify-center p-6 md:p-12 relative z-10">
        <div className="w-full max-w-[1400px] flex flex-col gap-12">
          <div className="text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">{today}</p>
            <h1 className="text-4xl font-display font-bold text-gray-800 drop-shadow-sm">
              {t("dashboard.welcome", { name: user?.name?.split(" ")[0] || "" })}
            </h1>
          </div>

          <div className="relative">
            {/* Edit mode toolbar */}
            <div className="flex items-center justify-end gap-2 mb-2 min-h-[32px]">
              {editMode ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-gray-600 hover:bg-white/40"
                    onClick={() => resetOrderMutation.mutate()}
                    data-testid="button-reset-tile-order"
                  >
                    <RotateCw className="h-3.5 w-3.5 mr-1" />
                    Ripristina ordine predefinito
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={exitEditMode}
                    data-testid="button-done-edit-tiles"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Fine
                  </Button>
                </>
              ) : null}
            </div>

            {editMode ? (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="dashboard-tiles" direction="horizontal">
                  {(droppableProvided) => (
                    <div
                      ref={droppableProvided.innerRef}
                      {...droppableProvided.droppableProps}
                      className="dashboard-tile-row"
                      data-testid="tile-grid"
                    >
                      {tilesToRender.map((tile, index) => (
                        <Draggable key={tile.href} draggableId={tile.href} index={index}>
                          {(draggableProvided, snapshot) => (
                            <div
                              ref={draggableProvided.innerRef}
                              {...draggableProvided.draggableProps}
                              {...draggableProvided.dragHandleProps}
                              className={cn(
                                "dashboard-tile-cell",
                                snapshot.isDragging && "tile-dragging",
                              )}
                              style={draggableProvided.draggableProps.style}
                              data-testid={`tile-edit-${tile.href.replace(/\//g, "-").replace(/^-/, "")}`}
                            >
                              <div className="tile-wiggle-inner">
                                <TileVisual tile={tile} />
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {droppableProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            ) : (
              <div className="dashboard-tile-row" data-testid="tile-grid">
                {tilesToRender.map(tile => (
                  <div
                    key={tile.href}
                    className="dashboard-tile-cell"
                    onMouseDown={handleLongPressStart}
                    onMouseUp={handleLongPressEnd}
                    onMouseLeave={handleLongPressEnd}
                    onTouchStart={handleLongPressStart}
                    onTouchEnd={handleLongPressEnd}
                    onTouchMove={handleLongPressEnd}
                    onTouchCancel={handleLongPressEnd}
                  >
                    <AppIcon tile={tile} badgeCount={tile.href === "/email" ? emailUnread?.unreadCount : undefined} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notifications box */}
          <div className="w-full max-w-2xl mx-auto backdrop-blur-md bg-white/40 border border-white/50 rounded-2xl shadow-lg overflow-hidden" data-testid="notifications-box">
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
                        <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/30 transition-colors cursor-pointer group/notif" data-testid={`notif-item-${n.id}`}>
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
                            onClick={(e) => dismissNotification(String(n.id), e)}
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

        </div>
      </main>
    </div>
  );
}
