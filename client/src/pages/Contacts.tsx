import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState, useRef, useCallback, useMemo } from "react";
import {
  Plus, Trash2, Loader2, Edit2, ArrowLeft, Search, Upload, Download,
  CheckCircle2, FileSpreadsheet, AlertCircle, CheckSquare, Filter, ArrowUpDown, X, Eye,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useSelection } from "@/hooks/use-selection";
import { SelectionBar } from "@/components/SelectionBar";
import { Link, useLocation } from "wouter";

import type { Customer, Contact } from "@shared/schema";

const SOURCE_OPTIONS = ["Website", "Referral", "Exhibition", "Cold Call", "Social Media", "Email Campaign", "Other"];

type SortOption = "name-asc" | "name-desc" | "company-asc" | "company-desc";

export default function Contacts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [filterCompanyId, setFilterCompanyId] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const selection = useSelection();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    companiesCreated: number;
    skipped: number;
    reasons?: { noName?: number; noAccount?: number; headerSkipped?: number; error?: number };
    unmatchedAssignees?: string[];
    companiesCreatedNames?: string[];
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { data: contactsList = [], isLoading } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: companies = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete contact");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/contacts"] }); toast({ title: "Contact deleted" }); },
  });

  const handleBulkDelete = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkDeleting(true);
    let count = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/contacts/${id}`, { method: "DELETE", credentials: "include" });
        if (res.ok) count++;
      } catch {}
    }
    setBulkDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    toast({ title: `${count} contact${count !== 1 ? "s" : ""} deleted` });
    selection.exitSelectionMode();
  };

  const handleImportFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|ods|csv)$/i)) {
      toast({ title: "Invalid file", description: "Please select an Excel file (.xlsx)", variant: "destructive" });
      return;
    }
    setImportResult(null); setIsImporting(true);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/contacts/import", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({ message: "Import failed" })); throw new Error(err.message); }
      const data = await res.json();
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      const parts = [
        `${data.created ?? 0} new`,
        `${data.updated ?? 0} updated`,
      ];
      if ((data.companiesCreated ?? 0) > 0) parts.push(`${data.companiesCreated} companies created`);
      if ((data.skipped ?? 0) > 0) parts.push(`${data.skipped} skipped`);
      toast({ title: "Import complete", description: parts.join(" · ") });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally { setIsImporting(false); }
  };

  const handleExport = () => { window.open("/api/contacts/export", "_blank"); };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files[0]; if (file) handleImportFile(file);
  }, []);

  const getCompanyName = (id: number) => companies.find(c => c.id === id)?.name || "—";

  const hasActiveFilters = filterCompanyId !== "all" || filterSource !== "all";
  const clearAllFilters = () => { setFilterCompanyId("all"); setFilterSource("all"); };

  const filteredAndSorted = useMemo(() => {
    let result = contactsList.filter(c => {
      const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
      const q = search.toLowerCase();
      if (q && !fullName.includes(q) && !(c.email || "").toLowerCase().includes(q) && !getCompanyName(c.customerId).toLowerCase().includes(q)) return false;
      if (filterCompanyId !== "all" && String(c.customerId) !== filterCompanyId) return false;
      if (filterSource !== "all" && c.sourceOfContact !== filterSource) return false;
      return true;
    });
    result.sort((a, b) => {
      switch (sortBy) {
        case "name-asc": return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        case "name-desc": return `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`);
        case "company-asc": return getCompanyName(a.customerId).localeCompare(getCompanyName(b.customerId));
        case "company-desc": return getCompanyName(b.customerId).localeCompare(getCompanyName(a.customerId));
        default: return 0;
      }
    });
    return result;
  }, [contactsList, companies, search, sortBy, filterCompanyId, filterSource]);

  const visibleIds = useMemo(() => filteredAndSorted.map(c => c.id), [filteredAndSorted]);

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Contacts"
          subtitle="Manage your contact records."
          actions={
            <div className="flex gap-2">
              {!selection.active && (
                <>
                  <Button variant="outline" onClick={selection.enterSelectionMode} data-testid="button-enter-selection">
                    <CheckSquare className="w-4 h-4 mr-1" /> Select
                  </Button>
                  <Button variant="outline" onClick={() => { setImportResult(null); setShowImport(v => !v); }} data-testid="button-toggle-import-contacts">
                    <Upload className="w-4 h-4 mr-1" /> Import
                  </Button>
                  <Button variant="outline" onClick={handleExport} data-testid="button-export-contacts">
                    <Download className="w-4 h-4 mr-1" /> Export
                  </Button>
                  <Link href="/crm/contacts/new">
                    <Button data-testid="button-add-contact">
                      <Plus className="w-4 h-4 mr-1" /> Add Contact
                    </Button>
                  </Link>
                </>
              )}
            </div>
          }
        />

        {selection.active && (
          <SelectionBar
            count={selection.count}
            onCancel={selection.exitSelectionMode}
            actions={
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                data-testid="button-bulk-delete"
              >
                {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Delete
              </Button>
            }
          />
        )}

        {showImport && !selection.active && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-sm">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" /> Import Contacts from Excel
            </h3>
            <div
              data-testid="contact-import-dropzone"
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={onDrop}
              onClick={() => { setImportResult(null); importInputRef.current?.click(); }}
            >
              {isImporting ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm">Importing contacts...</p>
                </div>
              ) : importResult ? (
                <div className="flex flex-col items-center gap-2 text-green-600" data-testid="import-result-summary">
                  <CheckCircle2 className="h-8 w-8" />
                  <p className="font-semibold">Import complete!</p>
                  <p className="text-sm">
                    <span data-testid="import-created">{importResult.created} new</span>
                    {" · "}
                    <span data-testid="import-updated">{importResult.updated} updated</span>
                    {(importResult.companiesCreated ?? 0) > 0 && <> · <span data-testid="import-companies-created">{importResult.companiesCreated} companies created</span></>}
                    {(importResult.skipped ?? 0) > 0 && <> · <span data-testid="import-skipped">{importResult.skipped} skipped</span></>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Click to import another file</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8" />
                  <p className="font-medium">Drop your Excel file here</p>
                  <p className="text-sm">or click to browse</p>
                  <p className="text-xs">.xlsx files supported</p>
                </div>
              )}
            </div>
            <input ref={importInputRef} type="file" accept=".xlsx" className="hidden" data-testid="input-import-contacts-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }} />

            {importResult?.companiesCreatedNames && importResult.companiesCreatedNames.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm" data-testid="import-new-companies">
                <p className="font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  {importResult.companiesCreatedNames.length} new compan{importResult.companiesCreatedNames.length === 1 ? "y" : "ies"} auto-created:
                </p>
                <ul className="mt-1.5 ml-5 list-disc text-blue-600 dark:text-blue-500 text-xs space-y-0.5 max-h-32 overflow-y-auto">
                  {importResult.companiesCreatedNames.slice(0, 50).map(name => <li key={name}>{name}</li>)}
                  {importResult.companiesCreatedNames.length > 50 && <li>… and {importResult.companiesCreatedNames.length - 50} more</li>}
                </ul>
              </div>
            )}

            {importResult?.unmatchedAssignees && importResult.unmatchedAssignees.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm" data-testid="import-unmatched-assignees">
                <p className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  {importResult.unmatchedAssignees.length} assignee name(s) not matched to a salesman (left unassigned):
                </p>
                <ul className="mt-1.5 ml-5 list-disc text-amber-600 dark:text-amber-500 text-xs space-y-0.5">
                  {importResult.unmatchedAssignees.map(name => <li key={name}>{name}</li>)}
                </ul>
              </div>
            )}

            {importResult?.reasons && importResult.skipped > 0 && (
              <div className="bg-muted rounded p-3 text-xs space-y-0.5 text-muted-foreground" data-testid="import-skip-reasons">
                <div className="font-semibold text-foreground mb-1">Skipped rows breakdown:</div>
                {(importResult.reasons.noName ?? 0) > 0 && <div>• {importResult.reasons.noName} without name (Surname/Name empty)</div>}
                {(importResult.reasons.noAccount ?? 0) > 0 && <div>• {importResult.reasons.noAccount} without Account (company)</div>}
                {(importResult.reasons.headerSkipped ?? 0) > 0 && <div>• {importResult.reasons.headerSkipped} header rows skipped</div>}
                {(importResult.reasons.error ?? 0) > 0 && <div>• {importResult.reasons.error} with errors during save</div>}
              </div>
            )}

            <div className="text-xs bg-muted rounded p-3 font-mono space-y-0.5 text-muted-foreground">
              <div className="font-semibold text-foreground mb-1">Supported format: zencrm export (header row required)</div>
              <div>The first row must contain column headers. Columns are matched <span className="font-bold">by name</span>, not by position. Order can vary.</div>
              <div className="mt-2 font-semibold text-foreground">Recognized headers:</div>
              <div className="text-[11px] leading-relaxed">
                Id (sync key), Surname, Name, Account, Contact Role, Contact status, Email, Mobile, Fax, Office phone, Date of birth, Language, Newsletter block, Description, Commercial, Expiring date for sales purpose processing, Newsletter, Unsubscribe Date, Profiling, Expiring date for profiling purpose processing, Company's privacy policy acknowledged, Anonymized, Address, City, Postal code, Country, Region, District, Company, Assigned to, Source of the Contact, Anno Fiera, Fiera, Area of interest, Area of interest - Description, Created by, Creation date <span className="italic">(ignored)</span>, Modified by, Modification date <span className="italic">(ignored)</span>, Last call, Next recall, Tipo, N. Marketing, Conversion Date, isexternalrecord
              </div>
              <div className="mt-2 text-foreground">
                <span className="font-semibold">Behavior:</span> contacts are matched by their <code className="text-[11px]">Id</code> (zencrm) — existing ones are updated, new ones created. Companies in <code className="text-[11px]">Account</code> not yet in QuotePilot are auto-created. Re-importing the same file is safe (no duplicates).
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or company..."
                className="border-none shadow-none focus-visible:ring-0 bg-transparent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-contacts"
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[160px]" data-testid="select-sort-contacts">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                    <SelectItem value="company-asc">Company (A-Z)</SelectItem>
                    <SelectItem value="company-desc">Company (Z-A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant={showFilters || hasActiveFilters ? "default" : "outline"}
                size="sm"
                onClick={() => setShowFilters(v => !v)}
                data-testid="button-toggle-filters"
                className="gap-1.5"
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px] font-bold">
                    {[filterCompanyId !== "all", filterSource !== "all"].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Company</label>
                <Select value={filterCompanyId} onValueChange={setFilterCompanyId}>
                  <SelectTrigger className="w-[200px]" data-testid="select-filter-company"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Companies</SelectItem>
                    {companies.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Source</label>
                <Select value={filterSource} onValueChange={setFilterSource}>
                  <SelectTrigger className="w-[170px]" data-testid="select-filter-source"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {SOURCE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground" data-testid="button-clear-filters">
                  <X className="w-3.5 h-3.5 mr-1" /> Clear
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                {selection.active && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selection.isAllSelected(visibleIds)}
                      onCheckedChange={() => selection.toggleAll(visibleIds)}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                )}
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Source</TableHead>
                {!selection.active && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={selection.active ? 7 : 7} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredAndSorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={selection.active ? 7 : 7} className="h-24 text-center text-muted-foreground">
                    No contacts found
                  </TableCell>
                </TableRow>
              ) : filteredAndSorted.map(c => (
                <TableRow
                  key={c.id}
                  data-testid={`row-contact-${c.id}`}
                  className={`cursor-pointer hover:bg-muted/50 ${selection.isSelected(c.id) ? "bg-primary/5" : ""}`}
                  onClick={() => { if (!selection.active) navigate(`/crm/contacts/${c.id}`); }}
                >
                  {selection.active && (
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={selection.isSelected(c.id)}
                        onCheckedChange={() => selection.toggle(c.id)}
                        data-testid={`checkbox-contact-${c.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{c.firstName} {c.lastName}</TableCell>
                  <TableCell>{getCompanyName(c.customerId)}</TableCell>
                  <TableCell>{c.contactRole?.length ? c.contactRole.join(", ") : "—"}</TableCell>
                  <TableCell>{c.email || "—"}</TableCell>
                  <TableCell>{c.phone || "—"}</TableCell>
                  <TableCell>{c.sourceOfContact || "—"}</TableCell>
                  {!selection.active && (
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Link href={`/crm/contacts/${c.id}`}>
                          <Button variant="ghost" size="icon" data-testid={`button-view-contact-${c.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/crm/contacts/${c.id}/edit`)} data-testid={`button-edit-contact-${c.id}`}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive"
                          onClick={() => { if (confirm("Delete this contact?")) deleteMutation.mutate(c.id); }}
                          data-testid={`button-delete-contact-${c.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
