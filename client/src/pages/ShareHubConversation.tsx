import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { DealerLayout } from "@/components/DealerLayout";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ArrowLeft, Send, Paperclip, FileText, Inbox, Download, X, MessageSquare, Copy, UserCheck,
} from "lucide-react";
import { Link, useRoute } from "wouter";

import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

interface Participant {
  participantType: string;
  participantId: number;
  name: string;
}

interface Attachment {
  id: number;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
}

interface Message {
  id: number;
  senderType: string;
  senderId: number;
  senderName: string;
  body: string | null;
  sharedOfferId: number | null;
  sharedEnquiryId: number | null;
  createdAt: string;
  attachments: Attachment[];
}

interface ConversationDetail {
  id: number;
  subject: string;
  createdByType: string;
  createdById: number;
  createdAt: string;
  participants: Participant[];
  messages: Message[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isMe(user: any, senderType: string, senderId: number): boolean {
  const myType = user?.type === "dealer" ? "dealer" : "salesman";
  return myType === senderType && Number(user?.id) === senderId;
}

export default function ShareHubConversation() {
  const { user, isDealer } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [, params] = useRoute("/share-hub/:id");
  const [, dealerParams] = useRoute("/dealer/share-hub/:id");
  const conversationId = params?.id || dealerParams?.id;
  const basePath = isDealer ? "/dealer/share-hub" : "/share-hub";

  const [savedOfferIds, setSavedOfferIds] = useState<Set<number>>(new Set());
  const [savingOfferId, setSavingOfferId] = useState<number | null>(null);
  const [claimedEnquiryIds, setClaimedEnquiryIds] = useState<Set<number>>(new Set());
  const [claimingEnquiryId, setClaimingEnquiryId] = useState<number | null>(null);

  const [replyBody, setReplyBody] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: conversation, isLoading, isError, error } = useQuery<ConversationDetail>({
    queryKey: ["/api/share-hub/conversations", conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/share-hub/conversations/${conversationId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load conversation");
      return res.json();
    },
    enabled: !!conversationId,
    staleTime: 0,
    refetchInterval: 15000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages?.length]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      if (replyBody.trim()) formData.append("body", replyBody.trim());
      if (replyFile) formData.append("file", replyFile);

      const res = await fetch(`/api/share-hub/conversations/${conversationId}/messages`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to send reply");
      }
      return res.json();
    },
    onSuccess: () => {
      setReplyBody("");
      setReplyFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/share-hub/conversations", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/share-hub/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/share-hub/unread-count"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    if (sendMutation.isPending) return;
    if (!replyBody.trim() && !replyFile) return;
    sendMutation.mutate();
  };

  const handleSaveCopy = async (offerId: number) => {
    setSavingOfferId(offerId);
    try {
      const res = await fetch(`/api/offers/${offerId}/save-copy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to save offer");
      }
      setSavedOfferIds(prev => new Set(prev).add(offerId));
      queryClient.invalidateQueries({ queryKey: ["/api/offers"] });
      toast({ title: "Offer saved", description: "A copy has been added to your offers." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingOfferId(null);
    }
  };

  const handleClaimEnquiry = async (enquiryId: number) => {
    setClaimingEnquiryId(enquiryId);
    try {
      const res = await fetch(`/api/enquiries/${enquiryId}/claim`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to claim enquiry");
      }
      setClaimedEnquiryIds(prev => new Set(prev).add(enquiryId));
      queryClient.invalidateQueries({ queryKey: ["/api/enquiries"] });
      toast({ title: "Enquiry claimed", description: "This enquiry is now assigned to you." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setClaimingEnquiryId(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const otherNames = conversation?.participants
    .filter(p => !isMe(user, p.participantType, p.participantId))
    .map(p => p.name)
    .join(", ") || "";

  const content = (
    <div className="space-y-4">
      <PageHeader
        title={conversation?.subject || "Conversation"}
        subtitle={otherNames ? `with ${otherNames}` : undefined}
      />

      {isLoading && (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && isError && (
        <div className="text-center py-12 text-muted-foreground" data-testid="conversation-error">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Unable to load conversation</p>
          <p className="text-xs mt-1">{(error as Error)?.message || "Please try again later"}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => window.history.back()}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Share Hub
          </Button>
        </div>
      )}

      {!isLoading && !isError && conversation && (
        <>
          <div className="rounded-lg border bg-white overflow-hidden">
            <div className="divide-y max-h-[60vh] overflow-y-auto">
              {conversation.messages.map(msg => {
                const mine = isMe(user, msg.senderType, msg.senderId);
                return (
                  <div
                    key={msg.id}
                    data-testid={`message-${msg.id}`}
                    className={`p-4 ${mine ? "bg-blue-50/30" : "bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${mine ? "bg-blue-500" : "bg-gray-400"}`}>
                          {msg.senderName?.[0] || "?"}
                        </div>
                        <span className="text-sm font-semibold text-gray-800">
                          {mine ? "You" : msg.senderName}
                        </span>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-gray-200 text-gray-500">
                          {msg.senderType}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(msg.createdAt), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>

                    {msg.body && (
                      <p className="text-sm text-gray-700 whitespace-pre-wrap ml-9 mt-1">{msg.body}</p>
                    )}

                    {msg.sharedOfferId && (
                      <div className="ml-9 mt-2 flex items-center gap-2 flex-wrap">
                        <Link href={isDealer ? `/dealer/offers/${msg.sharedOfferId}` : `/offers/${msg.sharedOfferId}`}>
                          <span
                            data-testid={`link-offer-${msg.sharedOfferId}`}
                            className="inline-flex items-center gap-1.5 text-sm text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-2.5 py-1 hover:bg-violet-100 transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Offer #{msg.sharedOfferId}
                          </span>
                        </Link>
                        {!isDealer && !mine && !savedOfferIds.has(msg.sharedOfferId) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-violet-200 text-violet-700 hover:bg-violet-50"
                            disabled={savingOfferId === msg.sharedOfferId}
                            onClick={() => handleSaveCopy(msg.sharedOfferId!)}
                            data-testid={`btn-save-offer-${msg.sharedOfferId}`}
                          >
                            {savingOfferId === msg.sharedOfferId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
                            Save to my offers
                          </Button>
                        )}
                        {savedOfferIds.has(msg.sharedOfferId) && (
                          <span className="text-xs text-green-600 font-medium">Saved</span>
                        )}
                      </div>
                    )}

                    {msg.sharedEnquiryId && (
                      <div className="ml-9 mt-2 flex items-center gap-2 flex-wrap">
                        <Link href={isDealer ? `/dealer/requests/${msg.sharedEnquiryId}` : `/enquiries/${msg.sharedEnquiryId}`}>
                          <span
                            data-testid={`link-enquiry-${msg.sharedEnquiryId}`}
                            className="inline-flex items-center gap-1.5 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-2.5 py-1 hover:bg-orange-100 transition-colors cursor-pointer"
                          >
                            <Inbox className="w-3.5 h-3.5" />
                            Enquiry #{msg.sharedEnquiryId}
                          </span>
                        </Link>
                        {!isDealer && !mine && !claimedEnquiryIds.has(msg.sharedEnquiryId) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1 border-orange-200 text-orange-700 hover:bg-orange-50"
                            disabled={claimingEnquiryId === msg.sharedEnquiryId}
                            onClick={() => handleClaimEnquiry(msg.sharedEnquiryId!)}
                            data-testid={`btn-claim-enquiry-${msg.sharedEnquiryId}`}
                          >
                            {claimingEnquiryId === msg.sharedEnquiryId ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                            Claim enquiry
                          </Button>
                        )}
                        {claimedEnquiryIds.has(msg.sharedEnquiryId) && (
                          <span className="text-xs text-green-600 font-medium">Claimed</span>
                        )}
                      </div>
                    )}

                    {msg.attachments.length > 0 && (
                      <div className="ml-9 mt-2 space-y-1">
                        {msg.attachments.map(att => (
                          <a
                            key={att.id}
                            href={`/api/share-hub/attachments/${att.filename}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`attachment-${att.id}`}
                            className="inline-flex items-center gap-1.5 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2.5 py-1 hover:bg-blue-100 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            {att.originalName}
                            <span className="text-[10px] text-gray-500">({formatFileSize(att.size)})</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="rounded-lg border bg-white p-3">
            <div className="flex gap-2">
              <Textarea
                data-testid="input-reply"
                placeholder="Type a reply..."
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[60px] max-h-[120px] resize-none flex-1"
                rows={2}
              />
              <div className="flex flex-col gap-1.5">
                <Button
                  data-testid="button-send-reply"
                  size="icon"
                  onClick={handleSend}
                  disabled={sendMutation.isPending || (!replyBody.trim() && !replyFile)}
                >
                  {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
                <Button
                  data-testid="button-attach-file"
                  size="icon"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files?.[0]) setReplyFile(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            {replyFile && (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Paperclip className="w-3.5 h-3.5" />
                <span className="truncate max-w-[200px]">{replyFile.name}</span>
                <span className="text-[10px]">({formatFileSize(replyFile.size)})</span>
                <button
                  type="button"
                  onClick={() => setReplyFile(null)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (isDealer) {
    return <DealerLayout>{content}</DealerLayout>;
  }
  return <Layout>{content}</Layout>;
}
