import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Loader2, Share2, Search, FileText, Inbox, Paperclip, MessageSquare, Trash2,
} from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Participant {
  participantType: string;
  participantId: number;
  name: string;
}

interface LastMessage {
  id: number;
  senderType: string;
  senderId: number;
  body: string | null;
  sharedOfferId: number | null;
  sharedEnquiryId: number | null;
  createdAt: string;
}

interface Conversation {
  id: number;
  subject: string;
  createdByType: string;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  participants: Participant[];
  lastMessage: LastMessage | null;
  unreadCount: number;
}

function shareTypeBadge(msg: LastMessage | null) {
  if (!msg) return null;
  if (msg.sharedOfferId) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-violet-300 text-violet-700 bg-violet-50">
        <FileText className="w-3 h-3" /> Offer
      </Badge>
    );
  }
  if (msg.sharedEnquiryId) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-orange-300 text-orange-700 bg-orange-50">
        <Inbox className="w-3 h-3" /> Enquiry
      </Badge>
    );
  }
  if (msg.body && !msg.sharedOfferId && !msg.sharedEnquiryId) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 border-gray-300 text-gray-600 bg-gray-50">
        <MessageSquare className="w-3 h-3" /> Message
      </Badge>
    );
  }
  return null;
}

function otherParticipants(participants: Participant[], user: any): string {
  return participants
    .filter(p => !(p.participantType === (user?.type === "dealer" ? "dealer" : "salesman") && p.participantId === Number(user?.id)))
    .map(p => p.name)
    .join(", ") || "—";
}

export default function ShareHub() {
  const { user, isDealer } = useAuth();
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/share-hub/conversations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/share-hub/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/share-hub/unread-count"] });
      setConfirmDeleteId(null);
      toast({ title: "Conversazione eliminata" });
    },
  });

  const { data: conversations = [], isLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/share-hub/conversations"],
    staleTime: 0,
    refetchInterval: 30000,
  });

  const filtered = conversations.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.subject.toLowerCase().includes(q) ||
      c.participants.some(p => p.name.toLowerCase().includes(q)) ||
      (c.lastMessage?.body || "").toLowerCase().includes(q)
    );
  });

  const basePath = isDealer ? "/dealer/share-hub" : "/share-hub";

  const content = (
    <div className="space-y-6">
      <PageHeader
        title="Share Hub"
        subtitle="Shared items and conversations"
        actions={
          <Link href={`${basePath}/new`}>
            <button
              data-testid="button-new-share"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              New Share
            </button>
          </Link>
        }
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-search-shares"
            placeholder="Search conversations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Share2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No shared items yet</p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Preview</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[60px]">Unread</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(conv => {
                const from = otherParticipants(conv.participants, user);
                const preview = conv.lastMessage?.body
                  ? conv.lastMessage.body.length > 60
                    ? conv.lastMessage.body.slice(0, 60) + "…"
                    : conv.lastMessage.body
                  : "—";
                const dateStr = conv.lastMessage
                  ? format(new Date(conv.lastMessage.createdAt), "dd/MM/yyyy HH:mm")
                  : format(new Date(conv.createdAt), "dd/MM/yyyy HH:mm");

                return (
                  <TableRow
                    key={conv.id}
                    data-testid={`row-conversation-${conv.id}`}
                    className={`cursor-pointer hover:bg-muted/50 transition-colors ${conv.unreadCount > 0 ? "bg-blue-50/40 font-medium" : ""}`}
                  >
                    <TableCell>
                      <Link href={`${basePath}/${conv.id}`}>
                        <span className="hover:underline text-sm" data-testid={`link-conversation-${conv.id}`}>
                          {conv.subject}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{from}</TableCell>
                    <TableCell>{shareTypeBadge(conv.lastMessage)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{preview}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{dateStr}</TableCell>
                    <TableCell>
                      {conv.unreadCount > 0 && (
                        <Badge className="bg-blue-500 text-white text-[10px] px-1.5">
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {confirmDeleteId === conv.id ? (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2 text-xs"
                            disabled={deleteMutation.isPending}
                            onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(conv.id); }}
                            data-testid={`btn-confirm-delete-conversation-${conv.id}`}
                          >
                            {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Sì"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                            data-testid={`btn-cancel-delete-conversation-${conv.id}`}
                          >
                            No
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(conv.id); }}
                          data-testid={`btn-delete-conversation-${conv.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );

  if (isDealer) {
    return <DealerLayout>{content}</DealerLayout>;
  }
  return <Layout>{content}</Layout>;
}
