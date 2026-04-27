import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { useQuery } from "@tanstack/react-query";
import { Building2, UserCircle } from "lucide-react";
import { Link } from "wouter";
import type { Contact } from "@shared/schema";

interface DealerCustomer {
  id: number;
  name: string;
  email: string;
}

export default function DealerCustomers() {
  const { data: companies = [] } = useQuery<DealerCustomer[]>({ queryKey: ["/api/dealer/customers"] });
  const { data: contacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/dealer/contacts"] });

  return (
    <DealerLayout>
      <div className="space-y-8">
        <PageHeader
          title="My Customers"
          subtitle="Manage your companies and contacts."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
          <Link href="/dealer/customers/companies">
            <div
              className="group cursor-pointer rounded-2xl border border-border bg-card p-8 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all flex flex-col items-center gap-4"
              data-testid="tile-companies"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-foreground">Companies</h2>
                <p className="text-sm text-muted-foreground mt-1">{companies.length} {companies.length === 1 ? "company" : "companies"}</p>
              </div>
            </div>
          </Link>

          <Link href="/dealer/customers/contacts">
            <div
              className="group cursor-pointer rounded-2xl border border-border bg-card p-8 shadow-sm hover:shadow-lg hover:border-primary/30 transition-all flex flex-col items-center gap-4"
              data-testid="tile-contacts"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <UserCircle className="w-8 h-8 text-white" />
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-foreground">Contacts</h2>
                <p className="text-sm text-muted-foreground mt-1">{contacts.length} {contacts.length === 1 ? "contact" : "contacts"}</p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </DealerLayout>
  );
}
