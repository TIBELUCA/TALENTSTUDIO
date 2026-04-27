import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Loader2, Save, Building2, Upload, FileText, X, File, LayoutGrid, Sparkles, AlertCircle, Plus, Trash2, Eye, Printer, History, Pencil, Clock } from "lucide-react";
import { Link } from "wouter";
import { displayVersion } from "@shared/version";

interface OrderItem {
  description: string;
  price: string;
}

interface TechnicalSheet {
  sheetNumber: string;
  totalSheets: string;
  machineName: string;
  areaManager: string;
  commandSide: string;
  workWidth: string;
  colorRAL: string;
  regulations: string;
  language: string;
  sector: string;
  components: string;
  heatingEnergy: string;
  electricSupply: string;
  pneumaticSupply: string;
  workSpeed: string;
  dailyShifts: string;
  minPieceDimensions: string;
  maxPieceDimensions: string;
  maxPieceWeight: string;
  requiredAutomations: string;
  automationControl: string;
  extraControl: string;
  workPlaneHeight: string;
  speedVariation: string;
  motorProtection: string;
  electricalProtection: string;
  transportType: string;
  transportLength: string;
  rollerHardness: string;
  rubberThickness: string;
  optionals: string[];
  spareParts: string[];
  assemblyStartDate: string;
  productionStartDate: string;
  electricalCabling: string;
  electricalCables: string;
  notes: string;
}

function emptySheet(): TechnicalSheet {
  return {
    sheetNumber: "", totalSheets: "", machineName: "", areaManager: "",
    commandSide: "", workWidth: "", colorRAL: "", regulations: "", language: "", sector: "", components: "",
    heatingEnergy: "", electricSupply: "", pneumaticSupply: "",
    workSpeed: "", dailyShifts: "", minPieceDimensions: "", maxPieceDimensions: "", maxPieceWeight: "",
    requiredAutomations: "", automationControl: "", extraControl: "",
    workPlaneHeight: "", speedVariation: "", motorProtection: "", electricalProtection: "",
    transportType: "", transportLength: "", rollerHardness: "", rubberThickness: "",
    optionals: [], spareParts: [],
    assemblyStartDate: "", productionStartDate: "", electricalCabling: "", electricalCables: "", notes: "",
  };
}

interface ExtractedData {
  header?: {
    orderNumber?: string;
    orderDate?: string;
    modifyDate?: string;
    settore?: string;
    job?: string;
    agent?: string;
    agentCommission?: string;
    agent2Commission?: string;
  };
  billing?: {
    customerName?: string;
    city?: string;
    address?: string;
    country?: string;
    phone?: string;
    fax?: string;
  };
  destination?: string;
  payment?: {
    deliveryDate?: string;
    terms?: string[];
  };
  orderItems?: OrderItem[];
  totals?: {
    totalMachines?: string;
    assemblyAndTesting?: string;
    transport?: string;
    totalOrder?: string;
    resa?: string;
    packaging?: string;
    exchangeRate?: string;
  };
  technicalSheets?: TechnicalSheet[];
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{children}</span>;
}

function SectionHeader({ title, className }: { title: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 pb-2 border-b border-foreground/10 ${className ?? ""}`}>
      <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">{title}</h3>
    </div>
  );
}

function FieldInput({ value, onChange, placeholder, className, mono, readOnly, ...rest }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  mono?: boolean;
  readOnly?: boolean;
  [key: string]: any;
}) {
  const filled = value.trim().length > 0;
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full text-sm bg-transparent border-b border-dashed border-muted-foreground/20 focus:border-primary outline-none py-1 transition-colors ${mono ? "font-mono" : ""} ${filled ? "text-foreground" : "text-muted-foreground/60"} ${className ?? ""}`}
      {...rest}
    />
  );
}

