import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface Recipient {
  type: string;
  id: number;
  name: string;
  email: string;
}

interface ShareEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "offer" | "enquiry";
  entityId: number;
  entityReference: string;
}

export function ShareEntityDialog({ open, onOpenChange, entityType, entityId, entityReference }: ShareEntityDialogProps) {
  const { toast } = useToast();
  const { isDealer } = useAuth();
  const [, navigate] = useLocation();
  const [recipientKey, setRecipientKey] = useState("");
  const [message, setMessage] = useState("");

  const label = entityType === "offer" ? "Offer" : "Enquiry";

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery<Recipient[]>({
    queryKey: ["/api/share-hub/recipients"],
    enabled: open,
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      const [type, id] = recipientKey.split(":");
      const formData = new FormData();
      formData.append("subject", `${label} ${entityReference}`);
      formData.append("recipientType", type);
      formData.append("recipientId", id);
      if (entityType === "offer") {
        formData.append("sharedOfferId", String(entityId));
      } else {
        formData.append("sharedEnquiryId", String(entityId));
      }
      if (message.trim()) formData.append("body", message.trim());

      const res = await fetch("/api/share-hub/conversations", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Failed to share ${label.toLowerCase()}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `${label} shared`, description: `Shared ${entityReference} via Share Hub.` });
      onOpenChange(false);
      setRecipientKey("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/share-hub/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/share-hub/unread-count"] });
      const base = isDealer ? "/dealer/share-hub" : "/share-hub";
      navigate(`${base}/${data.conversationId}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleShare = () => {
    if (!recipientKey) return;
    shareMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="share-entity-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5" />
            Share {label}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm text-muted-foreground">
            Share <span className="font-medium text-foreground">{entityReference}</span> via Share Hub
          </div>

          <div className="space-y-2">
            <Label>Recipient</Label>
            {recipientsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading recipients…
              </div>
            ) : (
              <Select value={recipientKey} onValueChange={setRecipientKey}>
                <SelectTrigger data-testid="select-share-recipient">
                  <SelectValue placeholder="Select recipient" />
                </SelectTrigger>
                <SelectContent>
                  {recipients.map(r => (
                    <SelectItem key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`}>
                      {r.name} ({r.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label>Message (optional)</Label>
            <Textarea
              data-testid="input-share-message"
              placeholder={`Add a note about this ${label.toLowerCase()}…`}
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-share">
            Cancel
          </Button>
          <Button
            onClick={handleShare}
            disabled={!recipientKey || shareMutation.isPending}
            data-testid="button-confirm-share"
          >
            {shareMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Share2 className="w-4 h-4 mr-2" />
            )}
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ShareOfferDialog({ open, onOpenChange, offerId, offerReference }: { open: boolean; onOpenChange: (open: boolean) => void; offerId: number; offerReference: string }) {
  return <ShareEntityDialog open={open} onOpenChange={onOpenChange} entityType="offer" entityId={offerId} entityReference={offerReference} />;
}
