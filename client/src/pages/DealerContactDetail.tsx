import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft, Loader2, Edit2, UserCircle,
  AtSign, Phone, Clock, MessageSquare, Store,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";

import { format } from "date-fns";
import type { SalesmanUser } from "@shared/schema";

interface DealerContact {
  id: number;
  name: string;
  surname: string;
  email: string;
  mobileNumber?: string;
  role?: string;
  isActive: boolean;
  dealerCompanyId: number;
  linkedSalesmanId?: number | null;
  createdAt: string;
}

interface DealerCompanyData {
  id: number;
  companyName: string;
  isActive: boolean;
}

function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="font-medium mt-0.5 text-sm">{value}</p>
    </div>
  );
}

export default function DealerContactDetail() {
  const { id, contactId } = useParams<{ id: string; contactId: string }>();
  const dealerCompanyId = Number(id);
  const dealerContactId = Number(contactId);


  const { data: allCompanies = [] } = useQuery<DealerCompanyData[]>({
    queryKey: ["/api/dealers"],
  });
  const company = allCompanies.find(c => c.id === dealerCompanyId);

  const { data: contacts = [], isLoading } = useQuery<DealerContact[]>({
    queryKey: ["/api/dealers", dealerCompanyId, "contacts"],
    queryFn: async () => {
      const res = await fetch(`/api/dealers/${dealerCompanyId}/contacts`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load contacts");
      return res.json();
    },
    enabled: !!dealerCompanyId,
  });

  const contact = contacts.find(c => c.id === dealerContactId);

  const { data: salesmen = [] } = useQuery<SalesmanUser[]>({ queryKey: ["/api/users"] });

  if (isLoading) {
    return <Layout><div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin" /></div></Layout>;
  }
  if (!contact) {
    return <Layout><div className="text-center py-24 text-muted-foreground">Dealer contact not found</div></Layout>;
  }

  const linkedSalesman = salesmen.find(s => s.id === contact.linkedSalesmanId);

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title={`${contact.name} ${contact.surname}`.trim()}
          subtitle={company ? `Dealer Contact — ${company.companyName}` : "Dealer Contact Profile"}
          icon={<UserCircle className="w-6 h-6 text-amber-600" />}
          actions={
            <div className="flex gap-2">
              <Link href={`/dealers/${dealerCompanyId}/edit`}>
                <Button size="sm" variant="outline" data-testid="button-edit-dealer-contact">
                  <Edit2 className="w-4 h-4 mr-1" /> Edit
                </Button>
              </Link>
            </div>
          }
        />

        <div className="flex flex-wrap gap-3">
          <Badge variant={contact.isActive ? "default" : "secondary"} className={contact.isActive ? "bg-green-100 text-green-700 border-green-200" : ""} data-testid="badge-contact-status">
            {contact.isActive ? "Active" : "Inactive"}
          </Badge>
          {contact.role && (
            <Badge variant="outline" data-testid="badge-contact-role">{contact.role}</Badge>
          )}
          {company && (
            <Link href={`/dealers/${dealerCompanyId}`}>
              <Badge variant="outline" className="cursor-pointer hover:bg-accent" data-testid="badge-dealer-company">
                <Store className="w-3 h-3 mr-1" /> {company.companyName}
              </Badge>
            </Link>
          )}
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 max-w-md">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="interactions" data-testid="tab-interactions">Interactions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <UserCircle className="w-4 h-4 text-muted-foreground" /> Identity
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="First Name" value={contact.name} />
                  <InfoField label="Surname" value={contact.surname} />
                  <InfoField label="Role / Title" value={contact.role} />
                  <InfoField label="Status" value={contact.isActive ? "Active" : "Inactive"} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <AtSign className="w-4 h-4 text-muted-foreground" /> Contact Details
                </h3>
                <div className="grid grid-cols-1 gap-y-3">
                  <InfoField label="Email" value={contact.email} />
                  <InfoField label="Mobile Number" value={contact.mobileNumber} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Store className="w-4 h-4 text-muted-foreground" /> Assignment
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Dealer Company" value={company?.companyName} />
                  <InfoField label="Linked Salesman" value={linkedSalesman ? `${linkedSalesman.name} ${linkedSalesman.surname}` : "None"} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" /> Audit Trail
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <InfoField label="Created" value={contact.createdAt ? format(new Date(contact.createdAt), "dd MMM yyyy HH:mm") : undefined} />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="interactions">
            <div className="text-center py-16 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Interaction Timeline</p>
              <p className="text-sm mt-1">Email, call, and meeting tracking coming soon</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