export default function OrderManualCreate({ editId }: { editId?: number } = {}) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isEditMode = !!editId;

  const [jobNumber, setJobNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [modifyDate, setModifyDate] = useState("");
  const [settore, setSettore] = useState("Legno");
  const [job, setJob] = useState("");
  const [agent, setAgent] = useState("");
  const [agentCommission, setAgentCommission] = useState("");
  const [agent2Commission, setAgent2Commission] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [fax, setFax] = useState("");

  const [destination, setDestination] = useState("");

  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  const [orderItems, setOrderItems] = useState<OrderItem[]>([{ description: "", price: "" }]);

  const [totalMachines, setTotalMachines] = useState("");
  const [assemblyAndTesting, setAssemblyAndTesting] = useState("");
  const [assemblyAndTestingNotes, setAssemblyAndTestingNotes] = useState("");
  const [transport, setTransport] = useState("");
  const [totalOrder, setTotalOrder] = useState("");
  const [resa, setResa] = useState("");
  const [packaging, setPackaging] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");

  const [technicalSheets, setTechnicalSheets] = useState<TechnicalSheet[]>([]);

  const [status, setStatus] = useState("completed");
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const [documents, setDocuments] = useState<{ file: File; description: string }[]>([]);
  const [layoutFile, setLayoutFile] = useState<File | null>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const layoutFileRef = useRef<HTMLInputElement>(null);
  const pdfFileRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionError, setExtractionError] = useState("");
  const [hasExtracted, setHasExtracted] = useState(false);
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set());
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showChanges, setShowChanges] = useState(false);

  const { data: existingOrder, isLoading: isLoadingOrder } = useQuery<any>({
    queryKey: ["/api/orders", editId],
    enabled: isEditMode,
  });

  const { data: previewPagesData } = useQuery<{ pages: string[] }>({
    queryKey: ["/api/orders", editId, "previews"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${editId}/previews`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load previews");
      return res.json();
    },
    enabled: isEditMode && !!editId,
  });

  const { data: versions } = useQuery<any[]>({
    queryKey: ["/api/orders", editId, "versions"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${editId}/versions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load versions");
      return res.json();
    },
    enabled: isEditMode && !!editId,
  });

  const fmtDateTime = (d: any) => {
    if (!d) return "—";
    const dt = new Date(d);
    return dt.toLocaleDateString("it-IT") + " " + dt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  };

  const handleDelete = async () => {
    try {
      await apiRequest("DELETE", `/api/orders/${editId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({ title: "Commessa eliminata" });
      setLocation("/orders");
    } catch {
      toast({ title: "Errore", description: "Impossibile eliminare", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (!isEditMode || !existingOrder || loaded) return;
    const fd = existingOrder.manualFormData;
    if (fd) {
      setJobNumber(existingOrder.jobNumber ?? "");
      setOrderNumber(fd.orderNumber ?? existingOrder.jobCode ?? "");
      setOrderDate(fd.orderDate ?? "");
      setModifyDate(fd.modifyDate ?? "");
      setSettore(fd.settore ?? existingOrder.settore ?? "Legno");
      setJob(fd.job ?? "");
      setAgent(fd.agent ?? "");
      setAgentCommission(fd.agentCommission ?? "");
      setAgent2Commission(fd.agent2Commission ?? "");
      setCustomerName(fd.customerName ?? existingOrder.customerName ?? "");
      setCustomerSearch(fd.customerName ?? existingOrder.customerName ?? "");
      setCity(fd.city ?? "");
      setAddress(fd.address ?? "");
      setCountry(fd.country ?? "");
      setPhone(fd.phone ?? "");
      setFax(fd.fax ?? "");
      setDestination(fd.destination ?? "");
      setDeliveryDate(fd.deliveryDate ?? "");
      setPaymentTerms(fd.paymentTerms ?? "");
      setOrderItems(fd.orderItems?.length ? fd.orderItems : [{ description: "", price: "" }]);
      setTotalMachines(fd.totalMachines ?? "");
      setAssemblyAndTesting(fd.assemblyAndTesting ?? "");
      setAssemblyAndTestingNotes(fd.assemblyAndTestingNotes ?? "");
      setTransport(fd.transport ?? "");
      setTotalOrder(fd.totalOrder ?? "");
      setResa(fd.resa ?? "");
      setPackaging(fd.packaging ?? "");
      setExchangeRate(fd.exchangeRate ?? "");
      setTechnicalSheets(fd.technicalSheets ?? []);
      setStatus(existingOrder.status ?? "completed");
      setYear(fd.year ?? String(new Date().getFullYear()));
    } else {
      setJobNumber(existingOrder.jobNumber ?? "");
      setOrderNumber(existingOrder.jobCode ?? "");
      setSettore(existingOrder.settore ?? "Legno");
      setCustomerName(existingOrder.customerName ?? "");
      setCustomerSearch(existingOrder.customerName ?? "");
      setStatus(existingOrder.status ?? "completed");
    }
    setLoaded(true);
  }, [isEditMode, existingOrder, loaded]);

  const { data: customersData } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/customers"],
  });

  const filteredCustomers = (customersData ?? []).filter(c =>
    customerSearch.length >= 2 && c.name.toLowerCase().includes(customerSearch.toLowerCase())
  ).slice(0, 8);

  function toggleSheet(index: number) {
    setExpandedSheets(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handlePdfUpload(file: File) {
    setPdfFile(file);
    setIsExtracting(true);
    setExtractionError("");
    setHasExtracted(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/orders/extract-pdf", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Errore nell'estrazione" }));
        throw new Error(err.message || "Errore nell'estrazione del PDF");
      }

      const data: ExtractedData = await res.json();

      if (data.header) {
        if (data.header.orderNumber) setOrderNumber(data.header.orderNumber);
        if (data.header.orderDate) setOrderDate(data.header.orderDate);
        if (data.header.modifyDate) setModifyDate(data.header.modifyDate);
        if (data.header.settore && ["Legno", "Metallo", "Plastica", "Vetro", "Altro"].includes(data.header.settore)) {
          setSettore(data.header.settore);
        }
        if (data.header.job) setJob(data.header.job);
        if (data.header.agent) setAgent(data.header.agent);
        if (data.header.agentCommission) setAgentCommission(data.header.agentCommission);
        if (data.header.agent2Commission) setAgent2Commission(data.header.agent2Commission);
        if (data.header.orderDate) {
          const y = data.header.orderDate.split("-")[0];
          if (y) setYear(y);
        }
      }

      if (data.billing) {
        if (data.billing.customerName) { setCustomerName(data.billing.customerName); setCustomerSearch(""); }
        if (data.billing.city) setCity(data.billing.city);
        if (data.billing.address) setAddress(data.billing.address);
        if (data.billing.country) setCountry(data.billing.country);
        if (data.billing.phone) setPhone(data.billing.phone);
        if (data.billing.fax) setFax(data.billing.fax);
      }

      if (data.destination) setDestination(data.destination);

      if (data.payment) {
        if (data.payment.deliveryDate) setDeliveryDate(data.payment.deliveryDate);
        if (data.payment.terms && data.payment.terms.length > 0) {
          setPaymentTerms(data.payment.terms.join("\n"));
        }
      }

      if (data.orderItems && data.orderItems.length > 0) {
        setOrderItems(data.orderItems);
      }

      if (data.totals) {
        if (data.totals.totalMachines) setTotalMachines(data.totals.totalMachines);
        if (data.totals.assemblyAndTesting) setAssemblyAndTesting(data.totals.assemblyAndTesting);
        if (data.totals.assemblyAndTestingNotes) setAssemblyAndTestingNotes(data.totals.assemblyAndTestingNotes);
        if (data.totals.transport) setTransport(data.totals.transport);
        if (data.totals.totalOrder) setTotalOrder(data.totals.totalOrder);
        if (data.totals.resa) setResa(data.totals.resa);
        if (data.totals.packaging) setPackaging(data.totals.packaging);
        if (data.totals.exchangeRate) setExchangeRate(data.totals.exchangeRate);
      }

      if (data.technicalSheets && data.technicalSheets.length > 0) {
        setTechnicalSheets(data.technicalSheets);
        setExpandedSheets(new Set(data.technicalSheets.map((_: TechnicalSheet, i: number) => i)));
      }

      if (data.previewPages && data.previewPages.length > 0) {
        setPreviewPages(data.previewPages);
      }

      setHasExtracted(true);
      toast({ title: "PDF analizzato con AI Vision", description: `Dati estratti da ${(data.technicalSheets?.length ?? 0) + 1} pagine. Verifica i campi.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore nell'estrazione del PDF";
      setExtractionError(message);
      toast({ title: "Errore estrazione PDF", description: message, variant: "destructive" });
    } finally {
      setIsExtracting(false);
    }
  }

  function assembleNotes(): string {
    const parts: string[] = [];

    if (destination.trim()) parts.push(`Destinazione: ${destination.trim()}`);

    if (paymentTerms.trim()) {
      parts.push(`--- CONDIZIONI DI PAGAMENTO ---\nConsegna: ${deliveryDate}\n${paymentTerms.trim()}`);
    }

    if (orderItems.some(i => i.description.trim())) {
      const itemLines = orderItems
        .filter(i => i.description.trim())
        .map(i => `• ${i.description.trim()}${i.price.trim() ? ` — €${i.price.trim()}` : ""}`);
      parts.push(`--- DETTAGLI ORDINE ---\n${itemLines.join("\n")}`);
    }

    const totParts: string[] = [];
    if (totalMachines) totParts.push(`Totale Macchine: €${totalMachines}`);
    if (assemblyAndTesting) totParts.push(`Montaggio e Collaudo: €${assemblyAndTesting}`);
    if (transport) totParts.push(`Trasporto: €${transport}`);
    if (totalOrder) totParts.push(`Importo Totale Ordine: €${totalOrder}`);
    if (resa) totParts.push(`Resa: ${resa}`);
    if (packaging) totParts.push(`Imballo: ${packaging}`);
    if (exchangeRate) totParts.push(`Cambio: ${exchangeRate}`);
    if (totParts.length > 0) parts.push(`--- RIEPILOGO ---\n${totParts.join("\n")}`);

    if (agent || agentCommission || agent2Commission) {
      const agParts: string[] = [];
      if (agent) agParts.push(`Agente: ${agent}`);
      if (agentCommission) agParts.push(`Provvigione Agente: €${agentCommission}`);
      if (agent2Commission) agParts.push(`Provvigione Agente 2: €${agent2Commission}`);
      parts.push(`--- AGENTE ---\n${agParts.join("\n")}`);
    }

    for (const sheet of technicalSheets) {
      const sheetParts: string[] = [];
      sheetParts.push(`Macchina: ${sheet.machineName}`);
      if (sheet.sheetNumber) sheetParts.push(`Scheda N.: ${sheet.sheetNumber}`);
      if (sheet.commandSide) sheetParts.push(`Lato Comandi: ${sheet.commandSide}`);
      if (sheet.workWidth) sheetParts.push(`Larghezza Lavoro: ${sheet.workWidth} mm`);
      if (sheet.colorRAL) sheetParts.push(`Colore RAL: ${sheet.colorRAL}`);
      if (sheet.regulations) sheetParts.push(`Normative: ${sheet.regulations}`);
      if (sheet.language) sheetParts.push(`Lingua: ${sheet.language}`);
      if (sheet.heatingEnergy) sheetParts.push(`Riscaldamento: ${sheet.heatingEnergy}`);
      if (sheet.electricSupply) sheetParts.push(`Alimentazione Elettrica: ${sheet.electricSupply}`);
      if (sheet.pneumaticSupply) sheetParts.push(`Alimentazione Pneumatica: ${sheet.pneumaticSupply}`);
      if (sheet.workSpeed) sheetParts.push(`Velocità Lavoro: ${sheet.workSpeed}`);
      if (sheet.dailyShifts) sheetParts.push(`Turni: ${sheet.dailyShifts}`);
      if (sheet.minPieceDimensions) sheetParts.push(`Dim. min pezzi: ${sheet.minPieceDimensions}`);
      if (sheet.maxPieceDimensions) sheetParts.push(`Dim. max pezzi: ${sheet.maxPieceDimensions}`);
      if (sheet.workPlaneHeight) sheetParts.push(`Altezza Piano Lavoro: ${sheet.workPlaneHeight}`);
      if (sheet.speedVariation) sheetParts.push(`Variazione Velocità: ${sheet.speedVariation}`);
      if (sheet.motorProtection) sheetParts.push(`Protezione Motori: ${sheet.motorProtection}`);
      if (sheet.electricalProtection) sheetParts.push(`Protezione Q.E.: ${sheet.electricalProtection}`);
      if (sheet.transportType) sheetParts.push(`Tipo Trasporto: ${sheet.transportType}`);
      if (sheet.transportLength) sheetParts.push(`Lunghezza Trasporto: ${sheet.transportLength}`);
      if (sheet.requiredAutomations) sheetParts.push(`Automatismi: ${sheet.requiredAutomations}`);
      if (sheet.extraControl) sheetParts.push(`Controllo Extra: ${sheet.extraControl}`);
      if (sheet.optionals.length > 0) {
        sheetParts.push(`Optionals:\n${sheet.optionals.map((o, i) => `  ${i + 1}. ${o}`).join("\n")}`);
      }
      if (sheet.spareParts.length > 0) {
        sheetParts.push(`Ricambi:\n${sheet.spareParts.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`);
      }
      if (sheet.notes) sheetParts.push(`Note: ${sheet.notes}`);
      parts.push(`--- SCHEDA TECNICA: ${sheet.machineName} ---\n${sheetParts.join("\n")}`);
    }

    return parts.join("\n\n");
  }

  function parsePrice(s: string): number {
    if (!s) return 0;
    const clean = s.replace(/\./g, "").replace(",", ".");
    return parseFloat(clean) || 0;
  }

  function buildManualFormData(): Record<string, any> {
    return {
      orderNumber, orderDate, modifyDate, settore, job, agent, agentCommission, agent2Commission,
      customerName, city, address, country, phone, fax,
      destination, deliveryDate, paymentTerms,
      orderItems: orderItems.filter(i => i.description.trim() || i.price.trim()),
      totalMachines, assemblyAndTesting, assemblyAndTestingNotes, transport, totalOrder, resa, packaging, exchangeRate,
      technicalSheets, year,
    };
  }

  async function handleSubmit() {
    if (!customerName.trim()) return;
    setIsSubmitting(true);

    const allNotes = assembleNotes();
    const itemDescs = orderItems.filter(i => i.description.trim()).map(i => i.description.trim());
    const subject = itemDescs.length > 0 ? itemDescs.join(", ") : "";
    const price = parsePrice(totalOrder) || parsePrice(totalMachines) || orderItems.reduce((sum, i) => sum + parsePrice(i.price), 0);
    const formData = buildManualFormData();

    try {
      if (isEditMode) {
        await apiRequest("PATCH", `/api/orders/${editId}/manual`, {
          customerName: customerName.trim(),
          subject: subject || undefined,
          totalPrice: price || undefined,
          status,
          settore,
          jobCode: orderNumber.trim() || undefined,
          jobNumber: jobNumber.trim() || undefined,
          notes: allNotes || undefined,
          manualFormData: formData,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/orders", editId] });
        queryClient.invalidateQueries({ queryKey: ["/api/orders", editId, "versions"] });
        toast({ title: "Commessa aggiornata", description: "Modifiche salvate con successo" });
        setLocation(`/orders/${editId}`);
      } else {
        const res = await apiRequest("POST", "/api/orders/manual", {
          customerName: customerName.trim(),
          subject: subject || undefined,
          totalPrice: price || undefined,
          status,
          settore,
          jobCode: orderNumber.trim() || undefined,
          jobNumber: jobNumber.trim() || undefined,
          notes: allNotes || undefined,
          year: parseInt(year) || new Date().getFullYear(),
          createdDate: orderDate || undefined,
          previewPages: previewPages.length > 0 ? previewPages : undefined,
          manualFormData: formData,
        });
        const order = await res.json();
        const orderId = order.id;

        if (layoutFile) {
          const fd = new FormData();
          fd.append("file", layoutFile);
          const layoutRes = await fetch(`/api/orders/${orderId}/layout`, {
            method: "POST",
            credentials: "include",
            body: fd,
          });
          if (!layoutRes.ok) {
            toast({ title: "Attenzione", description: "Layout non caricato — riprova dalla pagina commessa", variant: "destructive" });
          }
        }

        const allDocs = [...documents];
        if (pdfFile) {
          allDocs.push({ file: pdfFile, description: "PDF ordine importato (auto-estratto)" });
        }

        for (const doc of allDocs) {
          const fd = new FormData();
          fd.append("file", doc.file);
          fd.append("description", doc.description);
          const docRes = await fetch(`/api/orders/${orderId}/documents`, {
            method: "POST",
            credentials: "include",
            body: fd,
          });
          if (!docRes.ok) {
            toast({ title: "Attenzione", description: `Documento "${doc.file.name}" non caricato`, variant: "destructive" });
          }
        }

        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        toast({ title: "Commessa creata", description: `Commessa ${order.jobNumber} creata con successo` });
        setLocation(`/orders/${orderId}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore nella creazione/aggiornamento";
      toast({ title: "Errore", description: message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 20 }, (_, i) => currentYear - i);

  if (isEditMode && isLoadingOrder) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5 pb-20">
        <div className="flex items-center gap-3">
          <Link href={isEditMode ? `/orders/${editId}` : "/orders"}>
            <Button variant="ghost" size="sm" data-testid="btn-back-orders">
              <ChevronLeft className="w-4 h-4 mr-1" /> {isEditMode ? "Torna alla Commessa" : "Commesse"}
            </Button>
          </Link>
        </div>

        <PageHeader
          title={isEditMode ? `Commessa ${jobNumber || ""}` : "Aggiungi Commessa"}
          subtitle={isEditMode ? "Modifica ordine interno" : "Importa un ordine interno (PDF scansionato) o compila manualmente"}
        />

        {isEditMode && existingOrder && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" className="text-xs" data-testid="badge-version">
                    v{displayVersion(existingOrder.currentVersion)}
                  </Badge>
                  {existingOrder.updatedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {fmtDateTime(existingOrder.updatedAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <a href={`/api/orders/${editId}/pdf`} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" data-testid="btn-print-pdf">
                      <Printer className="w-4 h-4 mr-1" /> Stampa PDF
                    </Button>
                  </a>
                  <Button
                    variant={showVersions ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setShowVersions(!showVersions); setShowChanges(false); }}
                    data-testid="btn-show-versions"
                  >
                    <History className="w-4 h-4 mr-1" /> Versioni
                  </Button>
                  {versions && versions.length >= 1 && (
                    <Button
                      variant={showChanges ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setShowChanges(!showChanges); setShowVersions(false); }}
                      data-testid="btn-show-changes"
                    >
                      <Eye className="w-4 h-4 mr-1" /> Mostra Modifiche
                    </Button>
                  )}
                  <Button variant="destructive" size="sm" onClick={handleDelete} data-testid="btn-delete-order">
                    <Trash2 className="w-4 h-4 mr-1" /> Elimina
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isEditMode && showVersions && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <History className="w-4 h-4" /> Cronologia Versioni
              </h3>
              {!versions || versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna versione precedente trovata.</p>
              ) : (
                <div className="space-y-2">
                  {versions.map((v: any, i: number) => (
                    <div key={v.id} className="border rounded-lg p-3 text-sm" data-testid={`version-row-${i}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Versione {displayVersion(v.versionNumber)}</span>
                        <span className="text-muted-foreground text-xs">{fmtDateTime(v.createdAt)}</span>
                      </div>
                      {v.modifiedByName && (
                        <p className="text-xs text-muted-foreground mt-1">Modificato da: {v.modifiedByName}</p>
                      )}
                      {v.changeSummary && v.changeSummary.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {v.changeSummary.map((c: string, ci: number) => (
                            <li key={ci} className="text-xs text-muted-foreground">• {c}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isEditMode && showChanges && versions && versions.length >= 1 && (() => {
          const latestHistorical = (versions as { versionNumber: number; snapshot: Record<string, any> | null; isCurrent?: boolean }[]).find((v) => !v.isCurrent && v.snapshot);
          if (!latestHistorical) return null;
          const snap: Record<string, any> = latestHistorical.snapshot ?? {};
          const current = existingOrder;
          const diffs: { label: string; old: string; new_: string }[] = [];
          const s = (v: unknown) => (v === null || v === undefined || v === "") ? "—" : String(v);
          if (s(snap.jobNumber) !== s(current.jobNumber)) diffs.push({ label: "Commessa", old: s(snap.jobNumber), new_: s(current.jobNumber) });
          if (s(snap.status) !== s(current.status)) diffs.push({ label: "Stato", old: s(snap.status), new_: s(current.status) });
          if (s(snap.settore) !== s(current.settore)) diffs.push({ label: "Settore", old: s(snap.settore), new_: s(current.settore) });
          if (s(snap.notes) !== s(current.notes)) diffs.push({ label: "Note", old: s(snap.notes), new_: s(current.notes) });
          const snapPrice = snap.priceSummary?.totalOrderPrice ?? snap.priceSummary?.machinesTotal ?? 0;
          const curPrice = current.priceSummary?.totalOrderPrice ?? current.priceSummary?.machinesTotal ?? 0;
          if (snapPrice !== curPrice) diffs.push({ label: "Prezzo Totale", old: `€${snapPrice}`, new_: `€${curPrice}` });
          const snapMfd = JSON.stringify(snap.manualFormData ?? {});
          const curMfd = JSON.stringify(current.manualFormData ?? {});
          if (snapMfd !== curMfd) diffs.push({ label: "Dati del modulo", old: "(versione precedente)", new_: "(versione attuale)" });
          return (
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4" /> Modifiche rispetto alla v{displayVersion(latestHistorical.versionNumber)}
                </h3>
                {diffs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nessuna modifica rilevata.</p>
                ) : (
                  <div className="space-y-2">
                    {diffs.map((d, i) => (
                      <div key={i} className="border rounded p-2 text-xs">
                        <span className="font-medium">{d.label}:</span>
                        <span className="ml-2 line-through text-red-500">{d.old}</span>
                        <span className="ml-2 text-green-600">{d.new_}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {isEditMode && previewPagesData && previewPagesData.pages.length > 0 && (
          <Card data-testid="card-document-preview">
            <CardContent className="pt-4 pb-4 space-y-3">
              <span className="font-semibold text-base flex items-center gap-2">
                <Eye className="w-5 h-5 text-primary" /> Anteprima Documento Originale
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {previewPagesData.pages.map((pagePath, idx) => (
                  <a
                    key={idx}
                    href={pagePath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative border rounded-lg overflow-hidden bg-muted/20 hover:shadow-md transition-shadow aspect-[210/297]"
                    data-testid={`preview-page-${idx}`}
                  >
                    <img
                      src={pagePath}
                      alt={`Pagina ${idx + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                      <span className="text-[10px] text-white font-medium">Pag. {idx + 1}</span>
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <Eye className="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow" />
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {!isEditMode && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium">Importa da PDF (scansione)</span>
              <span className="text-xs text-muted-foreground">— AI Vision analizzerà tutte le pagine</span>
            </div>

            <input
              ref={pdfFileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePdfUpload(file);
                e.target.value = "";
              }}
              data-testid="input-pdf-extract"
            />

            {isExtracting ? (
              <div className="flex items-center gap-3 p-5 border-2 border-dashed border-amber-300 dark:border-amber-600 rounded-lg bg-amber-50/50 dark:bg-amber-900/20">
                <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                <div>
                  <p className="text-sm font-medium">Analisi con AI Vision in corso...</p>
                  <p className="text-xs text-muted-foreground">Le pagine vengono convertite in immagini e analizzate — 15-30 secondi</p>
                </div>
              </div>
            ) : pdfFile ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                  <File className="w-5 h-5 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(pdfFile.size / 1024).toFixed(0)} KB
                      {hasExtracted && ` — dati estratti con successo`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive shrink-0"
                    onClick={() => {
                      setPdfFile(null);
                      setHasExtracted(false);
                      setExtractionError("");
                    }}
                    data-testid="btn-remove-pdf"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {extractionError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {extractionError}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="w-full border-2 border-dashed rounded-lg p-6 text-center hover:border-amber-400 hover:bg-amber-50/30 dark:hover:bg-amber-900/10 transition-colors cursor-pointer"
                onClick={() => pdfFileRef.current?.click()}
                data-testid="btn-upload-pdf-extract"
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-sm font-medium">Carica PDF ordine interno</p>
                <p className="text-xs text-muted-foreground mt-0.5">Scansioni multi-pagina supportate — AI Vision leggerà ogni pagina</p>
              </button>
            )}
          </CardContent>
        </Card>
        )}

        <Card className="border-none shadow-lg overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-muted/30 border-b px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground/70">ORDINE INTERNO</h2>
                {hasExtracted && (
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded font-medium">
                    Auto-compilato da PDF
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-7 text-xs w-28 bg-background" data-testid="select-manual-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Attiva</SelectItem>
                    <SelectItem value="completed">Completata</SelectItem>
                    <SelectItem value="on_hold">Sospesa</SelectItem>
                    <SelectItem value="cancelled">Annullata</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="px-6 py-6 space-y-7 bg-white dark:bg-card" data-testid="document-page-area">

              <div>
                <SectionHeader title="Intestazione" />
                <div className="mb-3 mt-3">
                  <FieldLabel>Nome Commessa</FieldLabel>
                  <FieldInput value={jobNumber} onChange={setJobNumber} placeholder="Lascia vuoto per generazione automatica (es. JOB-2026-005)" data-testid="input-job-number" />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Identificativo univoco della commessa. Se lasciato vuoto verrà generato automaticamente.</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
                  <div>
                    <FieldLabel>N° Ordine</FieldLabel>
                    <FieldInput value={orderNumber} onChange={setOrderNumber} placeholder="26A118" data-testid="input-order-number" />
                  </div>
                  <div>
                    <FieldLabel>Data Ordine</FieldLabel>
                    <Input type="date" value={orderDate} onChange={(e) => { setOrderDate(e.target.value); const y = e.target.value.split("-")[0]; if (y) setYear(y); }} className="h-8 text-sm border-0 border-b border-dashed rounded-none px-0 shadow-none focus-visible:ring-0" data-testid="input-order-date" />
                  </div>
                  <div>
                    <FieldLabel>Data Modifica</FieldLabel>
                    <Input type="date" value={modifyDate} onChange={(e) => setModifyDate(e.target.value)} className="h-8 text-sm border-0 border-b border-dashed rounded-none px-0 shadow-none focus-visible:ring-0" data-testid="input-modify-date" />
                  </div>
                  <div>
                    <FieldLabel>Settore</FieldLabel>
                    <Select value={settore} onValueChange={setSettore}>
                      <SelectTrigger className="h-8 text-sm border-0 border-b border-dashed rounded-none px-0 shadow-none" data-testid="select-settore">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Legno">Legno</SelectItem>
                        <SelectItem value="Metallo">Metallo</SelectItem>
                        <SelectItem value="Plastica">Plastica</SelectItem>
                        <SelectItem value="Vetro">Vetro</SelectItem>
                        <SelectItem value="Altro">Altro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <FieldLabel>Job</FieldLabel>
                    <FieldInput value={job} onChange={setJob} placeholder="FG" />
                  </div>
                  <div>
                    <FieldLabel>Agente</FieldLabel>
                    <FieldInput value={agent} onChange={setAgent} placeholder="APT" />
                  </div>
                  <div>
                    <FieldLabel>Provvigione Agente €</FieldLabel>
                    <FieldInput value={agentCommission} onChange={setAgentCommission} placeholder="0,00" mono />
                  </div>
                  <div>
                    <FieldLabel>Agente 2 €</FieldLabel>
                    <FieldInput value={agent2Commission} onChange={setAgent2Commission} placeholder="0,00" mono />
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader title="Fatturazione" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-3">
                  <div className="md:col-span-2">
                    <FieldLabel>Cliente *</FieldLabel>
                    <div className="relative">
                      <div className="flex items-center">
                        <input
                          value={customerName}
                          onChange={(e) => { setCustomerName(e.target.value); setCustomerSearch(e.target.value); }}
                          placeholder="Nome azienda cliente..."
                          className="w-full text-sm bg-transparent border-b border-dashed border-muted-foreground/20 focus:border-primary outline-none py-1 transition-colors pr-6"
                          data-testid="input-manual-customer"
                        />
                        <Building2 className="absolute right-0 w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      {filteredCustomers.length > 0 && customerSearch.length >= 2 && (
                        <div className="border rounded-md bg-background shadow-sm max-h-40 overflow-y-auto absolute z-10 mt-1 w-full">
                          {filteredCustomers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                              onClick={() => { setCustomerName(c.name); setCustomerSearch(""); }}
                              data-testid={`btn-select-customer-${c.id}`}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Città</FieldLabel>
                    <FieldInput value={city} onChange={setCity} placeholder="Dubai" />
                  </div>
                  <div>
                    <FieldLabel>Nazione</FieldLabel>
                    <FieldInput value={country} onChange={setCountry} placeholder="Emirati Arabi" />
                  </div>
                  <div className="md:col-span-2">
                    <FieldLabel>Indirizzo</FieldLabel>
                    <FieldInput value={address} onChange={setAddress} placeholder="Via / PO Box..." />
                  </div>
                  <div>
                    <FieldLabel>Telefono</FieldLabel>
                    <FieldInput value={phone} onChange={setPhone} placeholder="+39..." />
                  </div>
                  <div>
                    <FieldLabel>Fax</FieldLabel>
                    <FieldInput value={fax} onChange={setFax} placeholder="+39..." />
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader title="Destinazione" />
                <div className="mt-3">
                  <FieldInput value={destination} onChange={setDestination} placeholder="Da comunicare" />
                </div>
              </div>

              <div>
                <SectionHeader title="Condizioni di Pagamento" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-3">
                  <div>
                    <FieldLabel>Consegna</FieldLabel>
                    <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="h-8 text-sm border-0 border-b border-dashed rounded-none px-0 shadow-none focus-visible:ring-0" data-testid="input-delivery-date" />
                  </div>
                  <div className="md:col-span-2">
                    <FieldLabel>Termini di Pagamento</FieldLabel>
                    <textarea
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                      placeholder="50% acconto all'ordine&#10;50% ad avviso merce pronta"
                      rows={3}
                      className="w-full text-sm bg-transparent border-b border-dashed border-muted-foreground/20 focus:border-primary outline-none py-1 resize-none"
                      data-testid="input-payment-terms"
                    />
                  </div>
                </div>
              </div>

              <div>
                <SectionHeader title="Dettagli Ordine" />
                <div className="mt-3 space-y-1">
                  <div className="grid grid-cols-[1fr_140px_32px] gap-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    <span>Descrizione</span>
                    <span className="text-right">Prezzo €</span>
                    <span></span>
                  </div>
                  {orderItems.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_140px_32px] gap-2 items-center" data-testid={`order-item-${i}`}>
                      <input
                        value={item.description}
                        onChange={(e) => setOrderItems(prev => prev.map((it, j) => j === i ? { ...it, description: e.target.value } : it))}
                        placeholder="Descrizione macchina/voce..."
                        className="w-full text-sm bg-transparent border-b border-dashed border-muted-foreground/20 focus:border-primary outline-none py-1.5"
                        data-testid={`input-item-desc-${i}`}
                      />
                      <input
                        value={item.price}
                        onChange={(e) => setOrderItems(prev => prev.map((it, j) => j === i ? { ...it, price: e.target.value } : it))}
                        placeholder="0,00"
                        className="w-full text-sm font-mono bg-transparent border-b border-dashed border-muted-foreground/20 focus:border-primary outline-none py-1.5 text-right"
                        data-testid={`input-item-price-${i}`}
                      />
                      <button
                        type="button"
                        onClick={() => setOrderItems(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)}
                        className="p-1 opacity-40 hover:opacity-100 text-destructive transition-opacity"
                        data-testid={`btn-remove-item-${i}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setOrderItems(prev => [...prev, { description: "", price: "" }])}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
                    data-testid="btn-add-item"
                  >
                    <Plus className="w-3.5 h-3.5" /> Aggiungi voce
                  </button>
                </div>
              </div>

              <div>
                <SectionHeader title="Riepilogo" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 mt-3">
                  <div>
                    <FieldLabel>Totale Macchine €</FieldLabel>
                    <FieldInput value={totalMachines} onChange={setTotalMachines} placeholder="0,00" mono />
                  </div>
                  <div>
                    <FieldLabel>Montaggio e Collaudo €</FieldLabel>
                    <FieldInput value={assemblyAndTesting} onChange={setAssemblyAndTesting} placeholder="0,00" mono />
                  </div>
                  <div>
                    <FieldLabel>Note Montaggio</FieldLabel>
                    <FieldInput value={assemblyAndTestingNotes} onChange={setAssemblyAndTestingNotes} placeholder="es. viaggio incluso, vitto e alloggio ESCLUSI" />
                  </div>
                  <div>
                    <FieldLabel>Trasporto €</FieldLabel>
                    <FieldInput value={transport} onChange={setTransport} placeholder="0,00" mono />
                  </div>
                  <div>
                    <FieldLabel>Importo Totale Ordine €</FieldLabel>
                    <FieldInput value={totalOrder} onChange={setTotalOrder} placeholder="0,00" mono />
                  </div>
                  <div>
                    <FieldLabel>Resa</FieldLabel>
                    <FieldInput value={resa} onChange={setResa} placeholder="FOB, CIF..." />
                  </div>
                  <div>
                    <FieldLabel>Imballo</FieldLabel>
                    <FieldInput value={packaging} onChange={setPackaging} placeholder="Incluso" />
                  </div>
                  <div>
                    <FieldLabel>Cambio</FieldLabel>
                    <FieldInput value={exchangeRate} onChange={setExchangeRate} placeholder="1,00" mono />
                  </div>
                  <div>
                    <FieldLabel>Anno</FieldLabel>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger className="h-8 text-sm border-0 border-b border-dashed rounded-none px-0 shadow-none" data-testid="select-manual-year">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map(y => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {technicalSheets.length > 0 && (
                <div>
                  <SectionHeader title="Schede Tecniche" />
                  <div className="mt-3 space-y-4">
                    {technicalSheets.map((sheet, si) => (
                      <div key={si} className="border rounded-lg overflow-hidden" data-testid={`tech-sheet-${si}`}>
                        <button
                          type="button"
                          onClick={() => toggleSheet(si)}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                          data-testid={`btn-toggle-sheet-${si}`}
                        >
                          <div className="flex items-center gap-2">
                            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{sheet.machineName || `Scheda Tecnica ${si + 1}`}</span>
                            {sheet.sheetNumber && <span className="text-[10px] text-muted-foreground">N° {sheet.sheetNumber}</span>}
                          </div>
                          <ChevronLeft className={`w-4 h-4 text-muted-foreground transition-transform ${expandedSheets.has(si) ? "-rotate-90" : ""}`} />
                        </button>

                        {expandedSheets.has(si) && (
                          <div className="px-4 py-4 space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-3">
                              <div className="md:col-span-3">
                                <FieldLabel>Macchina</FieldLabel>
                                <FieldInput
                                  value={sheet.machineName}
                                  onChange={(v) => setTechnicalSheets(prev => prev.map((s, i) => i === si ? { ...s, machineName: v } : s))}
                                  placeholder="Nome macchina"
                                />
                              </div>
                            </div>

                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-1">Caratteristiche Generali</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-2">
                              {([
                                ["Lato Comandi", "commandSide", "DX"],
                                ["Larghezza Lavoro (mm)", "workWidth", "1300"],
                                ["Colore RAL", "colorRAL", "7035"],
                                ["Normative", "regulations", "CE"],
                                ["Lingua", "language", "Inglese"],
                                ["Settore", "sector", "Standard"],
                                ["Componenti", "components", "Standard"],
                              ] as [string, keyof TechnicalSheet, string][]).map(([label, key, ph]) => (
                                <div key={key}>
                                  <FieldLabel>{label}</FieldLabel>
                                  <FieldInput
                                    value={sheet[key] as string}
                                    onChange={(v) => setTechnicalSheets(prev => prev.map((s, i) => i === si ? { ...s, [key]: v } : s))}
                                    placeholder={ph}
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-1">Fonti di Energia</div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-2">
                              {([
                                ["Riscaldamento", "heatingEnergy", "Acqua 85°"],
                                ["Alimentazione Elettrica", "electricSupply", "400/50+T+N"],
                                ["Alimentazione Pneumatica", "pneumaticSupply", "6 Atm."],
                              ] as [string, keyof TechnicalSheet, string][]).map(([label, key, ph]) => (
                                <div key={key}>
                                  <FieldLabel>{label}</FieldLabel>
                                  <FieldInput
                                    value={sheet[key] as string}
                                    onChange={(v) => setTechnicalSheets(prev => prev.map((s, i) => i === si ? { ...s, [key]: v } : s))}
                                    placeholder={ph}
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-1">Prestazioni</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-2">
                              {([
                                ["Velocità Lavoro", "workSpeed", "8-10 m/1'"],
                                ["Turni Giornalieri", "dailyShifts", "1x8"],
                                ["Dim. min pezzi", "minPieceDimensions", "300x20x3 mm"],
                                ["Dim. max pezzi", "maxPieceDimensions", "3000x1280x90 mm"],
                                ["Peso max pezzi", "maxPieceWeight", "KG"],
                              ] as [string, keyof TechnicalSheet, string][]).map(([label, key, ph]) => (
                                <div key={key}>
                                  <FieldLabel>{label}</FieldLabel>
                                  <FieldInput
                                    value={sheet[key] as string}
                                    onChange={(v) => setTechnicalSheets(prev => prev.map((s, i) => i === si ? { ...s, [key]: v } : s))}
                                    placeholder={ph}
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-1">Dettagli Tecnici</div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-2">
                              {([
                                ["Altezza Piano Lavoro", "workPlaneHeight", "900 mm"],
                                ["Variazione Velocità", "speedVariation", "7-21 m/1'"],
                                ["Protezione Motori", "motorProtection", "ATEX 3G"],
                                ["Protezione Q.E.", "electricalProtection", "IP 55"],
                                ["Tipo Trasporto", "transportType", "A tappeto"],
                                ["Lunghezza Trasporto", "transportLength", "1500 mm"],
                                ["Durezza Rullo", "rollerHardness", "40 SH"],
                                ["Spessore Gommatura", "rubberThickness", "20 mm"],
                              ] as [string, keyof TechnicalSheet, string][]).map(([label, key, ph]) => (
                                <div key={key}>
                                  <FieldLabel>{label}</FieldLabel>
                                  <FieldInput
                                    value={sheet[key] as string}
                                    onChange={(v) => setTechnicalSheets(prev => prev.map((s, i) => i === si ? { ...s, [key]: v } : s))}
                                    placeholder={ph}
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-1">Automatismi</div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-2">
                              {([
                                ["Automatismi Richiesti", "requiredAutomations", "Nessuno"],
                                ["Controllo Automatismi", "automationControl", "Nessuno"],
                                ["Controllo Extra", "extraControl", ""],
                              ] as [string, keyof TechnicalSheet, string][]).map(([label, key, ph]) => (
                                <div key={key}>
                                  <FieldLabel>{label}</FieldLabel>
                                  <FieldInput
                                    value={sheet[key] as string}
                                    onChange={(v) => setTechnicalSheets(prev => prev.map((s, i) => i === si ? { ...s, [key]: v } : s))}
                                    placeholder={ph}
                                  />
                                </div>
                              ))}
                            </div>

                            <div>
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-1 mb-2">Optionals</div>
                              {sheet.optionals.map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2 mb-1">
                                  <span className="text-xs text-muted-foreground w-5 text-right">{oi + 1}.</span>
                                  <input
                                    value={opt}
                                    onChange={(e) => {
                                      setTechnicalSheets(prev => prev.map((s, i) => {
                                        if (i !== si) return s;
                                        const newOpts = [...s.optionals];
                                        newOpts[oi] = e.target.value;
                                        return { ...s, optionals: newOpts };
                                      }));
                                    }}
                                    className="flex-1 text-sm bg-transparent border-b border-dashed border-muted-foreground/20 focus:border-primary outline-none py-0.5"
                                    data-testid={`input-optional-${si}-${oi}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTechnicalSheets(prev => prev.map((s, i) => {
                                        if (i !== si) return s;
                                        return { ...s, optionals: s.optionals.filter((_, j) => j !== oi) };
                                      }));
                                    }}
                                    className="p-0.5 opacity-40 hover:opacity-100 text-destructive"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  setTechnicalSheets(prev => prev.map((s, i) => i === si ? { ...s, optionals: [...s.optionals, ""] } : s));
                                }}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
                              >
                                <Plus className="w-3 h-3" /> Aggiungi optional
                              </button>
                            </div>

                            <div>
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-1 mb-2">Ricambi</div>
                              {sheet.spareParts.map((part, pi) => (
                                <div key={pi} className="flex items-center gap-2 mb-1">
                                  <span className="text-xs text-muted-foreground w-5 text-right">{pi + 1}.</span>
                                  <input
                                    value={part}
                                    onChange={(e) => {
                                      setTechnicalSheets(prev => prev.map((s, i) => {
                                        if (i !== si) return s;
                                        const newParts = [...s.spareParts];
                                        newParts[pi] = e.target.value;
                                        return { ...s, spareParts: newParts };
                                      }));
                                    }}
                                    className="flex-1 text-sm bg-transparent border-b border-dashed border-muted-foreground/20 focus:border-primary outline-none py-0.5"
                                    data-testid={`input-sparepart-${si}-${pi}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setTechnicalSheets(prev => prev.map((s, i) => {
                                        if (i !== si) return s;
                                        return { ...s, spareParts: s.spareParts.filter((_, j) => j !== pi) };
                                      }));
                                    }}
                                    className="p-0.5 opacity-40 hover:opacity-100 text-destructive"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => {
                                  setTechnicalSheets(prev => prev.map((s, i) => i === si ? { ...s, spareParts: [...s.spareParts, ""] } : s));
                                }}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1"
                              >
                                <Plus className="w-3 h-3" /> Aggiungi ricambio
                              </button>
                            </div>

                            <div>
                              <FieldLabel>Note Scheda</FieldLabel>
                              <textarea
                                value={sheet.notes}
                                onChange={(e) => setTechnicalSheets(prev => prev.map((s, i) => i === si ? { ...s, notes: e.target.value } : s))}
                                placeholder="Note aggiuntive per questa scheda tecnica..."
                                className="w-full text-sm bg-transparent border-b border-dashed border-muted-foreground/20 focus:border-primary outline-none py-1 resize-none"
                                rows={2}
                              />
                            </div>

                            <div className="flex justify-end pt-2">
                              <button
                                type="button"
                                onClick={() => setTechnicalSheets(prev => prev.filter((_, i) => i !== si))}
                                className="text-xs text-destructive/70 hover:text-destructive flex items-center gap-1"
                                data-testid={`btn-remove-sheet-${si}`}
                              >
                                <Trash2 className="w-3 h-3" /> Rimuovi scheda
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => { setTechnicalSheets(prev => [...prev, emptySheet()]); setExpandedSheets(prev => new Set([...prev, technicalSheets.length])); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                data-testid="btn-add-sheet"
              >
                <Plus className="w-3.5 h-3.5" /> Aggiungi scheda tecnica
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Layout (PDF)</Label>
              </div>
              <input
                ref={layoutFileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setLayoutFile(file);
                  e.target.value = "";
                }}
                data-testid="input-layout-file"
              />
              {layoutFile ? (
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                  <File className="w-5 h-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{layoutFile.name}</p>
                    <p className="text-xs text-muted-foreground">{(layoutFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive shrink-0" onClick={() => setLayoutFile(null)} data-testid="btn-remove-layout">
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => layoutFileRef.current?.click()} data-testid="btn-upload-layout">
                  <Upload className="w-4 h-4" /> Carica layout PDF
                </Button>
              )}
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Documenti aggiuntivi</Label>
                </div>
                <input
                  ref={docFileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setDocuments(prev => [...prev, { file, description: "" }]);
                    e.target.value = "";
                  }}
                  data-testid="input-doc-file"
                />
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => docFileRef.current?.click()} data-testid="btn-add-document">
                  <Upload className="w-4 h-4" /> Aggiungi
                </Button>
              </div>

              {documents.length === 0 && !pdfFile && (
                <div className="text-center py-4 border border-dashed rounded-lg text-muted-foreground">
                  <FileText className="w-6 h-6 mx-auto mb-1 opacity-40" />
                  <p className="text-xs">Nessun documento aggiuntivo</p>
                </div>
              )}

              {pdfFile && (
                <div className="flex items-center gap-3 p-3 border rounded-lg bg-amber-50/30 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                    <p className="text-xs text-muted-foreground">Verrà allegato automaticamente alla commessa</p>
                  </div>
                </div>
              )}

              {documents.map((doc, i) => (
                <div key={i} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
                  <File className="w-5 h-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-medium truncate">{doc.file.name}</p>
                    <Input
                      value={doc.description}
                      onChange={(e) => setDocuments(prev => prev.map((d, j) => j === i ? { ...d, description: e.target.value } : d))}
                      placeholder="Descrizione..."
                      className="h-7 text-xs"
                      data-testid={`input-doc-desc-${i}`}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">{(doc.file.size / 1024).toFixed(0)} KB</div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive shrink-0" onClick={() => setDocuments(prev => prev.filter((_, j) => j !== i))} data-testid={`btn-remove-doc-${i}`}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Link href="/orders">
            <Button variant="outline" data-testid="btn-cancel-manual">Annulla</Button>
          </Link>
          <Button
            onClick={handleSubmit}
            disabled={!customerName.trim() || isSubmitting}
            data-testid="btn-save-manual-order"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {isEditMode ? "Salva Modifiche" : "Crea Commessa"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
