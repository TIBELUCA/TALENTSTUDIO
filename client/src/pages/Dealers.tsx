import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InlineConfirmButton } from "@/components/InlineConfirm";
import {
  Loader2, Plus, Pencil, Trash2, Store, ChevronDown, ChevronRight,
  Users, UserPlus, Building2, MapPin, Hash,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DealerCompany {
  id: number;
  companyName: string;
  address: string;
  vatNumber: string;
  state: string;
  city?: string;
  postalCode?: string;
  email?: string;
  phone?: string;
  notes?: string;
  linkedSalesmanId: number | null;
  isActive: boolean;
  contactCount: number;
  salesmanName?: string;
  createdAt: string;
}

interface DealerContact {
  id: number;
  name: string;
  surname: string;
  email: string;
  mobileNumber?: string;
  role?: string;
  isActive: boolean;
  dealerCompanyId: number;
  createdAt: string;
}

interface ContactsPanelProps {
  company: DealerCompany;
}

function ContactsPanel({ company }: ContactsPanelProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: contacts = [], isLoading } = useQuery<DealerContact[]>({
    queryKey: ["/api/dealers", company.id, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/dealers/${company.id}/contacts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load contacts");
      return res.json();
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: ({ companyId, contactId }: { companyId: number; contactId: number }) =>
      apiRequest("DELETE", `/api/dealers/${companyId}/contacts/${contactId}`),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealers", vars.companyId, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      setDeleteContactTarget(null);
      toast({ title: "Contact removed" });
    },
  });

  return (
    <div className="bg-muted/30 border-b px-10 py-3">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sales Contacts</p>
        <Button size="sm" variant="outline" onClick={() => setLocation(`/dealers/${company.id}/edit`)} data-testid={`button-add-contact-${company.id}`}>
          <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Manage Contacts
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-2">No contacts yet. Add the first sales person for this company.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Phone</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Role</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact, ci) => (
                <tr key={contact.id} data-testid={`row-dealer-contact-${contact.id}`} className={`${ci % 2 === 0 ? "bg-background" : "bg-muted/20"} cursor-pointer hover:bg-accent/50`} onClick={() => setLocation(`/dealers/${company.id}/contacts/${contact.id}`)}>
                  <td className="px-3 py-2 font-medium">{contact.name} {contact.surname}</td>
                  <td className="px-3 py-2 text-muted-foreground">{contact.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">{contact.mobileNumber || <span className="italic text-xs">—</span>}</td>
                  <td className="px-3 py-2 text-muted-foreground">{contact.role || <span className="italic text-xs">—</span>}</td>
                  <td className="px-3 py-2">
                    <Badge variant={contact.isActive ? "default" : "secondary"} className={cn("text-xs", contact.isActive ? "bg-green-100 text-green-700 border-green-200" : "")}>
                      {contact.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setLocation(`/dealers/${company.id}/edit`)} data-testid={`button-edit-contact-${contact.id}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <InlineConfirmButton
                        title="Remove contact?"
                        confirmLabel="Remove"
                        onConfirm={() => deleteContactMutation.mutate({ companyId: company.id, contactId: contact.id })}
                        isPending={deleteContactMutation.isPending}
                        buttonContent={<Trash2 className="w-3 h-3 text-destructive" />}
                        buttonVariant="ghost"
                        buttonSize="icon"
                        buttonClassName="h-7 w-7"
                        data-testid={`button-delete-contact-${contact.id}`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

export default function Dealers() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const { data: companies = [], isLoading } = useQuery<DealerCompany[]>({ queryKey: ["/api/dealers"] });

  const deleteCompanyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dealers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealers"] });
      toast({ title: "Dealer company deleted" });
    },
  });

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Dealers"
          subtitle="Manage dealer companies and their sales contacts"
          icon={<Store className="w-6 h-6 text-amber-600" />}
          actions={
            <Button onClick={() => setLocation("/dealers/new")} data-testid="button-add-dealer">
              <Plus className="w-4 h-4 mr-2" /> Add Dealer Company
            </Button>
          }
        />

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : companies.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No dealer companies yet</p>
            <p className="text-sm mt-1">Add the first dealer company to get started</p>
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden bg-card">
            {companies.map((company, i) => {
              const isExpanded = expandedIds.has(company.id);
              return (
                <div key={company.id} data-testid={`row-dealer-company-${company.id}`}>
                  <div className={cn("flex items-center gap-3 px-4 py-3 border-b", i === companies.length - 1 && !isExpanded ? "border-b-0" : "")}>
                    <button
                      type="button"
                      onClick={() => toggleExpand(company.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      data-testid={`button-expand-dealer-${company.id}`}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-6 gap-y-1 items-center">
                      <div className="min-w-0 cursor-pointer" onClick={() => setLocation(`/dealers/${company.id}`)}>
                        <p className="font-semibold truncate hover:underline">{company.companyName}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                          {(company.address || company.city || company.state) && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {[company.address, company.city, company.state].filter(Boolean).join(", ")}
                            </span>
                          )}
                          {company.vatNumber && (
                            <span className="flex items-center gap-1"><Hash className="w-3 h-3" />VAT: {company.vatNumber}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 text-sm text-muted-foreground whitespace-nowrap">
                        <Users className="w-3.5 h-3.5" />
                        <span>{company.contactCount} {company.contactCount === 1 ? "contact" : "contacts"}</span>
                      </div>

                      <div className="text-sm whitespace-nowrap">
                        {company.salesmanName
                          ? <span className="text-foreground">{company.salesmanName}</span>
                          : <span className="text-muted-foreground italic text-xs">Unassigned</span>}
                      </div>

                      <Badge variant={company.isActive ? "default" : "secondary"} className={company.isActive ? "bg-green-100 text-green-700 border-green-200" : ""}>
                        {company.isActive ? "Active" : "Disabled"}
                      </Badge>

                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setLocation(`/dealers/${company.id}/edit`)} data-testid={`button-edit-dealer-${company.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <InlineConfirmButton
                          title="Delete company?"
                          confirmLabel="Delete"
                          onConfirm={() => deleteCompanyMutation.mutate(company.id)}
                          isPending={deleteCompanyMutation.isPending}
                          buttonContent={<Trash2 className="w-3.5 h-3.5 text-destructive" />}
                          buttonVariant="ghost"
                          buttonSize="icon"
                          data-testid={`button-delete-dealer-${company.id}`}
                        />
                      </div>
                    </div>
                  </div>

                  {isExpanded && <ContactsPanel company={company} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </Layout>
  );
}
