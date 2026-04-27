import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle, FileText, ClipboardList, Loader2, AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

function getMarkerRadius(total: number): number {
  if (total <= 1) return 6;
  if (total <= 3) return 8;
  if (total <= 10) return 11;
  if (total <= 20) return 14;
  return 18;
}

export default function CrmMap() {
  const { t } = useLanguage();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const [selected, setSelected] = useState<MapDataItem | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<MapDataItem[]>({
    queryKey: ["/api/crm/map-data"],
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
      if (!map || !data) return;

      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      for (const item of data) {
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
          setSelected(item);
          map.flyTo([item.lat, item.lng], 10, { duration: 1 });
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
  }, [data]);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/crm">
            <Button variant="ghost" size="icon" data-testid="btn-back-crm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <PageHeader title="CRM Map" subtitle="Geographic view of your customers" />
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-h-0">
            <Card className="border-border/50 overflow-hidden" data-testid="map-container">
              <CardContent className="p-0 relative">
                <div
                  ref={mapContainerRef}
                  className="h-[500px] lg:h-[600px] w-full"
                  data-testid="leaflet-map"
                />
                {isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-[1000]">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                {isError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 z-[1000] gap-3">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                    <p className="text-sm text-muted-foreground">Failed to load map data</p>
                    <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="btn-retry-map">
                      <RefreshCw className="h-4 w-4 mr-2" /> Retry
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {data && data.length > 0 && (
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
                <span>{data.length} {data.length === 1 ? "company" : "companies"}</span>
              </div>
            )}
          </div>

          <div className="w-full lg:w-80 shrink-0">
            {selected ? (
              <Card className="border-border/50" data-testid="company-detail">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold">{selected.name}</CardTitle>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {[selected.address, selected.city, selected.country].filter(Boolean).join(", ")}
                    {!selected.geocoded && <span className="ml-2 text-amber-500">(approx.)</span>}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10" data-testid="detail-contacts">
                      <UserCircle className="h-4 w-4 text-emerald-600" />
                      <div>
                        <div className="text-lg font-bold">{selected.contactCount}</div>
                        <div className="text-xs text-muted-foreground">Contacts</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10" data-testid="detail-offers">
                      <FileText className="h-4 w-4 text-amber-600" />
                      <div>
                        <div className="text-lg font-bold">{selected.offerCount}</div>
                        <div className="text-xs text-muted-foreground">Offers</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-500/10" data-testid="detail-orders">
                      <ClipboardList className="h-4 w-4 text-violet-600" />
                      <div>
                        <div className="text-lg font-bold">{selected.orderCount}</div>
                        <div className="text-xs text-muted-foreground">Orders</div>
                      </div>
                    </div>
                  </div>
                  <Link href={`/crm/companies/${selected.id}`}>
                    <Button variant="outline" size="sm" className="w-full mt-2" data-testid="btn-view-company">
                      View company details
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/50 border-dashed" data-testid="company-placeholder">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">Click a marker on the map to see company details</p>
                </CardContent>
              </Card>
            )}

            {data && data.length > 0 && (
              <Card className="border-border/50 mt-4" data-testid="company-list">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide">All Companies</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {data
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((item) => (
                        <button
                          key={item.id}
                          className={`w-full flex items-center justify-between py-2 px-3 rounded-lg text-left transition-colors cursor-pointer text-sm ${
                            selected?.id === item.id
                              ? "bg-primary/10 border border-primary/20"
                              : "hover:bg-muted/50"
                          }`}
                          onClick={() => {
                            setSelected(item);
                            mapRef.current?.flyTo([item.lat, item.lng], 10, { duration: 1 });
                          }}
                          data-testid={`company-row-${item.id}`}
                        >
                          <span className="font-medium truncate">{item.name}</span>
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">{item.city || item.country || ""}</span>
                        </button>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
