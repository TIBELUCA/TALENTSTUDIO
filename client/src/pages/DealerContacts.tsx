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
import { Plus, Edit2, Trash2, Loader2, Users, Search, Eye, ArrowLeft, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";

import type { Contact } from "@shared/schema";

interface DealerCustomer {
  id: number;
  name: string;
  email: string;
}

export default function DealerContacts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");

  const { data: customers = [] } = useQuery<DealerCustomer[]>({ queryKey: ["/api/dealer/customers"] });
  const { data: contacts = [], isLoading } = useQuery<Contact[]>({ queryKey: ["/api/dealer/contacts"] });

  const getCompanyName = (customerId: number) =>
    customers.find(c => c.id === customerId)?.name || "—";

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dealer/contacts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/dealer/contacts"] });
      toast({ title: "Deletion request sent", description: "Your salesman will review this request." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(c =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      getCompanyName(c.customerId).toLowerCase().includes(q)
    );
  }, [contacts, search, customers]);

  return (
    <DealerLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <PageHeader
              title="Contacts"
              subtitle="Manage your customer contacts."
              actions={
                <Button data-testid="button-add-contact" onClick={() => navigate("/dealer/customers/contacts/new")}>
                  <Plus className="w-4 h-4 mr-2" /> Add Contact
                </Button>
              }
            />
          </div>
        </div>

        <div className="flex items-center gap-2 bg-card p-3 rounded-xl border border-border shadow-sm">
          <Search className="w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="border-none shadow-none focus-visible:ring-0 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-contacts"
          />
        </div>

        <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Users className="w-10 h-10 opacity-30" />
              <p className="text-sm">{search ? "No contacts match your search." : "No contacts yet. Add your first one."}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id} data-testid={`row-contact-${c.id}`} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium" onClick={() => navigate(`/dealer/customers/contacts/${c.id}`)}>
                      <span className="flex items-center gap-2">
                        {c.firstName} {c.lastName}
                        {c.contactStatus === "Pending Validation" && (
                          <Badge variant="outline" className="border-amber-400 text-amber-700 text-[10px] px-1.5 py-0" data-testid={`badge-pending-${c.id}`}>
                            <Clock className="w-3 h-3 mr-0.5" /> Pending
                          </Badge>
                        )}
                        {c.contactStatus === "Pending Deletion" && (
                          <Badge variant="outline" className="border-red-400 text-red-700 text-[10px] px-1.5 py-0" data-testid={`badge-deletion-${c.id}`}>
                            <Clock className="w-3 h-3 mr-0.5" /> Deletion Requested
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground" onClick={() => navigate(`/dealer/customers/contacts/${c.id}`)}>{getCompanyName(c.customerId)}</TableCell>
                    <TableCell className="text-muted-foreground" onClick={() => navigate(`/dealer/customers/contacts/${c.id}`)}>{c.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground" onClick={() => navigate(`/dealer/customers/contacts/${c.id}`)}>{c.phone || c.mobile || c.officePhone || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" data-testid={`button-view-contact-${c.id}`} onClick={() => navigate(`/dealer/customers/contacts/${c.id}`)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" data-testid={`button-edit-contact-${c.id}`} onClick={() => navigate(`/dealer/customers/contacts/${c.id}/edit`)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" data-testid={`button-delete-contact-${c.id}`}
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => { if (confirm("Request deletion of this contact? Your salesman will need to approve.")) deleteMutation.mutate(c.id); }}
                          disabled={deleteMutation.isPending || c.contactStatus === "Pending Deletion"}>
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
