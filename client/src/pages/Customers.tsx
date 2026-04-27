import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Building2, UserCircle, MessageSquare, CalendarDays, FileText, ClipboardList, TrendingUp, AlertCircle, RefreshCw, Loader2, Eye, Phone, Mail, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useAuth } from "@/hooks/use-auth";
import { Bar, BarChart, XAxis, YAxis, Cell, AreaChart, Area, CartesianGrid, PieChart, Pie, ComposedChart, Line, LabelList } from "recharts";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface CrmStats {
  counts: {
    totalCompanies: number;
    totalContacts: number;
    totalOffers: number;
    totalOrders: number;
    totalInteractions: number;
    interactionsLast7Days: number;
    activeOrders: number;
    completedOrders: number;
    conversionRate: number;
    openOfferValue: number;
  };
  offersByStatus: { status: string; count: number; value: number; avgValue: number }[];
  ordersByStatus: { status: string; count: number; value: number }[];
  activeOrdersAvgAgeDays: number;
  monthlyOffers: { month: string; count: number; value: number }[];
  monthlyOffersTotals: { count: number; value: number; prevCount: number; prevValue: number };
  interactionsByType: { type: string; count: number }[];
  interactionsDaily: { day: string; count: number }[];
  interactionsTotals: { total30: number; prev30: number };
  topCustomers: {
    id: number;
    name: string;
    offerCount: number;
    totalValue: number;
    orderCount: number;
    lastInteractionAt: string | null;
  }[];
}

interface MapDataItem {
  id: number;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  lat: number;
  lng: number;
  contactCount: number;
  offerCount: number;
  orderCount: number;
  geocoded: boolean;
}

interface CustomerMapDetail {
  contacts: { id: number; firstName: string; lastName: string; email: string | null; mobile: string | null; roles: string[] }[];
  offers: { id: number; referenceNumber: string; subject: string; date: string; totalPrice: number; status: string }[];
  orders: { id: number; jobNumber: string; jobCode: string | null; status: string; year: number | null }[];
}

const STATUS_COLORS: Record<string, string> = {
  Draft: "hsl(215, 70%, 55%)",
  Sent: "hsl(45, 85%, 50%)",
  Accepted: "hsl(142, 60%, 45%)",
  Rejected: "hsl(0, 70%, 55%)",
  Expired: "hsl(0, 0%, 55%)",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  active: "hsl(215, 70%, 55%)",
  completed: "hsl(142, 60%, 45%)",
  cancelled: "hsl(0, 70%, 55%)",
};

