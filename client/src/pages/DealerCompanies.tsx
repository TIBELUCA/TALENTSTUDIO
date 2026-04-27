import { useState, useMemo } from "react";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit2, Trash2, Loader2, Building2, Search, Eye, ArrowLeft, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";


interface DealerCustomer {
  id: number;
  name: string;
  email: string;
  contactPerson: string | null;
  address: string | null;
  country?: string | null;
  city?: string | null;
  accountStatus?: string | null;
}

export default function DealerCompanies() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");

  const { data: customers = [], isLoading } = useQuery<DealerCustomer[]>({
    queryKey: ["/api/dealer/customers"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dealer/customers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/dealer/customers"] });
      qc.invalidateQueries({ queryKey: ["/api/dealer/contacts"] });
      toast({ title: "Deletion request sent", description: "Your salesman will review this request." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.contactPerson || "").toLowerCase().includes(q) ||
      (c.address || "").toLowerCase().includes(q)
    );
  }, [customers, search]);

  return (
    <DealerLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <PageHeader
              title="Companies"
              subtitle="Manage your customer companies."
              actions={
                <Button data-testid="button-add-company" onClick={() => navigate("/dealer/customers/companies/new")}>
                  <Plus className="w-4 h-4 mr-2" /> Add Company
                </Button>
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-2 bg-card p-3 rounded-xl border border-border shadow-sm">
          <Search className="w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            className="border-none shadow-none focus-visible:ring-0 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-companies"
          />
        </div>

        <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Building2 className="w-10 h-10 opacity-30" />
              <p className="text-sm">{search ? "No companies match your search." : "No companies yet. Add your first one."}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} data-testid={`row-company-${c.id}`} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium" onClick={() => navigate(`/dealer/customers/companies/${c.id}`)}>
                      <span className="flex items-center gap-2">
                        {c.name}
                        {c.accountStatus === "Pending Validation" && (
                          <Badge variant="outline" className="border-amber-400 text-amber-700 text-[10px] px-1.5 py-0" data-testid={`badge-pending-${c.id}`}>
                            <Clock className="w-3 h-3 mr-0.5" /> Pending
                          </Badge>
                        )}
                        {c.accountStatus === "Pending Deletion" && (
                          <Badge variant="outline" className="border-red-400 text-red-700 text-[10px] px-1.5 py-0" data-testid={`badge-deletion-${c.id}`}>
                            <Clock className="w-3 h-3 mr-0.5" /> Deletion Requested
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground" onClick={() => navigate(`/dealer/customers/companies/${c.id}`)}>{c.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground" onClick={() => navigate(`/dealer/customers/companies/${c.id}`)}>{c.contactPerson || "—"}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate" onClick={() => navigate(`/dealer/customers/companies/${c.id}`)}>{c.address || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" data-testid={`button-view-company-${c.id}`} onClick={() => navigate(`/dealer/customers/companies/${c.id}`)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" data-testid={`button-edit-company-${c.id}`} onClick={() => navigate(`/dealer/customers/companies/${c.id}/edit`)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" data-testid={`button-delete-company-${c.id}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => { if (confirm("Request deletion of this company? Your salesman will need to approve.")) deleteMutation.mutate(c.id); }}
                          disabled={deleteMutation.isPending || c.accountStatus === "Pending Deletion"}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </DealerLayout>
  );
}
