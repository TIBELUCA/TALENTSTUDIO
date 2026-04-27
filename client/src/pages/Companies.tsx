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
  Plus, Trash2, Loader2, Edit2, Eye, ArrowLeft, Search, Upload, Download,
  CheckCircle2, FileSpreadsheet, CheckSquare, Filter, ArrowUpDown, X,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useSelection } from "@/hooks/use-selection";
import { SelectionBar } from "@/components/SelectionBar";
import { Link, useLocation } from "wouter";

import type { Customer, SalesmanUser, DealerCompany } from "@shared/schema";

type SortOption = "name-asc" | "name-desc" | "country-asc" | "country-desc";

export default function Companies() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [filterSalesmanId, setFilterSalesmanId] = useState("all");
  const [filterDealerId, setFilterDealerId] = useState("all");
  const [filterMachineFamily, setFilterMachineFamily] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const selection = useSelection();
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { data: companies = [], isLoading } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: salesmen = [] } = useQuery<SalesmanUser[]>({ queryKey: ["/api/users"] });
  const { data: dealers = [] } = useQuery<DealerCompany[]>({ queryKey: ["/api/dealers"] });
  const { data: machineFamilies = [] } = useQuery<string[]>({ queryKey: ["/api/machine-families"] });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete company");
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/customers"] }); toast({ title: "Company deleted" }); },
  });

  const handleBulkDelete = async () => {
    const ids = Array.from(selection.selectedIds);
    setBulkDeleting(true);
    let count = 0;
    for (const id of ids) {
      try {
        const res = await fetch(`/api/customers/${id}`, { method: "DELETE", credentials: "include" });
        if (res.ok) count++;
      } catch {}
    }
    setBulkDeleting(false);
    queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    toast({ title: `${count} compan${count !== 1 ? "ies" : "y"} deleted` });
    selection.exitSelectionMode();
  };

  const handleImportFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|ods|csv)$/i)) {
      toast({ title: "Invalid file", description: "Please select an Excel file (.xlsx or .xls)", variant: "destructive" });
      return;
    }
    setImportResult(null); setIsImporting(true);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch("/api/customers/import", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) { const err = await res.json().catch(() => ({ message: "Import failed" })); throw new Error(err.message); }
      const data = await res.json();
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Import successful", description: `${data.added} companies added, ${data.skipped} skipped.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally { setIsImporting(false); }
  };

  const handleExport = () => { window.open("/api/customers/export", "_blank"); };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const file = e.dataTransfer.files[0]; if (file) handleImportFile(file);
  }, []);

  const hasActiveFilters = filterSalesmanId !== "all" || filterDealerId !== "all" || filterMachineFamily !== "all";
  const clearAllFilters = () => { setFilterSalesmanId("all"); setFilterDealerId("all"); setFilterMachineFamily("all"); };

  const getSalesmanName = (id: number | null | undefined) => { if (!id) return ""; return salesmen.find(s => s.id === id)?.name || ""; };
  const getDealerName = (id: number | null | undefined) => { if (!id) return ""; return dealers.find(d => d.id === id)?.companyName || ""; };

  const filteredAndSorted = useMemo(() => {
    let result = companies.filter(c => {
      const q = search.toLowerCase();
      if (q && !c.name.toLowerCase().includes(q) && !(c.country || "").toLowerCase().includes(q) && !(c.city || "").toLowerCase().includes(q)) return false;
      if (filterSalesmanId !== "all" && String(c.salesmanId) !== filterSalesmanId) return false;
      if (filterDealerId !== "all" && String(c.dealerId) !== filterDealerId) return false;
      if (filterMachineFamily !== "all" && c.machineFamily !== filterMachineFamily) return false;
      return true;
    });
    result.sort((a, b) => {
      switch (sortBy) {
        case "name-asc": return a.name.localeCompare(b.name);
        case "name-desc": return b.name.localeCompare(a.name);
        case "country-asc": return (a.country || "").localeCompare(b.country || "");
        case "country-desc": return (b.country || "").localeCompare(a.country || "");
        default: return 0;
      }
    });
    return result;
  }, [companies, search, sortBy, filterSalesmanId, filterDealerId, filterMachineFamily]);

  const visibleIds = useMemo(() => filteredAndSorted.map(c => c.id), [filteredAndSorted]);

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Companies"
          subtitle="Manage your company records."
          actions={
            <div className="flex gap-2">
              {!selection.active && (
                <>
                  <Button variant="outline" onClick={selection.enterSelectionMode} data-testid="button-enter-selection">
                    <CheckSquare className="w-4 h-4 mr-1" /> Select
                  </Button>
                  <Button variant="outline" onClick={() => { setImportResult(null); setShowImport(v => !v); }} data-testid="button-toggle-import-companies">
                    <Upload className="w-4 h-4 mr-1" /> Import
                  </Button>
                  <Button variant="outline" onClick={handleExport} data-testid="button-export-companies">
                    <Download className="w-4 h-4 mr-1" /> Export
                  </Button>
                  <Link href="/crm/companies/new">
                    <Button data-testid="button-add-company">
                      <Plus className="w-4 h-4 mr-1" /> Add Company
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
              <FileSpreadsheet className="w-4 h-4 text-green-600" /> Import Companies from Excel
            </h3>
            <div
              data-testid="company-import-dropzone"
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
                  <p className="text-sm">Importing companies...</p>
                </div>
              ) : importResult ? (
                <div className="flex flex-col items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-8 w-8" />
                  <p className="font-semibold">Import complete!</p>
                  <p className="text-sm">{importResult.added} added · {importResult.skipped} skipped</p>
                  <p className="text-xs text-muted-foreground mt-1">Click to import another file</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8" />
                  <p className="font-medium">Drop your Excel file here</p>
                  <p className="text-sm">or click to browse</p>
                  <p className="text-xs">.xlsx, .xls files supported</p>
                </div>
              )}
            </div>
            <input ref={importInputRef} type="file" accept=".xlsx,.xls,.ods,.csv" className="hidden" data-testid="input-import-companies-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }} />
            <div className="text-xs bg-muted rounded p-3 font-mono space-y-0.5 text-muted-foreground">
              <div className="font-semibold text-foreground mb-1">Expected columns (no header row needed):</div>
              <div><span className="font-bold text-foreground">A</span>: Company Name <span className="text-destructive">*required</span></div>
              <div><span className="font-bold text-foreground">B</span>: Email · <span className="font-bold text-foreground">C</span>: Contact Person · <span className="font-bold text-foreground">D</span>: Address</div>
              <div><span className="font-bold text-foreground">E</span>: Country · <span className="font-bold text-foreground">F</span>: City · <span className="font-bold text-foreground">G</span>: Machine Family · <span className="font-bold text-foreground">H</span>: Notes</div>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 bg-card p-4 rounded-xl border border-border shadow-sm">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search by name, country, or city..."
                className="border-none shadow-none focus-visible:ring-0 bg-transparent"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search-companies"
              />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[150px]" data-testid="select-sort-companies">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                    <SelectItem value="country-asc">Country (A-Z)</SelectItem>
                    <SelectItem value="country-desc">Country (Z-A)</SelectItem>
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
                    {[filterSalesmanId !== "all", filterDealerId !== "all", filterMachineFamily !== "all"].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Salesman</label>
                <Select value={filterSalesmanId} onValueChange={setFilterSalesmanId}>
                  <SelectTrigger className="w-[170px]" data-testid="select-filter-salesman"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Salesmen</SelectItem>
                    {salesmen.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dealer</label>
                <Select value={filterDealerId} onValueChange={setFilterDealerId}>
                  <SelectTrigger className="w-[170px]" data-testid="select-filter-dealer"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dealers</SelectItem>
                    {dealers.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.companyName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Machine Family</label>
                <Select value={filterMachineFamily} onValueChange={setFilterMachineFamily}>
                  <SelectTrigger className="w-[170px]" data-testid="select-filter-machine-family"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Families</SelectItem>
                    {machineFamilies.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
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
                <TableHead>Company Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Salesman</TableHead>
                <TableHead>Dealer</TableHead>
                <TableHead>Machine Family</TableHead>
                {!selection.active && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={selection.active ? 6 : 6} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : filteredAndSorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={selection.active ? 6 : 6} className="h-24 text-center text-muted-foreground">
                    No companies found
                  </TableCell>
                </TableRow>
              ) : filteredAndSorted.map(c => (
                <TableRow
                  key={c.id}
                  data-testid={`row-company-${c.id}`}
                  className={selection.isSelected(c.id) ? "bg-primary/5" : ""}
                >
                  {selection.active && (
                    <TableCell>
                      <Checkbox
                        checked={selection.isSelected(c.id)}
                        onCheckedChange={() => selection.toggle(c.id)}
                        data-testid={`checkbox-company-${c.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.country || "—"}</TableCell>
                  <TableCell>{getSalesmanName(c.salesmanId) || "—"}</TableCell>
                  <TableCell>{getDealerName(c.dealerId) || "—"}</TableCell>
                  <TableCell>{c.machineFamily || "—"}</TableCell>
                  {!selection.active && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/crm/companies/${c.id}`)} data-testid={`button-view-company-${c.id}`}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => navigate(`/crm/companies/${c.id}/edit`)} data-testid={`button-edit-company-${c.id}`}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive"
                          onClick={() => { if (confirm("Delete this company?")) deleteMutation.mutate(c.id); }}
                          data-testid={`button-delete-company-${c.id}`}>
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