const INTERACTION_COLORS = [
  "hsl(215, 70%, 55%)",
  "hsl(142, 60%, 45%)",
  "hsl(45, 85%, 50%)",
  "hsl(280, 60%, 55%)",
  "hsl(0, 70%, 55%)",
  "hsl(180, 50%, 45%)",
];

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`;
  return `€${value.toFixed(0)}`;
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  const monthName = months[parseInt(m, 10) - 1] ?? m;
  return y ? `${monthName} ${y}` : monthName;
}

function formatDayShort(d: string): string {
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function formatDateIt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  active: "Attivi",
  completed: "Completati",
  cancelled: "Annullati",
};

const INTERACTION_TYPE_LABELS: Record<string, string> = {
  call: "Chiamate",
  email: "Email",
  meeting: "Meeting",
  visit: "Visite",
  note: "Note",
  whatsapp: "WhatsApp",
  other: "Altro",
  phone_call: "Chiamate",
  video_call: "Video call",
  offer_created: "Offerta creata",
  offer_versioned: "Nuova versione offerta",
  todo: "To Do",
};

function pctDelta(curr: number, prev: number): { text: string; positive: boolean } | null {
  if (prev === 0) return curr > 0 ? { text: "+100%", positive: true } : null;
  const delta = ((curr - prev) / prev) * 100;
  const rounded = Math.round(delta);
  return { text: `${rounded >= 0 ? "+" : ""}${rounded}%`, positive: rounded >= 0 };
}

type OfferStatusPoint = { status: string; count: number; value: number; avgValue: number };
type OrderStatusPoint = { status: string; count: number; value: number };
type MonthlyPoint = { month: string; count: number; value: number; deltaPct: number | null };
type InteractionPoint = { type: string; count: number };

function getMarkerRadius(total: number): number {
  if (total <= 1) return 6;
  if (total <= 3) return 8;
  if (total <= 10) return 11;
  if (total <= 20) return 14;
  return 18;
}

interface SalesmanUser {
  id: number;
  name: string;
  surname?: string;
}

interface DealerCompany {
  id: number;
  companyName: string;
}

export default function Customers() {
  const { t } = useLanguage();
  const { isMaster } = useAuth();
  const queryClient = useQueryClient();
  const { data: stats, isLoading, isError } = useQuery<CrmStats>({ queryKey: ["/api/crm/stats"] });

  const c = stats?.counts;

  const pipelineConfig: Record<string, { label: string; color: string }> = {};
  stats?.offersByStatus.forEach(s => {
    pipelineConfig[s.status] = { label: s.status, color: STATUS_COLORS[s.status] ?? "hsl(0,0%,50%)" };
  });

  const trendConfig = {
    count: { label: "Offerte", color: "hsl(215, 70%, 55%)" },
    value: { label: "Valore €", color: "hsl(142, 60%, 45%)" },
  };

  const dailyInteractionConfig = {
    count: { label: "Interazioni", color: "hsl(280, 60%, 55%)" },
  };

  const interactionConfig: Record<string, { label: string; color: string }> = {};
  stats?.interactionsByType.forEach((item, i) => {
    interactionConfig[item.type] = {
      label: INTERACTION_TYPE_LABELS[item.type] ?? (item.type.charAt(0).toUpperCase() + item.type.slice(1)),
      color: INTERACTION_COLORS[i % INTERACTION_COLORS.length],
    };
  });

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<MapDataItem | null>(null);

  const [mapSalesmanId, setMapSalesmanId] = useState<string>("all");
  const [mapDealerId, setMapDealerId] = useState<string>("all");

  const { data: salesmen = [] } = useQuery<SalesmanUser[]>({
    queryKey: ["/api/users"],
    enabled: !!isMaster,
  });
  const { data: dealerCompanies = [] } = useQuery<DealerCompany[]>({
    queryKey: ["/api/dealers"],
    enabled: !!isMaster,
  });

  const mapQueryParams = new URLSearchParams();
  if (isMaster && mapSalesmanId !== "all") mapQueryParams.set("salesmanId", mapSalesmanId);
  if (isMaster && mapDealerId !== "all") mapQueryParams.set("dealerId", mapDealerId);
  const mapQs = mapQueryParams.toString();
  const mapUrl = mapQs ? `/api/crm/map-data?${mapQs}` : "/api/crm/map-data";

  const { data: mapData, isLoading: mapLoading, isError: mapError, refetch: refetchMap } = useQuery<MapDataItem[]>({
    queryKey: ["/api/crm/map-data", mapSalesmanId, mapDealerId],
    queryFn: async () => {
      const res = await fetch(mapUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch map data");
      return res.json();
    },
  });

  const { data: customerDetail, isLoading: detailLoading } = useQuery<CustomerMapDetail>({
    queryKey: ["/api/crm/customer-map-detail", selectedCountry?.id],
    enabled: !!selectedCountry,
  });

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;
      const map = L.map(mapContainerRef.current, {
        center: [30, 10],
        zoom: 2,
        minZoom: 2,
        maxZoom: 18,
        scrollWheelZoom: true,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function addMarkers() {
      const map = mapRef.current;
      if (!map || !mapData) return;

      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      for (const item of mapData) {
        const total = item.contactCount + item.offerCount + item.orderCount + 1;

        const marker = L.circleMarker([item.lat, item.lng], {
          radius: getMarkerRadius(total),
          fillColor: item.geocoded ? "hsl(215, 70%, 55%)" : "hsl(45, 85%, 50%)",
          color: item.geocoded ? "hsl(215, 70%, 40%)" : "hsl(45, 85%, 35%)",
          weight: 2,
          opacity: 0.9,
          fillOpacity: 0.6,
        });

        const locationParts = [item.city, item.country].filter(Boolean).join(", ");
        marker.bindTooltip(
          `<strong>${item.name}</strong>${locationParts ? `<br/>${locationParts}` : ""}`,
          { direction: "top", offset: [0, -8] }
        );

        marker.on("click", () => {
          setSelectedCountry(item);
        });

        marker.addTo(map);
        markersRef.current.push(marker);
      }
    }

    if (mapRef.current) {
      addMarkers();
    } else {
      const interval = setInterval(() => {
        if (mapRef.current) {
          clearInterval(interval);
          addMarkers();
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [mapData]);

  return (
    <Layout>
      <div className="space-y-8">
        <PageHeader
          title={t("customers.title")}
          subtitle={t("customers.subtitle")}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl">
          <Link href="/crm/companies">
            <div
              className="group cursor-pointer rounded-2xl border border-border bg-card p-8 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all flex flex-col items-center gap-4"
              data-testid="tile-companies"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-foreground">{t("customers.companies")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {c ? (c.totalCompanies === 1 ? t("customers.oneCompany") : t("customers.nCompanies", { count: String(c.totalCompanies) })) : "..."}
                </p>
              </div>
            </div>
          </Link>

          <Link href="/crm/contacts">
            <div
              className="group cursor-pointer rounded-2xl border border-border bg-card p-8 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all flex flex-col items-center gap-4"
              data-testid="tile-contacts"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <UserCircle className="w-8 h-8 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-foreground">{t("customers.contacts")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {c ? (c.totalContacts === 1 ? t("customers.oneContact") : t("customers.nContacts", { count: String(c.totalContacts) })) : "..."}
                </p>
              </div>
            </div>
          </Link>

          <Link href="/crm/interactions">
            <div
              className="group cursor-pointer rounded-2xl border border-border bg-card p-8 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all flex flex-col items-center gap-4"
              data-testid="tile-interactions"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <MessageSquare className="w-8 h-8 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-foreground">{t("customers.interactions")}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {c ? (c.totalInteractions === 1 ? t("customers.oneInteraction") : t("customers.nInteractions", { count: String(c.totalInteractions) })) : "..."}
                </p>
              </div>
            </div>
          </Link>

          <Link href="/crm/calendar">
            <div
              className="group cursor-pointer rounded-2xl border border-border bg-card p-8 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all flex flex-col items-center gap-4"
              data-testid="tile-calendar"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <CalendarDays className="w-8 h-8 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-foreground">{t("customers.calendar")}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t("customers.viewSchedule")}</p>
              </div>
            </div>
          </Link>
        </div>

        {isError && (
          <Card className="border-destructive/50 bg-destructive/5 max-w-6xl" data-testid="stats-error">
            <CardContent className="flex items-center gap-4 py-4">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Failed to load dashboard statistics</p>
                <p className="text-xs text-muted-foreground mt-0.5">Charts and KPIs may not be available.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/crm/stats"] })}
                data-testid="button-retry-stats"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="max-w-6xl">
          <Card className="border-border/50 overflow-hidden" data-testid="map-container">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Geographic Overview</CardTitle>
                {isMaster && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Select value={mapSalesmanId} onValueChange={(v) => { setMapSalesmanId(v); setSelectedCountry(null); }} data-testid="map-filter-salesman">
                      <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="select-map-salesman">
                        <SelectValue placeholder="All salesmen" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All salesmen</SelectItem>
                        {salesmen.map(s => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.surname ? ` ${s.surname}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={mapDealerId} onValueChange={(v) => { setMapDealerId(v); setSelectedCountry(null); }} data-testid="map-filter-dealer">
                      <SelectTrigger className="h-8 w-[160px] text-xs" data-testid="select-map-dealer">
                        <SelectValue placeholder="All dealers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All dealers</SelectItem>
                        {dealerCompanies.map(d => (
                          <SelectItem key={d.id} value={String(d.id)}>{d.companyName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(mapSalesmanId !== "all" || mapDealerId !== "all") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => { setMapSalesmanId("all"); setMapDealerId("all"); setSelectedCountry(null); }}
                        data-testid="btn-clear-map-filters"
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 relative">
              <div
                ref={mapContainerRef}
                className="h-[350px] lg:h-[420px] w-full"
                data-testid="leaflet-map"
              />
              {mapLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-[1000]">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {mapError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-[1000] gap-3">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                  <p className="text-sm text-muted-foreground">Failed to load map data</p>
                  <Button variant="outline" size="sm" onClick={() => refetchMap()} data-testid="btn-retry-map">
                    <RefreshCw className="h-4 w-4 mr-2" /> Retry
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedCountry && (
            <div className="mt-3 p-4 rounded-lg border border-border bg-card" data-testid="company-detail">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-base">{selectedCountry.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {[selectedCountry.address, selectedCountry.city, selectedCountry.country].filter(Boolean).join(", ")}
                    {!selectedCountry.geocoded && <span className="ml-2 text-amber-500">(approximate location)</span>}
                  </p>
                </div>
                <Link href={`/crm/companies/${selectedCountry.id}`}>
                  <Button variant="outline" size="sm" data-testid="btn-view-company">
                    View details
                  </Button>
                </Link>
              </div>

              {detailLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : customerDetail ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <UserCircle className="h-3.5 w-3.5 text-emerald-600" />
                      Contacts ({customerDetail.contacts.length})
                    </h4>
                    {customerDetail.contacts.length > 0 ? (
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                        {customerDetail.contacts.map(ct => (
                          <div key={ct.id} className="text-sm py-1.5 px-2 rounded bg-muted/30" data-testid={`map-contact-${ct.id}`}>
                            <div className="font-medium">{ct.firstName} {ct.lastName}</div>
                            {ct.roles.length > 0 && (
                              <div className="text-xs text-muted-foreground">{ct.roles.join(", ")}</div>
                            )}
                            <div className="flex items-center gap-3 mt-0.5">
                              {ct.email && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Mail className="h-3 w-3" />{ct.email}
                                </span>
                              )}
                              {ct.mobile && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />{ct.mobile}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No contacts</p>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-amber-600" />
                      Offers ({customerDetail.offers.length})
                    </h4>
                    {customerDetail.offers.length > 0 ? (
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {customerDetail.offers.map(off => (
                          <div key={off.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 text-sm" data-testid={`map-offer-${off.id}`}>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{off.subject}</div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(off.date).toLocaleDateString("it-IT")} — {formatCurrency(off.totalPrice)}
                              </div>
                            </div>
                            <Link href={`/offers/${off.id}`}>
                              <button className="ml-2 p-1 rounded hover:bg-muted transition-colors shrink-0" data-testid={`btn-view-offer-${off.id}`}>
                                <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                              </button>
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No offers</p>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ClipboardList className="h-3.5 w-3.5 text-violet-600" />
                      Orders ({customerDetail.orders.length})
                    </h4>
                    {customerDetail.orders.length > 0 ? (
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {customerDetail.orders.map(ord => (
                          <div key={ord.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30 text-sm" data-testid={`map-order-${ord.id}`}>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{ord.jobNumber}</div>
                              <div className="text-xs text-muted-foreground">
                                {ord.year ?? "—"} — {ord.jobCode || ord.status}
                              </div>
                            </div>
                            <Link href={`/orders/${ord.id}`}>
                              <button className="ml-2 p-1 rounded hover:bg-muted transition-colors shrink-0" data-testid={`btn-view-order-${ord.id}`}>
                                <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                              </button>
                            </Link>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No orders</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {mapData && mapData.length > 0 && !selectedCountry && (
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground px-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500/50 border-2 border-blue-700" />
                <span>Geocoded</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full bg-amber-500/50 border-2 border-amber-700" />
                <span>Approximate</span>
              </div>
              <span className="text-border">|</span>
              <span>{mapData.length} {mapData.length === 1 ? "company" : "companies"}</span>
              <span className="text-border">|</span>
              <span>Click a marker for details</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 max-w-6xl">
          <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50" data-testid="stat-companies">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Customers</CardTitle>
              <div className="p-2 bg-blue-500/10 rounded-full"><Building2 className="h-4 w-4 text-blue-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoading ? "–" : c?.totalCompanies ?? 0}</div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50" data-testid="stat-contacts">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Contacts</CardTitle>
              <div className="p-2 bg-emerald-500/10 rounded-full"><UserCircle className="h-4 w-4 text-emerald-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoading ? "–" : c?.totalContacts ?? 0}</div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50" data-testid="stat-total-offers">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Offers</CardTitle>
              <div className="p-2 bg-amber-500/10 rounded-full"><FileText className="h-4 w-4 text-amber-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoading ? "–" : c?.totalOffers ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{formatCurrency(c?.openOfferValue ?? 0)} open</p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50" data-testid="stat-total-orders">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Orders</CardTitle>
              <div className="p-2 bg-violet-500/10 rounded-full"><ClipboardList className="h-4 w-4 text-violet-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoading ? "–" : c?.totalOrders ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">{c?.activeOrders ?? 0} active</p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50" data-testid="stat-conversion">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Conversion</CardTitle>
              <div className="p-2 bg-teal-500/10 rounded-full"><TrendingUp className="h-4 w-4 text-teal-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoading ? "–" : `${c?.conversionRate ?? 0}%`}</div>
              <p className="text-xs text-muted-foreground mt-1">accepted / closed</p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50" data-testid="stat-activity">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Activity</CardTitle>
              <div className="p-2 bg-orange-500/10 rounded-full"><MessageSquare className="h-4 w-4 text-orange-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{isLoading ? "–" : c?.interactionsLast7Days ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">last 7 days</p>
            </CardContent>
          </Card>
        </div>

        {!isLoading && stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl">
            <Card className="border-border/50" data-testid="chart-pipeline">
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Pipeline offerte per status</CardTitle>
                {c && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" data-testid="badge-conversion-rate">
                    Conversione {c.conversionRate}%
                  </span>
                )}
              </CardHeader>
              <CardContent>
                {stats.offersByStatus.length > 0 ? (
                  <>
                    <ChartContainer config={pipelineConfig} className="aspect-[2/1] w-full">
                      <BarChart data={stats.offersByStatus} layout="vertical" margin={{ left: 8, right: 60, top: 4, bottom: 4 }}>
                        <YAxis dataKey="status" type="category" width={70} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        <XAxis type="number" hide />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              hideIndicator
                              formatter={(_value, _name, item) => {
                                const p = item.payload as OfferStatusPoint;
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-medium text-foreground">{p.status}</span>
                                    <span className="text-muted-foreground">{p.count} offerte</span>
                                    <span className="text-muted-foreground">Totale: {formatCurrency(p.value)}</span>
                                    <span className="text-muted-foreground">Media: {formatCurrency(p.avgValue)}</span>
                                  </div>
                                );
                              }}
                            />
                          }
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                          {stats.offersByStatus.map(entry => (
                            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "hsl(0,0%,60%)"} />
                          ))}
                          <LabelList
                            dataKey="value"
                            position="right"
                            className="fill-muted-foreground"
                            fontSize={11}
                            formatter={(v: number) => formatCurrency(Number(v))}
                          />
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                    {c && (
                      <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1" data-testid="text-pipeline-summary">
                        <span>Aperte: <span className="font-medium text-foreground">{formatCurrency(c.openOfferValue)}</span></span>
                        <span>Totale offerte: <span className="font-medium text-foreground">{c.totalOffers}</span></span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nessuna offerta ancora</p>
                )}
              </CardContent>
            </Card>

            {(() => {
              const monthlyData: MonthlyPoint[] = stats.monthlyOffers.map((m, i, arr) => {
                const prev = i > 0 ? arr[i - 1].value : 0;
                let deltaPct: number | null = null;
                if (i > 0) {
                  if (prev === 0) deltaPct = m.value > 0 ? 100 : null;
                  else deltaPct = Math.round(((m.value - prev) / prev) * 100);
                }
                return { month: m.month, count: m.count, value: m.value, deltaPct };
              });
              const totals = stats.monthlyOffersTotals;
              const valueDelta = totals ? pctDelta(totals.value, totals.prevValue) : null;
              const countDelta = totals ? pctDelta(totals.count, totals.prevCount) : null;
              return (
                <Card className="border-border/50" data-testid="chart-monthly">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Offerte mensili (ultimi 12 mesi)</CardTitle>
                    {totals && (
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1" data-testid="text-monthly-totals">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-semibold text-foreground">{totals.count}</span>
                          <span className="text-xs text-muted-foreground">offerte</span>
                          {countDelta && (
                            <span className={`text-[11px] font-medium ${countDelta.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-monthly-count-delta">
                              ({countDelta.text})
                            </span>
                          )}
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-semibold text-foreground">{formatCurrency(totals.value)}</span>
                          {valueDelta && (
                            <span className={`text-[11px] font-medium ${valueDelta.positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} data-testid="text-monthly-value-delta">
                              ({valueDelta.text})
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground">vs 12 mesi prec.</span>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {monthlyData.length > 0 ? (
                      <ChartContainer config={trendConfig} className="aspect-[2/1] w-full">
                        <ComposedChart data={monthlyData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                          <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis yAxisId="count" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                          <YAxis yAxisId="value" orientation="right" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => formatCurrency(Number(v))} />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                hideIndicator
                                labelFormatter={(label) => formatMonth(String(label))}
                                formatter={(_value, _name, item, index) => {
                                  const p = item.payload as MonthlyPoint;
                                  if (index !== 0) return null;
                                  return (
                                    <div className="flex flex-col gap-0.5 w-full">
                                      <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">Offerte</span>
                                        <span className="font-medium tabular-nums">{p.count}</span>
                                      </div>
                                      <div className="flex justify-between gap-3">
                                        <span className="text-muted-foreground">Valore</span>
                                        <span className="font-medium tabular-nums">{formatCurrency(p.value)}</span>
                                      </div>
                                      {p.deltaPct !== null && (
                                        <div className="flex justify-between gap-3">
                                          <span className="text-muted-foreground">vs mese prec.</span>
                                          <span className={`font-medium tabular-nums ${p.deltaPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                            {p.deltaPct >= 0 ? "+" : ""}{p.deltaPct}%
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                }}
                              />
                            }
                          />
                          <defs>
                            <linearGradient id="fillCount" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(215, 70%, 55%)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(215, 70%, 55%)" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <Area yAxisId="count" type="monotone" dataKey="count" stroke="hsl(215, 70%, 55%)" fill="url(#fillCount)" strokeWidth={2} />
                          <Line yAxisId="value" type="monotone" dataKey="value" stroke="hsl(142, 60%, 45%)" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ChartContainer>
                    ) : (
                      <p className="text-sm text-muted-foreground py-8 text-center">Nessun dato mensile</p>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            <Card className="border-border/50" data-testid="chart-orders">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Ordini per status</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.ordersByStatus.length > 0 ? (
                  <>
                    <ChartContainer
                      config={Object.fromEntries(stats.ordersByStatus.map(s => [s.status, { label: ORDER_STATUS_LABELS[s.status] ?? s.status, color: ORDER_STATUS_COLORS[s.status] ?? "hsl(0,0%,60%)" }]))}
                      className="aspect-[2/1] w-full"
                    >
                      <BarChart data={stats.ordersByStatus} layout="vertical" margin={{ left: 12, right: 64, top: 4, bottom: 4 }}>
                        <YAxis dataKey="status" type="category" width={80} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => ORDER_STATUS_LABELS[v] ?? v} />
                        <XAxis type="number" hide />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              hideIndicator
                              formatter={(_v, _n, item) => {
                                const p = item.payload as OrderStatusPoint;
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-medium text-foreground">{ORDER_STATUS_LABELS[p.status] ?? p.status}</span>
                                    <span className="text-muted-foreground">{p.count} commesse</span>
                                    <span className="text-muted-foreground">Valore: {formatCurrency(p.value)}</span>
                                    {p.status === "active" && (
                                      <span className="text-muted-foreground">Età media: {stats.activeOrdersAvgAgeDays} giorni</span>
                                    )}
                                  </div>
                                );
                              }}
                            />
                          }
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                          {stats.ordersByStatus.map(entry => (
                            <Cell key={entry.status} fill={ORDER_STATUS_COLORS[entry.status] ?? "hsl(0,0%,60%)"} />
                          ))}
                          <LabelList
                            dataKey="value"
                            position="right"
                            className="fill-muted-foreground"
                            fontSize={11}
                            formatter={(v: number) => formatCurrency(Number(v))}
                          />
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                    <div className="mt-2 text-xs text-muted-foreground" data-testid="text-orders-summary">
                      Età media commesse attive: <span className="font-medium text-foreground">{stats.activeOrdersAvgAgeDays} giorni</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nessuna commessa ancora</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="chart-interactions">
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">
                  Interazioni (ultimi 30 giorni)
                </CardTitle>
                {stats.interactionsTotals && (() => {
                  const d = pctDelta(stats.interactionsTotals.total30, stats.interactionsTotals.prev30);
                  return d ? (
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${d.positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}
                      data-testid="badge-interactions-delta"
                    >
                      {d.text} vs 30gg prec.
                    </span>
                  ) : null;
                })()}
              </CardHeader>
              <CardContent>
                {stats.interactionsByType.length > 0 ? (
                  <>
                    <div className="text-xs text-muted-foreground mb-1" data-testid="text-interactions-total">
                      Totale: <span className="font-medium text-foreground">{stats.interactionsTotals?.total30 ?? 0}</span>
                    </div>
                    <ChartContainer config={interactionConfig} className="aspect-[2/1] w-full">
                      <PieChart>
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              hideIndicator
                              formatter={(_v, _n, item) => {
                                const p = item.payload as InteractionPoint;
                                const total = stats.interactionsTotals?.total30 ?? 0;
                                const pct = total > 0 ? Math.round((p.count / total) * 100) : 0;
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-medium text-foreground">{INTERACTION_TYPE_LABELS[p.type] ?? p.type}</span>
                                    <span className="text-muted-foreground">{p.count} ({pct}%)</span>
                                  </div>
                                );
                              }}
                            />
                          }
                        />
                        <Pie
                          data={stats.interactionsByType.map((item, i) => ({
                            ...item,
                            name: INTERACTION_TYPE_LABELS[item.type] ?? item.type,
                            fill: INTERACTION_COLORS[i % INTERACTION_COLORS.length],
                          }))}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="40%"
                          outerRadius="70%"
                          paddingAngle={2}
                          label={({ name, count }) => `${name} (${count})`}
                        />
                      </PieChart>
                    </ChartContainer>
                    {stats.interactionsDaily.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Andamento giornaliero</div>
                        <ChartContainer config={dailyInteractionConfig} className="h-16 w-full">
                          <AreaChart data={stats.interactionsDaily} margin={{ left: 0, right: 0, top: 2, bottom: 0 }}>
                            <defs>
                              <linearGradient id="fillDaily" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(280, 60%, 55%)" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="hsl(280, 60%, 55%)" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="day" hide />
                            <YAxis hide />
                            <ChartTooltip
                              content={
                                <ChartTooltipContent
                                  labelFormatter={(label) => formatDayShort(String(label))}
                                  formatter={(value) => (
                                    <div className="flex justify-between gap-3 w-full">
                                      <span className="text-muted-foreground">Interazioni</span>
                                      <span className="font-medium tabular-nums">{Number(value)}</span>
                                    </div>
                                  )}
                                />
                              }
                            />
                            <Area type="monotone" dataKey="count" stroke="hsl(280, 60%, 55%)" fill="url(#fillDaily)" strokeWidth={1.5} />
                          </AreaChart>
                        </ChartContainer>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nessuna interazione registrata</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/50" data-testid="card-top-customers">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">Top 5 clienti per valore offerte</CardTitle>
              </CardHeader>
              <CardContent>
                {stats.topCustomers.length > 0 ? (
                  <div className="space-y-2">
                    {stats.topCustomers.map((cust, i) => (
                      <Link key={cust.id} href={`/crm/companies/${cust.id}`}>
                        <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer" data-testid={`top-customer-${cust.id}`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-xs font-bold text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{cust.name}</div>
                              <div className="text-[11px] text-muted-foreground truncate">
                                Ultima interazione: {formatDateIt(cust.lastInteractionAt)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-semibold">{formatCurrency(cust.totalValue)}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {cust.offerCount} offerte · {cust.orderCount} commesse
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nessun dato cliente ancora</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

      </div>
    </Layout>
  );
}
