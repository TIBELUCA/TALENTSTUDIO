import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import DOMPurify from "dompurify";
import {
  Inbox, Send, FileEdit, Star, Trash2, Search, Plus, Reply, Forward, MailOpen,
  Mail, Loader2, Paperclip, Download, ChevronLeft, RefreshCw, MoreVertical,
  Sparkles, ListTodo, MessageSquareText, Wand2, BookOpen, X, Check, StarOff,
  AlertTriangle, ExternalLink, ToggleLeft, ToggleRight, Eye, FileText, Link2,
  CalendarIcon, Filter, Lightbulb, Package, User, Building2,
} from "lucide-react";
import { useLocation } from "wouter";
import { PdfViewer } from "@/components/PdfViewer";
import { LinkAttachmentDialog } from "@/components/LinkAttachmentDialog";
import { Calendar } from "@/components/ui/calendar";
import { it } from "date-fns/locale";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Folder = "INBOX" | "SENT" | "STARRED" | "DRAFTS";

interface EmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  internalDate: string;
  isUnread: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  hasAlerts?: boolean;
  bodyHtml?: string;
  bodyText?: string;
  attachments?: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  }>;
  messageId?: string;
  references?: string;
  inReplyTo?: string;
  draftId?: string;
}

interface ComposeAttachment {
  filename: string;
  mimeType: string;
  data: string;
  size: number;
  savedInDraft?: boolean;
}

interface ComposeState {
  to: string;
  cc: string;
  subject: string;
  bodyHtml: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
  draftId?: string;
  mode: "new" | "reply" | "forward";
  attachments?: ComposeAttachment[];
}

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ""), email: match[2] };
  return { name: raw, email: raw };
}

function getInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDay.getTime() === today.getTime()) {
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
  if (now.getFullYear() === d.getFullYear()) {
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.it", "hotmail.com",
  "hotmail.it", "outlook.com", "outlook.it", "live.com", "live.it",
  "msn.com", "icloud.com", "me.com", "libero.it", "alice.it", "tin.it",
  "virgilio.it", "tiscali.it", "fastwebnet.it", "pec.it", "aruba.it",
  "legalmail.it", "proton.me", "protonmail.com",
]);

const MIME_EXT_MAP: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "text/html": "html",
  "application/zip": "zip",
  "application/x-rar-compressed": "rar",
  "application/x-7z-compressed": "7z",
  "application/json": "json",
  "application/xml": "xml",
  "message/rfc822": "eml",
  "image/vnd.dwg": "dwg",
  "application/acad": "dwg",
  "application/x-dwg": "dwg",
  "application/dxf": "dxf",
};

function getDisplayExtension(filename: string, mime: string | null | undefined): string {
  const m = filename.match(/\.([a-z0-9]{1,5})$/i);
  if (m) return m[1].toLowerCase();
  const fromMime = MIME_EXT_MAP[(mime || "").toLowerCase()];
  return fromMime ?? "";
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function getEmailPlainText(msg: { bodyText?: string | null; bodyHtml?: string | null; snippet?: string | null }): string {
  if (msg.bodyText && msg.bodyText.trim()) return msg.bodyText;
  if (msg.bodyHtml && msg.bodyHtml.trim()) return stripHtmlToText(msg.bodyHtml);
  return msg.snippet || "";
}

function extractPhoneFromEmail(msg: { bodyText?: string | null; bodyHtml?: string | null; snippet?: string | null } | null | undefined): string | null {
  if (!msg) return null;
  const text = getEmailPlainText(msg);
  if (!text) return null;
  // Look for typical Italian/intl phone patterns near phone keywords first.
  const labelRe = /(?:tel(?:efono)?|mob(?:ile|\.)?|cell(?:ulare|\.)?|phone|t\.|m\.)\s*[:.\-]?\s*((?:\+?\d[\d\s().\-/]{7,}\d))/i;
  const m = text.match(labelRe);
  let raw = m?.[1];
  if (!raw) {
    // Fallback: any phone-like sequence with at least 8 digits, optional + prefix.
    const generic = text.match(/(\+?\d[\d\s().\-/]{7,}\d)/);
    raw = generic?.[1];
  }
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d+]/g, "");
  const digits = cleaned.replace(/^\+/, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return cleaned;
}

function extractWebsiteFromSender(
  senderEmail: string | null | undefined,
  msg: { bodyText?: string | null; bodyHtml?: string | null; snippet?: string | null } | null | undefined,
): string | null {
  // Prefer a website mentioned explicitly in the email body.
  if (msg) {
    const text = getEmailPlainText(msg);
    const urlMatch = text.match(/\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})(\/[^\s]*)?/i);
    if (urlMatch) {
      const host = urlMatch[1].replace(/^www\./i, "").toLowerCase();
      if (!FREE_EMAIL_DOMAINS.has(host)) return `https://${host}`;
    }
  }
  // Fallback: derive from the sender's email domain (only if not a free provider).
  if (senderEmail && senderEmail.includes("@")) {
    const domain = senderEmail.split("@")[1]?.toLowerCase().trim();
    if (domain && !FREE_EMAIL_DOMAINS.has(domain)) return `https://${domain}`;
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

async function downloadAttachment(messageId: string, attachmentId: string, filename: string): Promise<void> {
  const res = await fetch(
    `/api/email/messages/${messageId}/attachments/${attachmentId}?download=1`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "attachment";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface AiSummarizeResult {
  summary: string;
  keyPoints: string[];
  actionRequired: boolean;
  sentiment: "positive" | "neutral" | "negative";
}

interface AiTodosResult {
  todos: Array<{ text: string; priority: string; deadline?: string | null }>;
}

interface AiSuggestRepliesResult {
  replies: Array<{ label: string; bodyHtml: string }>;
}

interface AiImproveResult {
  improved: string;
}

interface AiRecapResult {
  recap: string;
  highlights: string[];
  pendingActions: string[];
}

type AiResult = AiSummarizeResult | AiTodosResult | AiSuggestRepliesResult | AiImproveResult | AiRecapResult;

interface EmailConnection {
  id: number;
  provider: string;
  email?: string;
  isDefault?: boolean;
}

const EMPTY_COMPOSE: ComposeState = {
  to: "", cc: "", subject: "", bodyHtml: "", mode: "new", attachments: [],
};

function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "p", "br", "b", "i", "u", "s", "strong", "em", "a", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "blockquote",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
      "img", "picture", "source", "figure", "figcaption",
      "hr", "pre", "code", "small", "big", "tt", "sub", "sup", "mark", "del", "ins",
      "font", "center", "address", "article", "section", "header", "footer", "main", "nav", "aside",
      "dl", "dt", "dd", "abbr", "cite", "q", "time", "label",
      "style",
    ],
    ALLOWED_ATTR: [
      "href", "src", "srcset", "sizes", "alt", "title", "style", "class", "id",
      "target", "rel", "width", "height", "loading",
      "align", "valign", "bgcolor", "background", "color", "face", "size",
      "border", "cellpadding", "cellspacing", "colspan", "rowspan",
      "dir", "lang", "role",
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
  });
}

