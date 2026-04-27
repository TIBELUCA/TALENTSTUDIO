import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Link2, Building2, User, FileText, Package, Mail } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Contact, Offer, JobOrder, LinkEntityType } from "@shared/schema";

export interface LinkAttachmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string;
  /** Required when mode is "attachment". Ignored when mode is "message". */
  attachmentId?: string;
  /** When mode is "message" this should be the email subject (or fallback label). */
  filename: string;
  /** "attachment" links a single Gmail attachment, "message" links the whole email as .eml. */
  mode?: "attachment" | "message";
  /** Optional: pre-select an entity tab + row (used by suggestion shortcuts). */
  prefillEntityType?: LinkEntityType;
  prefillEntityId?: number;
}

interface OptionRow {
  id: number;
  primary: string;
  secondary?: string;
}

export function LinkAttachmentDialog({
  open, onOpenChange, messageId, attachmentId, filename, mode = "attachment",
  prefillEntityType, prefillEntityId,
}: LinkAttachmentDialogProps) {
  const isMessageMode = mode === "message";
  const { toast } = useToast();
  const [entityType, setEntityType] = useState<LinkEntityType>(prefillEntityType ?? "customer");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(prefillEntityId ?? null);

  useEffect(() => {
    if (open && prefillEntityType) setEntityType(prefillEntityType);
    if (open && prefillEntityId != null) setSelectedId(prefillEntityId);
  }, [open, prefillEntityType, prefillEntityId]);

  const needsCustomers = open && (entityType === "customer" || entityType === "offer" || entityType === "order");
  const customersQ = useQuery<Customer[]>({
    queryKey: ["/api/customers"], enabled: needsCustomers,
  });
  const contactsQ = useQuery<Contact[]>({
    queryKey: ["/api/contacts"], enabled: open && entityType === "contact",
  });
  const offersQ = useQuery<Offer[]>({
    queryKey: ["/api/offers"], enabled: open && entityType === "offer",
  });
  const ordersQ = useQuery<JobOrder[]>({
    queryKey: ["/api/orders"], enabled: open && entityType === "order",
  });

  const customerNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of customersQ.data ?? []) map.set(c.id, c.name);
    return map;
  }, [customersQ.data]);

  const options: OptionRow[] = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filter = (rows: OptionRow[]) =>
      term ? rows.filter(r =>
        r.primary.toLowerCase().includes(term)
        || (r.secondary?.toLowerCase().includes(term) ?? false)
      ) : rows;

    if (entityType === "customer") {
      return filter((customersQ.data ?? []).map(c => ({
        id: c.id, primary: c.name, secondary: c.customerCode ?? undefined,
      })));
    }
    if (entityType === "contact") {
      return filter((contactsQ.data ?? []).map(c => ({
        id: c.id,
        primary: `${c.firstName} ${c.lastName}`.trim(),
        secondary: c.email ?? undefined,
      })));
    }
    if (entityType === "offer") {
      return filter((offersQ.data ?? []).map(o => {
        const custName = customerNameById.get(o.customerId);
        const secondary = [custName, o.subject].filter(Boolean).join(" • ") || undefined;
        return { id: o.id, primary: o.referenceNumber, secondary };
      }));
    }
    return filter((ordersQ.data ?? []).map(o => {
      const custName = customerNameById.get(o.customerId);
      const secondary = [custName, o.notes].filter(Boolean).join(" • ") || undefined;
      return { id: o.id, primary: o.jobNumber, secondary };
    }));
  }, [entityType, search, customersQ.data, contactsQ.data, offersQ.data, ordersQ.data, customerNameById]);

  const isLoading =
    (entityType === "customer" && customersQ.isLoading)
    || (entityType === "contact" && contactsQ.isLoading)
    || (entityType === "offer" && offersQ.isLoading)
    || (entityType === "order" && ordersQ.isLoading);

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Seleziona un'entità");
      const url = isMessageMode
        ? `/api/email/messages/${messageId}/link`
        : `/api/email/messages/${messageId}/attachments/${attachmentId}/link`;
      return apiRequest("POST", url, { entityType, entityId: selectedId });
    },
    onSuccess: () => {
      toast({
        title: isMessageMode ? "Email collegata" : "Allegato collegato",
        description: filename,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/email-attachments/linked", entityType, selectedId],
      });
      onOpenChange(false);
      setSelectedId(null);
      setSearch("");
    },
    onError: (err: Error) => {
      toast({
        title: "Collegamento fallito",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) { setSelectedId(null); setSearch(""); }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isMessageMode ? <Mail className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
            {isMessageMode ? "Collega email" : "Collega allegato"}
          </DialogTitle>
          <DialogDescription className="truncate">
            {isMessageMode
              ? `Salva l'intero messaggio (.eml) e collegalo a un'entità: ${filename || "—"}`
              : filename}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={entityType}
          onValueChange={(v) => { setEntityType(v as LinkEntityType); setSelectedId(null); }}
          className="min-w-0 w-full"
        >
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="customer" data-testid="tab-link-customer">
              <Building2 className="w-3.5 h-3.5 mr-1" /> Aziende
            </TabsTrigger>
            <TabsTrigger value="contact" data-testid="tab-link-contact">
              <User className="w-3.5 h-3.5 mr-1" /> Contatti
            </TabsTrigger>
            <TabsTrigger value="offer" data-testid="tab-link-offer">
              <FileText className="w-3.5 h-3.5 mr-1" /> Offerte
            </TabsTrigger>
            <TabsTrigger value="order" data-testid="tab-link-order">
              <Package className="w-3.5 h-3.5 mr-1" /> Ordini
            </TabsTrigger>
          </TabsList>

          <TabsContent value={entityType} className="mt-4 space-y-3">
            <Input
              placeholder="Cerca…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-link-search"
            />
            <div className="border rounded-md max-h-72 w-full min-w-0 overflow-y-auto overflow-x-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : options.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nessun risultato
                </p>
              ) : (
                <ul className="divide-y">
                  {options.slice(0, 200).map(opt => (
                    <li key={opt.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(opt.id)}
                        className={`block w-full min-w-0 max-w-full overflow-hidden text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors ${
                          selectedId === opt.id ? "bg-primary/10" : ""
                        }`}
                        data-testid={`option-link-${entityType}-${opt.id}`}
                      >
                        <div className="font-medium truncate">{opt.primary}</div>
                        {opt.secondary && (
                          <div className="text-xs text-muted-foreground truncate">
                            {opt.secondary}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button
            onClick={() => linkMutation.mutate()}
            disabled={!selectedId || linkMutation.isPending}
            data-testid="button-confirm-link-attachment"
          >
            {linkMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Collega
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
