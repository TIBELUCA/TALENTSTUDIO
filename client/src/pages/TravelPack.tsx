import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Download, Loader2, Wifi, WifiOff, Trash2, RefreshCw,
  Package, Wrench, Users, Inbox, FileText, Clock, Power,
} from "lucide-react";
import { useTravelPack, useOfflineDrafts } from "@/hooks/use-travel-pack";
import { Link } from "wouter";
import { isTravelPackEnabled, setTravelPackEnabled } from "@/lib/travelPackSettings";

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number | string; color: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-white">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold">{value}</p>
      </div>
    </div>
  );
}

export default function TravelPack() {
  const { isOnline, hasPack, meta, downloading, syncing, download, syncDrafts, clearPack } = useTravelPack();
  const { drafts } = useOfflineDrafts();
  const unsyncedCount = drafts.filter(d => !d.synced).length;
  const [enabled, setEnabled] = useState(() => isTravelPackEnabled());

  const handleToggle = useCallback((checked: boolean) => {
    setEnabled(checked);
    setTravelPackEnabled(checked);
  }, []);

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl">
        <PageHeader
          title="Travel Pack"
          subtitle="Download data for offline access"
          actions={
            <Badge
              variant="outline"
              className={isOnline ? "border-green-300 text-green-700 bg-green-50" : "border-red-300 text-red-700 bg-red-50"}
              data-testid="badge-online-status"
            >
              {isOnline ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
              {isOnline ? "Online" : "Offline"}
            </Badge>
          }
        />

        <Card className={!enabled ? "border-muted bg-muted/30" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Power className={`w-5 h-5 ${enabled ? "text-green-600" : "text-muted-foreground"}`} />
                Travel Pack
              </CardTitle>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-medium ${enabled ? "text-green-700" : "text-muted-foreground"}`} data-testid="text-travel-pack-status">
                  {enabled ? "Attivo" : "Disattivato"}
                </span>
                <Switch
                  checked={enabled}
                  onCheckedChange={handleToggle}
                  data-testid="switch-travel-pack-toggle"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {enabled ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Your Travel Pack is downloaded automatically at login and refreshed every 20 minutes.
                  It includes the machine catalog, customer data, enquiries, and recent offers for offline use.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={download}
                    disabled={downloading || !isOnline}
                    data-testid="button-download-pack"
                  >
                    {downloading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    {downloading ? "Downloading…" : hasPack ? "Update Travel Pack" : "Download Travel Pack"}
                  </Button>
                  {hasPack && (
                    <Button variant="outline" onClick={clearPack} data-testid="button-clear-pack">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Travel Pack è disattivato. Il download automatico e manuale sono sospesi. Attiva per ripristinare la funzionalità.
              </p>
            )}
          </CardContent>
        </Card>

        {hasPack && meta && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pack Contents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={Wrench} label="Machines" value={meta.machineCount} color="bg-slate-600" />
                <StatCard icon={Users} label="Customers" value={meta.customerCount} color="bg-blue-600" />
                <StatCard icon={Inbox} label="Enquiries" value={meta.enquiryCount} color="bg-orange-600" />
                <StatCard icon={FileText} label="Offers" value={meta.offerCount} color="bg-violet-600" />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Downloaded {new Date(meta.downloadedAt).toLocaleString()}
              </div>
            </CardContent>
          </Card>
        )}

        {drafts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Offline Drafts
                {unsyncedCount > 0 && (
                  <Badge className="bg-amber-500 text-white text-[10px]">{unsyncedCount} unsynced</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {drafts.map(draft => (
                <div
                  key={draft.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  data-testid={`draft-${draft.id}`}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {draft.offerData?.subject || "Untitled Offer"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(draft.createdAt).toLocaleString()}
                      {draft.sourceEnquiryId && ` · From enquiry #${draft.sourceEnquiryId}`}
                    </p>
                  </div>
                  <Badge variant="outline" className={draft.synced ? "border-green-300 text-green-700" : "border-amber-300 text-amber-700"}>
                    {draft.synced ? "Synced" : "Pending"}
                  </Badge>
                </div>
              ))}

              {isOnline && unsyncedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncDrafts}
                  disabled={syncing}
                  data-testid="button-sync-drafts"
                >
                  {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Sync Now
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {!isOnline && hasPack && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <WifiOff className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">You're offline</p>
                  <p className="text-xs text-amber-600 mt-1">
                    You can browse machines, view enquiries, and create draft offers.
                    Drafts will sync automatically when you reconnect.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Link href="/machines">
                      <Button variant="outline" size="sm" data-testid="link-offline-machines">
                        <Wrench className="w-3.5 h-3.5 mr-1" /> Machines
                      </Button>
                    </Link>
                    <Link href="/enquiries">
                      <Button variant="outline" size="sm" data-testid="link-offline-enquiries">
                        <Inbox className="w-3.5 h-3.5 mr-1" /> Enquiries
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