export default function EmailPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // Read deep-link params from the URL once: support ?messageId=...&folder=...&q=...
  // Used by the Recap page to jump straight to a specific email.
  const initialUrlParams = useMemo(() => {
    if (typeof window === "undefined") return { folder: null as Folder | null, q: "" };
    const sp = new URLSearchParams(window.location.search);
    const f = (sp.get("folder") || "").toUpperCase();
    const validFolders: Folder[] = ["INBOX", "SENT", "DRAFTS", "STARRED"];
    return {
      folder: validFolders.includes(f as Folder) ? (f as Folder) : null,
      q: (sp.get("q") || "").trim(),
    };
  }, []);

  const [folder, setFolder] = useState<Folder>(initialUrlParams.folder ?? "INBOX");
  const [searchQuery, setSearchQuery] = useState(initialUrlParams.q);
  const [activeSearch, setActiveSearch] = useState(initialUrlParams.q);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [filters, setFilters] = useState({ from: "", to: "", subject: "", body: "", ai: "" });
  const [draftFilters, setDraftFilters] = useState({ from: "", to: "", subject: "", body: "", ai: "" });
  const filtersActiveCount = Object.values(filters).filter(v => v.trim()).length;
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    const m = sp.get("messageId");
    return m && m.trim() ? m.trim() : null;
  });

  // Re-handle the deep-link params whenever the URL search string changes
  // (the page may stay mounted while the user navigates back to /email
  // from the Recap with new params). After consuming, strip them from
  // the URL so closing the dialog doesn't re-open it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const consume = () => {
      const sp = new URLSearchParams(window.location.search);
      const m = sp.get("messageId");
      const f = (sp.get("folder") || "").toUpperCase();
      const q = (sp.get("q") || "").trim();
      const validFolders: Folder[] = ["INBOX", "SENT", "DRAFTS", "STARRED"];
      let touched = false;
      if (m && m.trim()) { setSelectedMessageId(m.trim()); touched = true; }
      if (validFolders.includes(f as Folder)) { setFolder(f as Folder); touched = true; }
      if (q) { setSearchQuery(q); setActiveSearch(q); touched = true; }
      if (!touched) return;
      sp.delete("messageId");
      sp.delete("folder");
      sp.delete("q");
      const newSearch = sp.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
      window.history.replaceState(window.history.state, "", newUrl);
    };
    consume();
    window.addEventListener("popstate", consume);
    return () => window.removeEventListener("popstate", consume);
  }, []);

  const [showCompose, setShowCompose] = useState(false);

  // Read deep-link compose params (?compose=1&to=&subject=&body=) and open the
  // composer prefilled. Used by Quotes / Campaigns "Componi email" actions.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("compose") !== "1") return;
    const to = sp.get("to") ?? "";
    const subject = sp.get("subject") ?? "";
    const body = sp.get("body") ?? "";
    const bodyHtml = body
      ? body.split("\n").map(line => line ? `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : "<p><br/></p>").join("")
      : "";
    setCompose(prev => ({ ...prev, to, subject, bodyHtml, mode: "new", attachments: [] }));
    setShowCompose(true);
    sp.delete("compose"); sp.delete("to"); sp.delete("subject"); sp.delete("body");
    sp.delete("quoteId"); sp.delete("campaignId");
    const newSearch = sp.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${newSearch ? "?" + newSearch : ""}`);
  }, []);
  const [previewAttachment, setPreviewAttachment] = useState<{
    messageId: string;
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  } | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewPdfData, setPreviewPdfData] = useState<ArrayBuffer | null>(null);
  const [linkDialog, setLinkDialog] = useState<{
    messageId: string;
    attachmentId?: string;
    filename: string;
    mode: "attachment" | "message";
    prefillEntityType?: "customer" | "contact" | "offer" | "order";
    prefillEntityId?: number;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [compose, setCompose] = useState<ComposeState>(EMPTY_COMPOSE);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiType, setAiType] = useState<string>("");
  const bodyEditorRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: connections } = useQuery<EmailConnection[]>({
    queryKey: ["/api/email/connections"],
  });

  const hasGmail = connections?.some(c => c.provider === "gmail");

  const { data: unreadData } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/email/unread-count"],
    enabled: !!hasGmail,
    refetchInterval: 60000,
  });

  const { data: aiStatus } = useQuery<{ aiEnabled: boolean; userPref: boolean; globalEnabled: boolean }>({
    queryKey: ["/api/email/ai/status"],
    enabled: !!hasGmail,
    staleTime: 300000,
  });

  const aiEnabled = aiStatus?.aiEnabled ?? false;

  const aiToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest("PATCH", "/api/email/ai/toggle", { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/ai/status"] });
    },
  });

  const messagesQuery = useInfiniteQuery<{ messages: EmailMessage[]; nextPageToken: string | null }>({
    queryKey: ["/api/email/messages", folder, activeSearch, selectedDate?.toISOString() ?? "", filters],
    queryFn: async ({ pageParam }) => {
      if (folder === "DRAFTS") return { messages: [], nextPageToken: null };
      const params = new URLSearchParams({ folder, maxResults: "30" });
      const qParts: string[] = [];
      if (activeSearch) qParts.push(activeSearch);
      if (filters.from.trim()) qParts.push(`from:${filters.from.trim()}`);
      if (filters.to.trim()) qParts.push(`to:${filters.to.trim()}`);
      if (filters.subject.trim()) qParts.push(`subject:(${filters.subject.trim()})`);
      if (filters.body.trim()) qParts.push(`"${filters.body.trim().replace(/"/g, '')}"`);
      if (filters.ai.trim()) qParts.push(filters.ai.trim());
      if (selectedDate) {
        const y = selectedDate.getFullYear();
        const m = String(selectedDate.getMonth() + 1).padStart(2, "0");
        const d = String(selectedDate.getDate()).padStart(2, "0");
        const next = new Date(selectedDate);
        next.setDate(next.getDate() + 1);
        const ny = next.getFullYear();
        const nm = String(next.getMonth() + 1).padStart(2, "0");
        const nd = String(next.getDate()).padStart(2, "0");
        qParts.push(`after:${y}/${m}/${d} before:${ny}/${nm}/${nd}`);
      }
      if (qParts.length) params.set("q", qParts.join(" "));
      if (pageParam) params.set("pageToken", String(pageParam));
      const res = await fetch(`/api/email/messages?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextPageToken ?? undefined,
    enabled: !!hasGmail && folder !== "DRAFTS",
  });

  const draftsQuery = useQuery<{ drafts: EmailMessage[] }>({
    queryKey: ["/api/email/drafts"],
    queryFn: async () => {
      const res = await fetch("/api/email/drafts?maxResults=30", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch drafts");
      return res.json();
    },
    enabled: !!hasGmail,
    staleTime: folder === "DRAFTS" ? 0 : 120000,
  });

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    if (!messagesQuery.hasNextPage || messagesQuery.isFetchingNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        messagesQuery.fetchNextPage();
      }
    }, { root: null, rootMargin: "200px", threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [messagesQuery.hasNextPage, messagesQuery.isFetchingNextPage, messagesQuery.fetchNextPage, messagesQuery.data?.pages.length]);

  const messageDetailQuery = useQuery<EmailMessage>({
    queryKey: ["/api/email/messages", selectedMessageId],
    queryFn: async () => {
      const res = await fetch(`/api/email/messages/${encodeURIComponent(selectedMessageId!)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch message");
      return res.json();
    },
    enabled: !!selectedMessageId && folder !== "DRAFTS",
  });

  const markReadMutation = useMutation({
    mutationFn: async ({ messageId, read }: { messageId: string; read: boolean }) => {
      return apiRequest("PATCH", `/api/email/messages/${messageId}/read`, { read });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/unread-count"] });
    },
  });

  const starMutation = useMutation({
    mutationFn: async ({ messageId, starred }: { messageId: string; starred: boolean }) => {
      return apiRequest("PATCH", `/api/email/messages/${messageId}/star`, { starred });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/messages"] });
    },
  });

  const trashMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return apiRequest("DELETE", `/api/email/messages/${messageId}`);
    },
    onSuccess: () => {
      setSelectedMessageId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/email/messages"] });
      toast({ title: "Email spostata nel cestino" });
    },
  });

  const linkSuggestionMutation = useMutation({
    mutationFn: async (vars: {
      messageId: string;
      attachmentId?: string;
      mode: "attachment" | "message";
      entityType: "order" | "offer";
      entityId: number;
      label: string;
    }) => {
      const url = vars.mode === "message"
        ? `/api/email/messages/${vars.messageId}/link`
        : `/api/email/messages/${vars.messageId}/attachments/${vars.attachmentId}/link`;
      await apiRequest("POST", url, { entityType: vars.entityType, entityId: vars.entityId });
      return vars;
    },
    onSuccess: (vars) => {
      const entityLabel = vars.entityType === "order" ? "Commessa" : "Offerta";
      toast({
        title: vars.mode === "message" ? "Email collegata" : "Allegato collegato",
        description: `${entityLabel} ${vars.label}`,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/email-attachments/linked", vars.entityType, vars.entityId],
      });
      // Refresh suggestions so the row flips to the "Collegato" badge
      queryClient.invalidateQueries({
        queryKey: ["/api/email/messages", vars.messageId, "link-suggestions"],
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Collegamento fallito",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const hasSavedAttachments = (compose.attachments || []).some(a => a.savedInDraft);
      if (compose.draftId && hasSavedAttachments) {
        const newAtts = (compose.attachments || []).filter(a => !a.savedInDraft);
        await apiRequest("PUT", `/api/email/drafts/${compose.draftId}`, {
          to: compose.to, cc: compose.cc, subject: compose.subject, bodyHtml: compose.bodyHtml,
          inReplyTo: compose.inReplyTo, references: compose.references, threadId: compose.threadId,
          attachments: newAtts.map(a => ({ filename: a.filename, mimeType: a.mimeType, data: a.data })),
          preserveExistingAttachments: true,
        });
        return apiRequest("POST", `/api/email/drafts/${compose.draftId}/send`);
      }
      return apiRequest("POST", "/api/email/send", {
        to: compose.to,
        cc: compose.cc || undefined,
        subject: compose.subject,
        bodyHtml: compose.bodyHtml,
        inReplyTo: compose.inReplyTo,
        references: compose.references,
        threadId: compose.threadId,
        attachments: (compose.attachments || []).map(a => ({
          filename: a.filename,
          mimeType: a.mimeType,
          data: a.data,
        })),
      });
    },
    onSuccess: () => {
      toast({ title: "Email inviata" });
      setShowCompose(false);
      setCompose(EMPTY_COMPOSE);
      queryClient.invalidateQueries({ queryKey: ["/api/email/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/drafts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Errore invio", description: err.message, variant: "destructive" });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const hasSavedAttachments = (compose.attachments || []).some(a => a.savedInDraft);
      const draftPayload = {
        to: compose.to, cc: compose.cc, subject: compose.subject, bodyHtml: compose.bodyHtml,
        inReplyTo: compose.inReplyTo, references: compose.references, threadId: compose.threadId,
        attachments: (compose.attachments || []).filter(a => !a.savedInDraft).map(a => ({ filename: a.filename, mimeType: a.mimeType, data: a.data })),
        preserveExistingAttachments: hasSavedAttachments,
      };
      if (compose.draftId) {
        return apiRequest("PUT", `/api/email/drafts/${compose.draftId}`, draftPayload);
      } else {
        const res = await apiRequest("POST", "/api/email/drafts", draftPayload);
        const data = await res.json();
        setCompose(prev => ({ ...prev, draftId: data.draftId }));
        return data;
      }
    },
    onSuccess: () => {
      toast({ title: "Bozza salvata" });
      queryClient.invalidateQueries({ queryKey: ["/api/email/drafts"] });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (draftId: string) => {
      return apiRequest("DELETE", `/api/email/drafts/${draftId}`);
    },
    onSuccess: () => {
      toast({ title: "Bozza eliminata" });
      queryClient.invalidateQueries({ queryKey: ["/api/email/drafts"] });
    },
  });

  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (file.size > 25 * 1024 * 1024) {
        toast({ title: "File troppo grande", description: `${file.name} supera i 25 MB`, variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        setCompose(prev => ({
          ...prev,
          attachments: [...(prev.attachments || []), {
            filename: file.name,
            mimeType: file.type || "application/octet-stream",
            data: base64,
            size: file.size,
          }],
        }));
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }, [toast]);

  const removeAttachment = useCallback((index: number) => {
    setCompose(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter((_, i) => i !== index),
    }));
  }, []);

  const lastAppliedBodyRef = useRef("");
  useEffect(() => {
    if (!previewAttachment) {
      setPreviewBlobUrl(null);
      setPreviewPdfData(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    let createdUrl: string | null = null;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewBlobUrl(null);
    setPreviewPdfData(null);
    const isPdf = previewAttachment.mimeType === "application/pdf"
      || /\.pdf$/i.test(previewAttachment.filename);
    (async () => {
      try {
        const res = await fetch(
          `/api/email/messages/${previewAttachment.messageId}/attachments/${previewAttachment.attachmentId}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (isPdf) {
          const buf = await res.arrayBuffer();
          if (cancelled) return;
          setPreviewPdfData(buf);
        } else {
          const blob = await res.blob();
          const typedBlob = blob.type
            ? blob
            : new Blob([blob], { type: previewAttachment.mimeType || "application/octet-stream" });
          createdUrl = URL.createObjectURL(typedBlob);
          if (cancelled) {
            URL.revokeObjectURL(createdUrl);
            return;
          }
          setPreviewBlobUrl(createdUrl);
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(err instanceof Error ? err.message : "Impossibile caricare l'anteprima");
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [previewAttachment]);

  useEffect(() => {
    if (showCompose && bodyEditorRef.current) {
      if (compose.bodyHtml !== lastAppliedBodyRef.current) {
        const editorHtml = bodyEditorRef.current.innerHTML;
        if (editorHtml !== compose.bodyHtml) {
          bodyEditorRef.current.innerHTML = sanitizeHtml(compose.bodyHtml);
        }
        lastAppliedBodyRef.current = compose.bodyHtml;
      }
    }
  }, [showCompose, compose.bodyHtml]);

  useEffect(() => {
    if (showCompose && (compose.to || compose.subject || compose.bodyHtml)) {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setInterval(() => {
        if (compose.to || compose.subject || compose.bodyHtml) {
          saveDraftMutation.mutate();
        }
      }, 30000);
    }
    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [showCompose, compose.to, compose.subject, compose.bodyHtml]);

  useEffect(() => {
    if (selectedMessageId && messageDetailQuery.data?.isUnread) {
      markReadMutation.mutate({ messageId: selectedMessageId, read: true });
    }
  }, [selectedMessageId, messageDetailQuery.data?.isUnread]);

  const handleSearch = useCallback(() => {
    setActiveSearch(searchQuery);
    setSelectedMessageId(null);
  }, [searchQuery]);

  const handleReply = useCallback((msg: EmailMessage) => {
    const fromParsed = parseEmailAddress(msg.from);
    setCompose({
      to: fromParsed.email,
      cc: "",
      subject: msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`,
      bodyHtml: `<br/><br/><div style="border-left:2px solid #ccc;padding-left:12px;margin-left:0;color:#666">
        <p><strong>${msg.from}</strong> — ${msg.date}</p>
        ${msg.bodyHtml || `<p>${msg.bodyText || msg.snippet}</p>`}
      </div>`,
      inReplyTo: msg.messageId,
      references: msg.references ? `${msg.references} ${msg.messageId}` : msg.messageId,
      threadId: msg.threadId,
      mode: "reply",
    });
    setShowCompose(true);
  }, []);

  const handleForward = useCallback(async (msg: EmailMessage) => {
    const forwardAttachments: ComposeAttachment[] = [];
    if (msg.attachments && msg.attachments.length > 0) {
      for (const att of msg.attachments) {
        try {
          const res = await fetch(
            `/api/email/messages/${msg.id}/attachments/${att.attachmentId}`,
            { credentials: "include" }
          );
          if (res.ok) {
            const blob = await res.blob();
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
              reader.onload = () => resolve((reader.result as string).split(",")[1]);
              reader.readAsDataURL(blob);
            });
            forwardAttachments.push({
              filename: att.filename,
              mimeType: att.mimeType,
              data: await base64Promise,
              size: att.size,
            });
          }
        } catch {
          // skip attachment if download fails
        }
      }
    }

    setCompose({
      to: "",
      cc: "",
      subject: msg.subject.startsWith("Fwd:") ? msg.subject : `Fwd: ${msg.subject}`,
      bodyHtml: `<br/><br/><div style="border-left:2px solid #ccc;padding-left:12px;margin-left:0;color:#666">
        <p><strong>---------- Messaggio inoltrato ----------</strong></p>
        <p>Da: ${msg.from}<br/>Oggetto: ${msg.subject}<br/>Data: ${msg.date}</p>
        ${msg.bodyHtml || `<p>${msg.bodyText || msg.snippet}</p>`}
      </div>`,
      threadId: msg.threadId,
      mode: "forward",
      attachments: forwardAttachments,
    });
    setShowCompose(true);
  }, []);

  const handleAiAction = useCallback(async (action: string, msg: EmailMessage) => {
    setAiType(action);
    setAiResult(null);
    setShowAiPanel(true);

    try {
      const endpointMap: Record<string, string> = {
        summarize: "/api/email/ai/summarize",
        "extract-todos": "/api/email/ai/extract-todos",
        "suggest-replies": "/api/email/ai/suggest-replies",
      };
      const endpoint = endpointMap[action];
      if (!endpoint) return;

      const payload = { body: msg.bodyHtml || msg.bodyText || msg.snippet, subject: msg.subject };
      const res = await apiRequest("POST", endpoint, payload);
      const data = await res.json();
      setAiResult(data as AiResult);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto";
      toast({ title: "Errore AI", description: message, variant: "destructive" });
      setShowAiPanel(false);
    }
  }, [toast]);

  const handleImprove = useCallback(async () => {
    if (!compose.bodyHtml) return;
    setAiType("improve");
    setAiResult(null);
    setShowAiPanel(true);

    try {
      const res = await apiRequest("POST", "/api/email/ai/improve", {
        draft: compose.bodyHtml,
        tone: "formal",
      });
      const data = await res.json();
      setAiResult(data as AiResult);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto";
      toast({ title: "Errore AI", description: message, variant: "destructive" });
      setShowAiPanel(false);
    }
  }, [compose.bodyHtml, toast]);

  const handleRecap = useCallback(async () => {
    setAiType("recap");
    setAiResult(null);
    setShowAiPanel(true);
    setSelectedMessageId(null);

    try {
      const res = await apiRequest("POST", "/api/email/ai/recap", { days: 7 });
      const data = await res.json();
      setAiResult(data as AiResult);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore sconosciuto";
      toast({ title: "Errore AI", description: message, variant: "destructive" });
      setShowAiPanel(false);
    }
  }, [toast]);

  const messages = folder === "DRAFTS"
    ? (draftsQuery.data?.drafts || [])
    : (messagesQuery.data?.pages.flatMap(p => p.messages) || []);
  const isLoadingMessages = folder === "DRAFTS" ? draftsQuery.isLoading : messagesQuery.isLoading;
  const selectedMsg = messageDetailQuery.data;

  const linkSuggestionsQuery = useQuery<{
    suggestions: Array<{
      entityType: "order" | "offer";
      entityId: number;
      label: string;
      secondary: string | null;
      matchedText: string;
      linkedAsMessage: boolean;
      linkedAttachmentIds: string[];
    }>;
    sender: {
      email: string;
      name: string;
      status: "known_contact" | "known_customer" | "known_domain" | "unknown" | "no_email";
      customerId: number | null;
      customerName: string | null;
      contactId: number | null;
      contactName: string | null;
    };
  }>({
    queryKey: ["/api/email/messages", selectedMessageId, "link-suggestions"],
    enabled: !!selectedMessageId,
  });
  const linkSuggestions = linkSuggestionsQuery.data?.suggestions ?? [];
  const senderInfo = linkSuggestionsQuery.data?.sender;
  const showSenderUnknown = senderInfo
    && (senderInfo.status === "unknown" || senderInfo.status === "known_domain")
    && !!senderInfo.email
    // Don't warn for emails sent BY us
    && !(selectedMsg && (selectedMsg as any).labelIds?.includes?.("SENT"));

  if (!hasGmail) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto py-20 text-center space-y-4">
          <Mail className="w-16 h-16 mx-auto text-muted-foreground/40" />
          <h2 className="text-xl font-semibold" data-testid="text-no-gmail">Nessun account Gmail collegato</h2>
          <p className="text-muted-foreground">
            Per utilizzare il client email, collega il tuo account Gmail dalle impostazioni del profilo.
          </p>
          <Button onClick={() => window.location.href = "/account"} data-testid="btn-go-account">
            Vai alle impostazioni account
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <TooltipProvider delayDuration={200}>
      <div className="flex h-[calc(100vh-5rem)] overflow-hidden -mx-4 -mt-2" data-testid="email-page">
        {/* ─── ICON SIDEBAR ─── */}
        <div className="w-14 shrink-0 border-r bg-muted/20 flex flex-col items-center py-3 gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => { setCompose(EMPTY_COMPOSE); setShowCompose(true); }}
                data-testid="btn-compose"
              >
                <Plus className="w-5 h-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Componi</TooltipContent>
          </Tooltip>
          <div className="h-px w-8 bg-border my-1" />
          {([
            { id: "INBOX" as Folder, icon: Inbox, label: "Posta in arrivo", badge: unreadData?.unreadCount },
            { id: "SENT" as Folder, icon: Send, label: "Inviata", badge: undefined },
            { id: "STARRED" as Folder, icon: Star, label: "Speciali", badge: undefined },
            { id: "DRAFTS" as Folder, icon: FileEdit, label: "Bozze", badge: draftsQuery.data?.drafts?.length || undefined },
          ]).map(f => (
            <Tooltip key={f.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setFolder(f.id); setSelectedMessageId(null); setActiveSearch(""); setSearchQuery(""); }}
                  className={`relative h-10 w-10 rounded-lg flex items-center justify-center transition-colors ${
                    folder === f.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                  data-testid={`folder-${f.id.toLowerCase()}`}
                >
                  <f.icon className="w-5 h-5" />
                  {f.badge ? (
                    <Badge variant="default" className="absolute -top-0.5 -right-0.5 h-4 min-w-[1rem] px-1 text-[9px] font-bold rounded-full flex items-center justify-center">
                      {f.badge > 99 ? "99+" : f.badge}
                    </Badge>
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{f.label}</TooltipContent>
            </Tooltip>
          ))}
          <Popover onOpenChange={(open) => { if (open) setDraftFilters(filters); }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className={`relative h-10 w-10 rounded-lg flex items-center justify-center transition-colors ${
                      filtersActiveCount > 0
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                    data-testid="btn-filters"
                  >
                    <Filter className="w-5 h-5" />
                    {filtersActiveCount > 0 && (
                      <Badge variant="default" className="absolute -top-0.5 -right-0.5 h-4 min-w-[1rem] px-1 text-[9px] font-bold rounded-full flex items-center justify-center">
                        {filtersActiveCount}
                      </Badge>
                    )}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">Filtri</TooltipContent>
            </Tooltip>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={8}
              collisionPadding={8}
              onOpenAutoFocus={(e) => e.preventDefault()}
              className="w-80 max-w-[calc(100vw-5rem)] p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Filtri ricerca</span>
                {filtersActiveCount > 0 && (
                  <button
                    onClick={() => {
                      const empty = { from: "", to: "", subject: "", body: "", ai: "" };
                      setFilters(empty); setDraftFilters(empty);
                    }}
                    className="text-[10px] text-primary hover:underline"
                    data-testid="btn-clear-filters"
                  >
                    Pulisci tutto
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Mittente</label>
                <Input
                  value={draftFilters.from}
                  onChange={e => setDraftFilters(p => ({ ...p, from: e.target.value }))}
                  placeholder="es. mario@esempio.com"
                  className="h-8 text-xs"
                  data-testid="input-filter-from"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Destinatario</label>
                <Input
                  value={draftFilters.to}
                  onChange={e => setDraftFilters(p => ({ ...p, to: e.target.value }))}
                  placeholder="es. cliente@esempio.com"
                  className="h-8 text-xs"
                  data-testid="input-filter-to"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Oggetto</label>
                <Input
                  value={draftFilters.subject}
                  onChange={e => setDraftFilters(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Parole nell'oggetto"
                  className="h-8 text-xs"
                  data-testid="input-filter-subject"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Contenuto</label>
                <Input
                  value={draftFilters.body}
                  onChange={e => setDraftFilters(p => ({ ...p, body: e.target.value }))}
                  placeholder="Frase nel corpo della mail"
                  className="h-8 text-xs"
                  data-testid="input-filter-body"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-medium text-violet-600 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Filtro AI
                </label>
                <Input
                  value={draftFilters.ai}
                  onChange={e => setDraftFilters(p => ({ ...p, ai: e.target.value }))}
                  placeholder="es. fatture non pagate"
                  className="h-8 text-xs border-violet-200"
                  data-testid="input-filter-ai"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <PopoverTrigger asChild>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => { setFilters(draftFilters); setSelectedMessageId(null); }}
                    data-testid="btn-apply-filters"
                  >
                    Applica
                  </Button>
                </PopoverTrigger>
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button
                    className={`relative h-10 w-10 rounded-lg flex items-center justify-center transition-colors ${
                      selectedDate
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/50"
                    }`}
                    data-testid="btn-calendar"
                  >
                    <CalendarIcon className="w-5 h-5" />
                    {selectedDate && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />}
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">Calendario</TooltipContent>
            </Tooltip>
            <PopoverContent side="right" align="start" className="w-auto p-2">
              <div className="flex items-center justify-between px-1 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Filtra per data</span>
                {selectedDate && (
                  <button
                    onClick={() => { setSelectedDate(undefined); setCalendarMonth(new Date()); }}
                    className="text-[10px] text-primary hover:underline"
                    data-testid="btn-clear-date-filter"
                  >
                    Pulisci
                  </button>
                )}
              </div>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => {
                  setSelectedDate(d);
                  setSelectedMessageId(null);
                }}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                locale={it}
                data-testid="email-date-calendar"
              />
            </PopoverContent>
          </Popover>
          {aiStatus?.globalEnabled && (
            <>
              <div className="h-px w-8 bg-border my-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => aiToggleMutation.mutate(!aiStatus?.userPref)}
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/50"
                    data-testid="btn-ai-toggle"
                  >
                    {aiStatus?.userPref ? (
                      <ToggleRight className="w-5 h-5 text-violet-600" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">AI Assistente</TooltipContent>
              </Tooltip>
              {aiEnabled && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleRecap}
                      className="h-10 w-10 rounded-lg flex items-center justify-center text-violet-600 hover:bg-muted/50"
                      data-testid="btn-recap"
                    >
                      <BookOpen className="w-5 h-5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Recap AI</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>

        {/* ─── MESSAGE LIST (full width) ─── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="p-2 border-b flex items-center gap-1">
            <Input
              placeholder="Cerca email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="h-8 text-sm"
              data-testid="input-search"
            />
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleSearch}>
              <Search className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                if (folder === "DRAFTS") {
                  queryClient.invalidateQueries({ queryKey: ["/api/email/drafts"] });
                } else {
                  queryClient.invalidateQueries({ queryKey: ["/api/email/messages", folder] });
                }
              }}
              data-testid="btn-refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          <ScrollArea className="flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:!w-full">
            {isLoadingMessages && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoadingMessages && messages.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Nessuna email
              </div>
            )}

            {messages.map((msg, idx) => {
              const fromParsed = parseEmailAddress(msg.from);
              const isSelected = msg.id === selectedMessageId;
              const dayKey = (s: string) => {
                const dt = new Date(s);
                if (isNaN(dt.getTime())) return "";
                return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
              };
              const prev = idx > 0 ? messages[idx - 1] : null;
              const dayChanged = !prev || dayKey(prev.date) !== dayKey(msg.date);
              const dayLabel = (() => {
                const d = new Date(msg.date);
                if (isNaN(d.getTime())) return "";
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const md = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                const diff = Math.round((today.getTime() - md.getTime()) / 86400000);
                if (diff === 0) return "Oggi";
                if (diff === 1) return "Ieri";
                return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: now.getFullYear() === d.getFullYear() ? undefined : "numeric" });
              })();
              return (
                <div key={msg.id}>
                  {dayChanged && (
                    <div className="flex items-center gap-2 px-3 py-1.5 border-y-2 border-border bg-[#3aa0abb8]" data-testid={`day-divider-${dayKey(msg.date)}`}>
                      <span className="uppercase tracking-wider font-extrabold text-[12px] text-[#ffffff]">{dayLabel}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (folder === "DRAFTS" && msg.draftId) {
                        const draftAttachments: ComposeAttachment[] = (msg.attachments || []).map((a) => ({
                          filename: a.filename,
                          mimeType: a.mimeType,
                          data: "",
                          size: a.size || 0,
                          savedInDraft: true,
                        }));
                        setCompose({
                          to: msg.to, cc: msg.cc, subject: msg.subject,
                          bodyHtml: msg.bodyHtml || msg.bodyText || "", draftId: msg.draftId, mode: "new",
                          attachments: draftAttachments,
                        });
                        setShowCompose(true);
                      } else {
                        setSelectedMessageId(msg.id);
                        setShowAiPanel(false);
                      }
                    }}
                    className={`w-full text-left px-3 py-2 border-b transition-colors h-[76px] overflow-hidden ${
                      isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30"
                    } ${msg.isUnread ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                    data-testid={`msg-item-${msg.id}`}
                  >
                    <div className="flex items-start gap-2 h-full w-full min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        msg.isUnread ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {getInitials(fromParsed.name)}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className={`text-xs truncate flex-1 min-w-0 ${msg.isUnread ? "font-semibold" : ""}`}>
                            {folder === "SENT" ? parseEmailAddress(msg.to).name : fromParsed.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0 text-right leading-tight whitespace-nowrap">
                            <span className="block font-semibold text-[#000000]">{formatDate(msg.date)}</span>
                            <span className="block opacity-70 text-[#001978] font-semibold">{formatTime(msg.date)}</span>
                          </span>
                        </div>
                        <p className={`text-xs truncate ${msg.isUnread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                          {msg.subject}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">{msg.snippet}</p>
                      </div>
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        {msg.isStarred && (
                          <Star
                            className="w-3.5 h-3.5 text-amber-500 fill-amber-500"
                            data-testid={`icon-msg-starred-${msg.id}`}
                          />
                        )}
                        {msg.hasAttachments && (
                          <Paperclip
                            className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400"
                            data-testid={`icon-msg-attachment-${msg.id}`}
                          >
                            <title>Contiene allegati</title>
                          </Paperclip>
                        )}
                        {msg.hasAlerts && (
                          <AlertTriangle
                            className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400"
                            data-testid={`icon-msg-alerts-${msg.id}`}
                          >
                            <title>Possibili collegamenti o dati CRM mancanti</title>
                          </AlertTriangle>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}

            {folder !== "DRAFTS" && messagesQuery.hasNextPage && (
              <div
                ref={loadMoreRef}
                className="flex items-center justify-center py-4 text-xs text-muted-foreground"
                data-testid="load-more-sentinel"
              >
                {messagesQuery.isFetchingNextPage ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Carica altre…</span>
                )}
              </div>
            )}
            {folder !== "DRAFTS"
              && !messagesQuery.hasNextPage
              && messages.length > 0
              && !messagesQuery.isLoading && (
              <div className="text-center py-4 text-[11px] text-muted-foreground">
                Fine della lista
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
      </TooltipProvider>
      {/* AI PANEL DIALOG (when no message selected) */}
      <Dialog open={showAiPanel && !selectedMessageId} onOpenChange={(open) => { if (!open) setShowAiPanel(false); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="sr-only"><DialogTitle>AI</DialogTitle></DialogHeader>
          <AiResultPanel
            type={aiType}
            result={aiResult}
            onClose={() => setShowAiPanel(false)}
            onApplyReply={(html: string) => {
              setCompose(prev => ({ ...prev, bodyHtml: html }));
              setShowCompose(true);
              setShowAiPanel(false);
            }}
          />
        </DialogContent>
      </Dialog>
      {/* ─── MESSAGE DETAIL DIALOG ─── */}
      <Dialog
        open={!!selectedMessageId}
        onOpenChange={(open) => { if (!open) { setSelectedMessageId(null); setShowAiPanel(false); } }}
      >
        <DialogContent className="max-w-4xl w-screen h-[100dvh] sm:w-[95vw] sm:h-auto sm:max-h-[90vh] flex flex-col p-0 overflow-hidden rounded-none sm:rounded-lg">
          <DialogHeader className="sr-only"><DialogTitle>Dettaglio email</DialogTitle></DialogHeader>
          {messageDetailQuery.isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          {selectedMsg && (
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                  {/* Header */}
                  <div className="px-3 sm:px-4 py-2 sm:py-3 border-b space-y-2">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-sm sm:text-base font-semibold pr-8 sm:pr-0 line-clamp-2 sm:truncate" data-testid="text-msg-subject">
                          {selectedMsg.subject}
                        </h2>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-muted-foreground mt-1">
                          <span className="font-medium text-foreground truncate max-w-[60%] sm:max-w-none">{parseEmailAddress(selectedMsg.from).name}</span>
                          <span className="truncate max-w-full text-[10px] sm:text-xs">&lt;{parseEmailAddress(selectedMsg.from).email}&gt;</span>
                          <span className="hidden sm:inline">—</span>
                          <span className="whitespace-nowrap">{formatDate(selectedMsg.date)}</span>
                        </div>
                        {selectedMsg.to && (
                          <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">
                            A: {selectedMsg.to}
                            {selectedMsg.cc ? ` | CC: ${selectedMsg.cc}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 mr-7 sm:mr-8">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => starMutation.mutate({ messageId: selectedMsg.id, starred: !selectedMsg.isStarred })}
                          data-testid="btn-star"
                        >
                          {selectedMsg.isStarred
                            ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                            : <StarOff className="w-4 h-4" />
                          }
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => trashMutation.mutate(selectedMsg.id)}
                          data-testid="btn-trash"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="btn-more-actions">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => markReadMutation.mutate({ messageId: selectedMsg.id, read: false })}>
                              <Mail className="w-4 h-4 mr-2" /> Segna come non letto
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 sm:pl-10 overflow-x-auto scrollbar-thin -mx-3 px-3 sm:-mx-0 sm:px-0">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => handleReply(selectedMsg)} data-testid="btn-reply">
                        <Reply className="w-3.5 h-3.5" /> Rispondi
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => handleForward(selectedMsg)} data-testid="btn-forward">
                        <Forward className="w-3.5 h-3.5" /> Inoltra
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => setLinkDialog({
                          messageId: selectedMsg.id,
                          filename: selectedMsg.subject || "(senza oggetto)",
                          mode: "message",
                        })}
                        data-testid="btn-link-email"
                        title="Collega l'intera email a Cliente / Contatto / Offerta / Commessa"
                      >
                        <Link2 className="w-3.5 h-3.5" /> Collega email
                      </Button>
                      {aiEnabled && (
                        <>
                          <Separator orientation="vertical" className="h-5 mx-1" />
                          <Button
                            variant="outline" size="sm"
                            className="h-7 text-xs gap-1.5 border-violet-200 text-violet-600 hover:bg-violet-50"
                            onClick={() => handleAiAction("summarize", selectedMsg)}
                            data-testid="btn-ai-summarize"
                          >
                            <Sparkles className="w-3.5 h-3.5" /> Riassumi
                          </Button>
                          <Button
                            variant="outline" size="sm"
                            className="h-7 text-xs gap-1.5 border-violet-200 text-violet-600 hover:bg-violet-50"
                            onClick={() => handleAiAction("extract-todos", selectedMsg)}
                            data-testid="btn-ai-todos"
                          >
                            <ListTodo className="w-3.5 h-3.5" /> To-Do
                          </Button>
                          <Button
                            variant="outline" size="sm"
                            className="h-7 text-xs gap-1.5 border-violet-200 text-violet-600 hover:bg-violet-50"
                            onClick={() => handleAiAction("suggest-replies", selectedMsg)}
                            data-testid="btn-ai-suggest"
                          >
                            <MessageSquareText className="w-3.5 h-3.5" /> Suggerisci Risposte
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Body + AI Panel side by side */}
                  <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
                    <ScrollArea className={`flex-1 ${showAiPanel ? "sm:w-1/2" : ""}`}>
                      <div className="p-3 sm:p-4 break-words">
                        {showSenderUnknown && senderInfo && (
                          <div
                            className="mb-4 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 p-3"
                            data-testid="card-sender-unknown"
                          >
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-1">
                                  {senderInfo.status === "known_domain"
                                    ? "Mittente non riconosciuto"
                                    : "Mittente non presente nel CRM"}
                                </div>
                                <p className="text-xs text-orange-800/90 dark:text-orange-200/90 mb-2">
                                  {senderInfo.status === "known_domain" && senderInfo.customerName ? (
                                    <>
                                      L'indirizzo <span className="font-mono">{senderInfo.email}</span> non è registrato,
                                      ma il dominio appartiene a <span className="font-medium">{senderInfo.customerName}</span>.
                                      Vuoi aggiungerlo come nuovo contatto?
                                    </>
                                  ) : (
                                    <>
                                      L'indirizzo <span className="font-mono">{senderInfo.email}</span>
                                      {senderInfo.name ? <> ({senderInfo.name})</> : null} non risulta tra i clienti
                                      o i contatti del CRM. Vuoi aggiungerlo?
                                    </>
                                  )}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1.5"
                                    onClick={() => {
                                      const params = new URLSearchParams();
                                      if (senderInfo.email) params.set("email", senderInfo.email);
                                      if (senderInfo.name) params.set("name", senderInfo.name);
                                      if (senderInfo.status === "known_domain" && senderInfo.customerId) {
                                        params.set("customerId", String(senderInfo.customerId));
                                      }
                                      const phone = extractPhoneFromEmail(selectedMsg);
                                      if (phone) params.set("phone", phone);
                                      navigate(`/crm/contacts/new?${params.toString()}`);
                                    }}
                                    data-testid="btn-create-contact-from-sender"
                                  >
                                    <User className="w-3 h-3" /> Aggiungi contatto
                                  </Button>
                                  {senderInfo.status !== "known_domain" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs gap-1.5"
                                      onClick={() => {
                                        const params = new URLSearchParams();
                                        if (senderInfo.email) params.set("email", senderInfo.email);
                                        if (senderInfo.name) params.set("name", senderInfo.name);
                                        const phone = extractPhoneFromEmail(selectedMsg);
                                        if (phone) params.set("phone", phone);
                                        const web = extractWebsiteFromSender(senderInfo.email, selectedMsg);
                                        if (web) params.set("webSite", web);
                                        navigate(`/crm/companies/new?${params.toString()}`);
                                      }}
                                      data-testid="btn-create-company-from-sender"
                                    >
                                      <Building2 className="w-3 h-3" /> Aggiungi azienda
                                    </Button>
                                  )}
                                  {senderInfo.status === "known_domain" && senderInfo.customerId && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs gap-1.5"
                                      onClick={() => navigate(`/crm/companies/${senderInfo.customerId}`)}
                                      data-testid="btn-open-customer-from-sender"
                                    >
                                      <ExternalLink className="w-3 h-3" /> Apri {senderInfo.customerName}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        {linkSuggestions.length > 0 && (
                          <div
                            className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-3"
                            data-testid="card-link-suggestions"
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                              <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                                Possibili collegamenti rilevati
                              </span>
                            </div>
                            <p className="text-xs text-amber-800/80 dark:text-amber-200/80 mb-3">
                              Nel testo dell'email sono stati trovati riferimenti a entità esistenti.
                              Collega l'email o gli allegati con un click.
                            </p>
                            <div className="space-y-2">
                              {linkSuggestions.map(s => (
                                <div
                                  key={`${s.entityType}-${s.entityId}`}
                                  className="rounded-md border bg-background p-2.5"
                                  data-testid={`suggestion-${s.entityType}-${s.entityId}`}
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    {s.entityType === "order"
                                      ? <Package className="w-4 h-4 text-indigo-600 shrink-0" />
                                      : <FileText className="w-4 h-4 text-blue-600 shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">
                                        {s.entityType === "order" ? "Commessa" : "Offerta"} {s.label}
                                      </div>
                                      {s.secondary && (
                                        <div className="text-[11px] text-muted-foreground truncate">
                                          {s.secondary}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {s.linkedAsMessage ? (
                                      <span
                                        className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                                        data-testid={`badge-suggest-linked-email-${s.entityType}-${s.entityId}`}
                                      >
                                        <Check className="w-3 h-3" /> Email collegata
                                      </span>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs gap-1.5"
                                        disabled={linkSuggestionMutation.isPending}
                                        onClick={() => linkSuggestionMutation.mutate({
                                          messageId: selectedMsg.id,
                                          mode: "message",
                                          entityType: s.entityType,
                                          entityId: s.entityId,
                                          label: s.label,
                                        })}
                                        data-testid={`btn-suggest-link-email-${s.entityType}-${s.entityId}`}
                                        title={`Collega email a ${s.entityType === "order" ? "Commessa" : "Offerta"} ${s.label}`}
                                      >
                                        <Mail className="w-3 h-3" /> Collega email
                                      </Button>
                                    )}
                                    {(selectedMsg.attachments ?? []).map(att => (
                                      s.linkedAttachmentIds.includes(att.attachmentId) ? (
                                        <span
                                          key={att.attachmentId}
                                          className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                                          data-testid={`badge-suggest-linked-att-${s.entityType}-${s.entityId}-${att.filename}`}
                                          title={`"${att.filename}" già collegato`}
                                        >
                                          <Check className="w-3 h-3" />
                                          <span className="max-w-[140px] truncate">{att.filename}</span>
                                        </span>
                                      ) : (
                                        <Button
                                          key={att.attachmentId}
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs gap-1.5"
                                          disabled={linkSuggestionMutation.isPending}
                                          onClick={() => linkSuggestionMutation.mutate({
                                            messageId: selectedMsg.id,
                                            attachmentId: att.attachmentId,
                                            mode: "attachment",
                                            entityType: s.entityType,
                                            entityId: s.entityId,
                                            label: s.label,
                                          })}
                                          data-testid={`btn-suggest-link-att-${s.entityType}-${s.entityId}-${att.filename}`}
                                          title={`Collega "${att.filename}" a ${s.entityType === "order" ? "Commessa" : "Offerta"} ${s.label}`}
                                        >
                                          <Paperclip className="w-3 h-3" />
                                          <span className="max-w-[140px] truncate">{att.filename}</span>
                                        </Button>
                                      )
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {selectedMsg.bodyHtml ? (
                          <div
                            className="prose prose-sm max-w-none dark:prose-invert email-body-html"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedMsg.bodyHtml) }}
                            data-testid="msg-body"
                          />
                        ) : (
                          <pre className="text-sm whitespace-pre-wrap font-sans" data-testid="msg-body">
                            {selectedMsg.bodyText || selectedMsg.snippet}
                          </pre>
                        )}

                        {selectedMsg.attachments && selectedMsg.attachments.length > 0 && (
                          <div className="mt-4 space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Allegati ({selectedMsg.attachments.length})
                            </p>
                            <div className="flex flex-col gap-2">
                              {selectedMsg.attachments.map(att => {
                                const ext = getDisplayExtension(att.filename, att.mimeType);
                                return (
                                <div
                                  key={att.attachmentId}
                                  className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/30 hover:bg-muted/60 transition-colors text-sm w-full"
                                  data-testid={`attachment-${att.filename}`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => setPreviewAttachment({
                                      messageId: selectedMsg.id,
                                      attachmentId: att.attachmentId,
                                      filename: att.filename,
                                      mimeType: att.mimeType,
                                      size: att.size,
                                    })}
                                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                    data-testid={`button-preview-attachment-${att.filename}`}
                                    title="Anteprima"
                                  >
                                    <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-medium break-all" data-testid={`text-attachment-name-${att.filename}`}>
                                      {att.filename}
                                    </span>
                                    {ext && (
                                      <span
                                        className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0"
                                        data-testid={`badge-attachment-ext-${att.filename}`}
                                      >
                                        {ext}
                                      </span>
                                    )}
                                    <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(att.size)}</span>
                                    <Eye className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-auto" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setLinkDialog({
                                      messageId: selectedMsg.id,
                                      attachmentId: att.attachmentId,
                                      filename: att.filename,
                                      mode: "attachment",
                                    })}
                                    className="text-muted-foreground hover:text-foreground"
                                    data-testid={`button-link-attachment-${att.filename}`}
                                    title="Collega a entità"
                                  >
                                    <Link2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      downloadAttachment(selectedMsg.id, att.attachmentId, att.filename)
                                        .catch(err => toast({
                                          title: "Download fallito",
                                          description: String(err?.message ?? err),
                                          variant: "destructive",
                                        }));
                                    }}
                                    className="text-muted-foreground hover:text-foreground"
                                    data-testid={`button-download-attachment-${att.filename}`}
                                    title="Scarica"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>

                    {showAiPanel && (
                      <div className="w-1/2 border-l">
                        <AiResultPanel
                          type={aiType}
                          result={aiResult}
                          onClose={() => setShowAiPanel(false)}
                          onApplyReply={(html: string) => {
                            handleReply(selectedMsg);
                            setTimeout(() => {
                              setCompose(prev => ({
                                ...prev,
                                bodyHtml: html + prev.bodyHtml,
                              }));
                            }, 100);
                            setShowAiPanel(false);
                          }}
                          onApplyImproved={(html: string) => {
                            setCompose(prev => ({ ...prev, bodyHtml: html }));
                            setShowAiPanel(false);
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
          )}
        </DialogContent>
      </Dialog>
      {/* ─── COMPOSE DIALOG ─── */}
      <Dialog open={showCompose} onOpenChange={(open) => {
        if (!open && (compose.to || compose.subject || compose.bodyHtml)) {
          saveDraftMutation.mutate();
        }
        setShowCompose(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              {compose.mode === "reply" ? "Rispondi" : compose.mode === "forward" ? "Inoltra" : "Nuovo messaggio"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 flex-1 overflow-y-auto">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Destinatario</label>
              <Input
                value={compose.to}
                onChange={e => setCompose(prev => ({ ...prev, to: e.target.value }))}
                placeholder="email@esempio.com"
                data-testid="compose-to"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">CC</label>
              <Input
                value={compose.cc}
                onChange={e => setCompose(prev => ({ ...prev, cc: e.target.value }))}
                placeholder="cc@esempio.com (opzionale)"
                data-testid="compose-cc"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Oggetto</label>
              <Input
                value={compose.subject}
                onChange={e => setCompose(prev => ({ ...prev, subject: e.target.value }))}
                data-testid="compose-subject"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Messaggio</label>
                {aiEnabled && (
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 text-[10px] gap-1 text-violet-600"
                    onClick={handleImprove}
                    disabled={!compose.bodyHtml}
                    data-testid="btn-improve"
                  >
                    <Wand2 className="w-3 h-3" /> Migliora con AI
                  </Button>
                )}
              </div>
              <div
                ref={bodyEditorRef}
                contentEditable
                className="min-h-[200px] max-h-[400px] overflow-y-auto rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring prose prose-sm max-w-none dark:prose-invert"
                onInput={(e) => {
                  const html = (e.target as HTMLDivElement).innerHTML;
                  setCompose(prev => ({ ...prev, bodyHtml: html }));
                }}
                data-testid="compose-body"
              />
            </div>
          </div>

          {(compose.attachments?.length ?? 0) > 0 && (
            <div className="space-y-1 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Allegati ({compose.attachments!.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {compose.attachments!.map((att, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded border bg-muted/30 text-xs">
                    <Paperclip className="w-3 h-3 text-muted-foreground" />
                    <span className="max-w-[150px] truncate">{att.filename}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {att.savedInDraft ? "(salvato)" : formatFileSize(att.size)}
                    </span>
                    {!att.savedInDraft && (
                      <button
                        onClick={() => removeAttachment(i)}
                        className="ml-1 text-red-400 hover:text-red-600"
                        data-testid={`btn-remove-attachment-${i}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileAttach}
            data-testid="input-file-attach"
          />

          <div className="flex items-center gap-2 pt-3 border-t">
            <Button
              onClick={() => sendMutation.mutate()}
              disabled={!compose.to || !compose.subject || sendMutation.isPending}
              className="gap-2"
              data-testid="btn-send"
            >
              {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Invia
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5"
              data-testid="btn-attach-file"
            >
              <Paperclip className="w-3.5 h-3.5" /> Allega
            </Button>
            <Button
              variant="outline"
              onClick={() => saveDraftMutation.mutate()}
              disabled={saveDraftMutation.isPending}
              className="gap-2"
              data-testid="btn-save-draft"
            >
              <FileEdit className="w-4 h-4" /> Salva bozza
            </Button>
            {compose.draftId && (
              <Button
                variant="ghost" size="sm"
                className="gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => {
                  deleteDraftMutation.mutate(compose.draftId!);
                  setShowCompose(false);
                  setCompose(EMPTY_COMPOSE);
                }}
                data-testid="btn-delete-draft"
              >
                <Trash2 className="w-3.5 h-3.5" /> Elimina bozza
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="ghost"
              onClick={() => { setShowCompose(false); setCompose(EMPTY_COMPOSE); }}
              data-testid="btn-discard"
            >
              Annulla
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* AI Improve overlay for compose */}
      {showAiPanel && !selectedMessageId && showCompose && aiType === "improve" && (
        <Dialog open onOpenChange={() => setShowAiPanel(false)}>
          <DialogContent className="max-w-lg">
            <AiResultPanel
              type={aiType}
              result={aiResult}
              onClose={() => setShowAiPanel(false)}
              onApplyImproved={(html: string) => {
                setCompose(prev => ({ ...prev, bodyHtml: html }));
                setShowAiPanel(false);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      <Dialog open={!!previewAttachment} onOpenChange={(open) => { if (!open) setPreviewAttachment(null); }}>
        <DialogContent
          className="p-0 gap-0 max-w-[95vw]"
        >
          {previewAttachment && (() => {
            const baseUrl = `/api/email/messages/${previewAttachment.messageId}/attachments/${previewAttachment.attachmentId}`;
            const isPdf = previewAttachment.mimeType === "application/pdf"
              || /\.pdf$/i.test(previewAttachment.filename);
            const isImage = previewAttachment.mimeType.startsWith("image/");
            const previewUrl = previewBlobUrl ?? baseUrl;
            return (
              <>
                <DialogHeader className="px-6 py-4 border-b">
                  <DialogTitle className="flex items-center gap-2 pr-8 truncate" data-testid="text-preview-filename">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">{previewAttachment.filename}</span>
                    <span className="text-xs font-normal text-muted-foreground shrink-0">
                      {formatFileSize(previewAttachment.size)}
                    </span>
                  </DialogTitle>
                </DialogHeader>
                <div className="px-6 py-4 bg-muted/20">
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-24">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : previewError ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                      <AlertTriangle className="w-12 h-12 text-destructive" />
                      <p className="text-sm text-muted-foreground">{previewError}</p>
                    </div>
                  ) : isPdf && previewPdfData ? (
                    <PdfViewer
                      data={previewPdfData}
                      title={previewAttachment.filename}
                      testId="pdf-attachment-preview"
                      height="80vh"
                    />
                  ) : isImage ? (
                    <div className="flex items-center justify-center" style={{ maxHeight: "85vh" }}>
                      <img
                        src={previewUrl}
                        alt={previewAttachment.filename}
                        className="max-w-full max-h-[85vh] object-contain"
                        data-testid="img-attachment-preview"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                      <FileText className="w-12 h-12 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Anteprima non disponibile per questo tipo di file.
                      </p>
                      <p className="text-xs text-muted-foreground">{previewAttachment.mimeType || "tipo sconosciuto"}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2 px-6 py-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      let url: string | null = null;
                      let revoke = false;
                      if (previewPdfData) {
                        url = URL.createObjectURL(
                          new Blob([previewPdfData], { type: "application/pdf" })
                        );
                        revoke = true;
                      } else if (previewBlobUrl) {
                        url = previewBlobUrl;
                      }
                      if (!url) return;
                      const win = window.open(url, "_blank", "noopener,noreferrer");
                      if (!win) {
                        if (revoke && url) URL.revokeObjectURL(url);
                        toast({
                          title: "Popup bloccato",
                          description: "Consenti i popup per questo sito.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (revoke) setTimeout(() => URL.revokeObjectURL(url!), 60000);
                    }}
                    disabled={!previewPdfData && !previewBlobUrl}
                    data-testid="link-open-attachment-newtab"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Apri in nuova scheda
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      downloadAttachment(previewAttachment.messageId, previewAttachment.attachmentId, previewAttachment.filename)
                        .catch(err => toast({
                          title: "Download fallito",
                          description: String(err?.message ?? err),
                          variant: "destructive",
                        }));
                    }}
                    data-testid="button-download-attachment-dialog"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Scarica
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewAttachment(null)}
                    data-testid="button-close-attachment-preview"
                  >
                    Chiudi
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      {linkDialog && (
        <LinkAttachmentDialog
          open={!!linkDialog}
          onOpenChange={(o) => { if (!o) setLinkDialog(null); }}
          messageId={linkDialog.messageId}
          attachmentId={linkDialog.attachmentId}
          filename={linkDialog.filename}
          mode={linkDialog.mode}
        />
      )}
    </Layout>
  );
}

function AiResultPanel({ type, result, onClose, onApplyReply, onApplyImproved }: {
  type: string;
  result: AiResult | null;
  onClose: () => void;
  onApplyReply?: (html: string) => void;
  onApplyImproved?: (html: string) => void;
}) {
  const labels: Record<string, string> = {
    summarize: "Riassunto AI",
    "extract-todos": "To-Do Estratti",
    "suggest-replies": "Risposte Suggerite",
    improve: "Testo Migliorato",
    recap: "Recap Email",
  };

  const iconMap: Record<string, typeof Sparkles> = {
    summarize: Sparkles,
    "extract-todos": ListTodo,
    "suggest-replies": MessageSquareText,
    improve: Wand2,
    recap: BookOpen,
  };

  const Icon = iconMap[type] || Sparkles;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center">
              <Icon className="w-4 h-4 text-violet-600" />
            </div>
            <h3 className="text-sm font-semibold">{labels[type] || "AI"}</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {!result && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
            <span className="ml-2 text-sm text-muted-foreground">Analisi in corso...</span>
          </div>
        )}

        {result && type === "summarize" && "summary" in result && (() => {
          const r = result as AiSummarizeResult;
          return (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">{r.summary}</p>
              {r.keyPoints?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Punti chiave</p>
                  <ul className="space-y-1">
                    {r.keyPoints.map((p, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 mt-0.5 text-green-500 shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs">
                {r.actionRequired && (
                  <Badge variant="destructive" className="text-[10px]">
                    <AlertTriangle className="w-3 h-3 mr-1" /> Azione richiesta
                  </Badge>
                )}
                <Badge variant="outline" className="text-[10px]">
                  Sentimento: {r.sentiment === "positive" ? "Positivo" : r.sentiment === "negative" ? "Negativo" : "Neutro"}
                </Badge>
              </div>
            </div>
          );
        })()}

        {result && type === "extract-todos" && "todos" in result && (() => {
          const r = result as AiTodosResult;
          return (
            <div className="space-y-2">
              {r.todos.length === 0 && (
                <p className="text-sm text-muted-foreground">Nessuna azione trovata in questa email.</p>
              )}
              {r.todos.map((todo, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg border bg-muted/20">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    todo.priority === "high" ? "bg-red-500" :
                    todo.priority === "medium" ? "bg-amber-500" : "bg-green-500"
                  }`} />
                  <div>
                    <p className="text-sm">{todo.text}</p>
                    {todo.deadline && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Scadenza: {todo.deadline}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}

        {result && type === "suggest-replies" && "replies" in result && (() => {
          const r = result as AiSuggestRepliesResult;
          return (
            <div className="space-y-3">
              {r.replies.map((reply, i) => (
                <div key={i} className="p-3 rounded-lg border bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">{reply.label}</Badge>
                    <Button
                      variant="ghost" size="sm" className="h-6 text-[10px] gap-1"
                      onClick={() => onApplyReply?.(reply.bodyHtml)}
                      data-testid={`btn-use-reply-${i}`}
                    >
                      <Check className="w-3 h-3" /> Usa
                    </Button>
                  </div>
                  <div
                    className="text-sm prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(reply.bodyHtml) }}
                  />
                </div>
              ))}
            </div>
          );
        })()}

        {result && type === "improve" && "improved" in result && (() => {
          const r = result as AiImproveResult;
          return (
            <div className="space-y-3">
              <div
                className="text-sm prose prose-sm max-w-none dark:prose-invert p-3 rounded-lg border bg-muted/20"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(r.improved) }}
              />
              <Button
                size="sm" className="gap-1"
                onClick={() => onApplyImproved?.(r.improved)}
                data-testid="btn-apply-improved"
              >
                <Check className="w-3.5 h-3.5" /> Applica
              </Button>
            </div>
          );
        })()}

        {result && type === "recap" && "recap" in result && (() => {
          const r = result as AiRecapResult;
          return (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed">{r.recap}</p>
              {r.highlights?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Highlights</p>
                  <ul className="space-y-1">
                    {r.highlights.map((h, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <Star className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {r.pendingActions?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Azioni pendenti</p>
                  <ul className="space-y-1">
                    {r.pendingActions.map((a, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-orange-500 shrink-0" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </ScrollArea>
  );
}
