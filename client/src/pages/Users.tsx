import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Plus, Trash2, Pencil, ChevronDown, ChevronRight, Clock, Activity, Loader2, ShieldCheck, Download } from "lucide-react";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import { type SalesmanFeatures, DEFAULT_SALESMAN_FEATURES, USER_ROLE_LABELS, type UserRole } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function isSameDay(isoDatetime: string, dateStr: string): boolean {
  return new Date(isoDatetime).toLocaleDateString("sv") === dateStr;
}

function downloadActivityCSV(logs: ActivityLog[], dateStr: string, label?: string) {
  const headers = ["Date & Time", "Actor", "Performed By", "Action", "Offer Reference"];
  const rows = logs.map(log => [
    new Date(log.createdAt).toLocaleString(),
    log.dealerUserId ? "Dealer" : log.salesmanUserId ? "Salesman" : "Master",
    log.performedBy || "",
    ACTION_LABELS[log.action] ?? log.action,
    log.offerReference || "",
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity${label ? "-" + label : ""}-${dateStr}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

interface MasterProfile {
  name: string;
  surname: string;
  email: string;
  mobileNumber: string;
}

interface SalesmanUser {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
  isMasterSalesman: boolean;
  role: UserRole;
  features: SalesmanFeatures;
  loginCount: number;
  lastLogin: string | null;
  activityCount: number;
  createdAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  head_of_talent: "bg-amber-100 text-amber-700 border-amber-300",
  talent_manager: "bg-blue-100 text-blue-700 border-blue-300",
  talent: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

function RoleBadge({ role }: { role: string }) {
  const colorClass = ROLE_COLORS[role] || "bg-gray-100 text-gray-700 border-gray-300";
  const label = USER_ROLE_LABELS[role as UserRole] || role;
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide border ${colorClass}`}>
      {label.toUpperCase()}
    </span>
  );
}

interface LoginRecord {
  id: number;
  loginAt: string;
  deviceInfo: string | null;
  ipAddress: string | null;
}

interface ActivityLog {
  id: number;
  performedBy: string;
  action: string;
  offerId: number | null;
  offerReference: string | null;
  salesmanUserId: number | null;
  dealerUserId: number | null;
  createdAt: string;
}

const FEATURE_LABELS: Record<keyof SalesmanFeatures, string> = {
  canCreateOffers: "Create Offers",
  canEditOffers: "Edit Offers",
  canDeleteOffers: "Delete Offers",
  canManageCustomers: "Manage Customers",
  canViewMachines: "View Machines",
  canViewPresets: "View Presets",
  canUseFormat: "Format Settings",
  canManageSpecialMachines: "Manage Special Machines",
};

function _FeatureToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function LoginHistory({ userId }: { userId: number }) {
  const { data, isLoading } = useQuery<LoginRecord[]>({
    queryKey: ["/api/users", userId, "logins"],
    queryFn: () => fetch(`/api/users/${userId}/logins`, { credentials: "include" }).then(async r => {
      if (!r.ok) throw new Error("Failed to load history");
      return r.json();
    }),
    staleTime: 0,
  });

  if (isLoading) return <div className="py-2 text-sm text-muted-foreground">Loading history...</div>;
  if (!data?.length) return <div className="py-2 text-sm text-muted-foreground">No login records.</div>;

  return (
    <div className="mt-2 rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date &amp; Time</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead>Device</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.slice(0, 20).map(r => (
            <TableRow key={r.id}>
              <TableCell className="text-xs">{new Date(r.loginAt).toLocaleString()}</TableCell>
              <TableCell className="text-xs">{r.ipAddress || "—"}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate">{r.deviceInfo || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  offer_created: "Offer Created",
  offer_updated: "Offer Edited",
  offer_version_created: "New Version Created",
  offer_exported: "Offer Exported (Word)",
  offer_created_from_enquiry: "Offer Created from Enquiry",
  dealer_login: "Dealer Login",
  dealer_logout: "Dealer Logout",
  enquiry_submitted: "Enquiry Submitted",
  dealer_viewed_offer: "Dealer Viewed Offer",
  dealer_edited_prices: "Dealer Edited Prices",
  dealer_requested_revision: "Dealer Requested Revision",
  dealer_downloaded_pdf: "Dealer Downloaded PDF",
};

function ActivityHistory({ userId, userName }: { userId: number; userName: string }) {
  const [selectedDate, setSelectedDate] = useState(todayStr());

  const { data, isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/users", userId, "activity"],
    queryFn: () => fetch(`/api/users/${userId}/activity`, { credentials: "include" }).then(async r => {
      if (!r.ok) throw new Error("Failed to load activity");
      return r.json();
    }),
    staleTime: 0,
  });

  const filtered = (data || []).filter(r => isSameDay(r.createdAt, selectedDate));

  if (isLoading) return <div className="py-2 text-sm text-muted-foreground">Loading activity...</div>;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          data-testid={`input-activity-date-${userId}`}
          className="text-xs border rounded px-2 py-1 bg-background text-foreground"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          disabled={filtered.length === 0}
          data-testid={`button-download-activity-${userId}`}
          onClick={() => downloadActivityCSV(filtered, selectedDate, userName.replace(/\s+/g, "-"))}
        >
          <Download className="w-3 h-3" />
          Download CSV
        </Button>
        <span className="text-xs text-muted-foreground">{filtered.length} event{filtered.length !== 1 ? "s" : ""}</span>
      </div>
      {!data?.length ? (
        <p className="py-2 text-sm text-muted-foreground">No activity recorded yet.</p>
      ) : filtered.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No activity on this date.</p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date &amp; Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Offer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{ACTION_LABELS[r.action] ?? r.action}</TableCell>
                  <TableCell className="text-xs font-mono">{r.offerReference || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ActorBadge({ log }: { log: ActivityLog }) {
  if (log.dealerUserId) {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">Dealer</span>;
  }
  if (log.salesmanUserId) {
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Salesman</span>;
  }
  return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Master</span>;
}

function MasterActivityLog() {
  const [showLog, setShowLog] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayStr());

  const { data, isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity-logs/all"],
    queryFn: () => fetch("/api/activity-logs/all", { credentials: "include" }).then(r => r.json()),
    enabled: showLog,
    staleTime: 0,
  });

  const filtered = (data || []).filter(r => isSameDay(r.createdAt, selectedDate));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">All Activity Log</h2>
          <p className="text-sm text-muted-foreground">Full audit trail of all actions by master, salesmen, and dealers</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {showLog && (
            <>
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                data-testid="input-activity-log-date"
                className="text-xs border rounded px-2 py-1 bg-background text-foreground"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                disabled={filtered.length === 0}
                data-testid="button-download-activity-log"
                onClick={() => downloadActivityCSV(filtered, selectedDate, "all")}
              >
                <Download className="w-3.5 h-3.5" />
                Download CSV
              </Button>
              {data && (
                <span className="text-xs text-muted-foreground">{filtered.length} event{filtered.length !== 1 ? "s" : ""} on this day</span>
              )}
            </>
          )}
          <button
            type="button"
            data-testid="button-toggle-activity-log"
            className="text-sm text-primary hover:underline flex items-center gap-1"
            onClick={() => setShowLog(v => !v)}
          >
            <Activity className="w-4 h-4" />
            {showLog ? "Hide" : "Show"} Log
          </button>
        </div>
      </div>

      {showLog && (
        <div className="rounded-lg border overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !data?.length ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No activity recorded yet.</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No activity on this date.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Performed By</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Offer Ref</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</TableCell>
                    <TableCell><ActorBadge log={log} /></TableCell>
                    <TableCell className="text-xs">{log.performedBy}</TableCell>
                    <TableCell className="text-xs">{ACTION_LABELS[log.action] ?? log.action}</TableCell>
                    <TableCell className="text-xs font-mono">{log.offerReference || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

export default function Users() {
  const { isMaster, user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [expandedHistory, setExpandedHistory] = useState<number | null>(null);
  const [expandedActivity, setExpandedActivity] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const { data: users, isLoading } = useQuery<SalesmanUser[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetch("/api/users", { credentials: "include" }).then(async r => {
      if (!r.ok) throw new Error("Failed to load users");
      return r.json();
    }),
    enabled: !!isMaster,
    staleTime: 0,
  });


  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User deleted" });
    },
  });

  if (!isMaster) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Access denied. Master account required.</p>
        </div>
      </Layout>
    );
  }


  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Users"
          subtitle="Manage user accounts and permissions"
          actions={
            <div className="flex items-center gap-2">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-40" data-testid="select-role-filter">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {Object.entries(USER_ROLE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button data-testid="button-add-user" onClick={() => setLocation("/users/new")}>
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </div>
          }
        />

        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Logins</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!users || users.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-6 text-sm text-muted-foreground">
                      No salesman users yet. Click "Add User" to create the first one.
                    </TableCell>
                  </TableRow>
                )}
                {users && users.filter(u => roleFilter === "all" || (u.role || (u.isMasterSalesman ? "master" : "salesman")) === roleFilter).map(user => (
                  <>
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell className="font-medium">
                        {user.name}{(user as any).surname ? ` ${(user as any).surname}` : ""}
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={user.role || (user.isMasterSalesman ? "master" : "salesman")} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.isActive ? "default" : "secondary"}>
                          {user.isActive ? "Active" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          data-testid={`button-history-${user.id}`}
                          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => { setExpandedHistory(expandedHistory === user.id ? null : user.id); setExpandedActivity(null); }}
                        >
                          <Clock className="w-3.5 h-3.5" />
                          {user.loginCount}
                          {expandedHistory === user.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          data-testid={`button-activity-${user.id}`}
                          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => { setExpandedActivity(expandedActivity === user.id ? null : user.id); setExpandedHistory(null); }}
                        >
                          <Activity className="w-3.5 h-3.5" />
                          {user.activityCount}
                          {expandedActivity === user.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            data-testid={`button-edit-user-${user.id}`}
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setLocation(`/users/${user.id}/edit`)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <InlineConfirmButton
                            title={`Delete "${user.name}"?`}
                            confirmLabel="Delete"
                            onConfirm={() => deleteMutation.mutate(user.id)}
                            isPending={deleteMutation.isPending}
                            buttonContent={<Trash2 className="w-3.5 h-3.5" />}
                            buttonVariant="ghost"
                            buttonSize="icon"
                            buttonClassName="h-7 w-7 text-destructive hover:text-destructive"
                            data-testid={`button-delete-user-${user.id}`}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedHistory === user.id && (
                      <TableRow key={`history-${user.id}`}>
                        <TableCell colSpan={9} className="bg-muted/30 px-6 pb-4">
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Login History</p>
                          <LoginHistory userId={user.id} />
                        </TableCell>
                      </TableRow>
                    )}
                    {expandedActivity === user.id && (
                      <TableRow key={`activity-${user.id}`}>
                        <TableCell colSpan={9} className="bg-muted/30 px-6 pb-4">
                          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Activity Log</p>
                          <ActivityHistory userId={user.id} userName={`${user.name}${(user as any).surname ? " " + (user as any).surname : ""}`} />
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <MasterActivityLog />

    </Layout>
  );
}
