import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
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
import { Loader2, Share2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Recipient {
  type: string;
  id: number;
  name: string;
  email: string;
}

interface BulkShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "offer" | "enquiry";
  entityIds: number[];
  onComplete?: () => void;
}

export function BulkShareDialog({ open, onOpenChange, entityType, entityIds, onComplete }: BulkShareDialogProps) {
  const { toast } = useToast();
  const [recipientKey, setRecipientKey] = useState("");
  const [message, setMessage] = useState("");

  const label = entityType === "offer" ? "offer" : "enquiry";
  const count = entityIds.length;

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery<Recipient[]>({
    queryKey: ["/api/share-hub/recipients"],
    enabled: open,
  });

  const shareMutation = useMutation({
    mutationFn: async () => {
      const [type, id] = recipientKey.split(":");
      let successCount = 0;
      for (const entityId of entityIds) {
        const formData = new FormData();
        formData.append("subject", `${entityType === "offer" ? "Offer" : "Enquiry"} #${entityId}`);
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
        if (res.ok) successCount++;
      }
      return successCount;
    },
    onSuccess: (successCount) => {
      toast({
        title: `${successCount} ${label}${successCount !== 1 ? "s" : ""} shared`,
        description: `Shared via Share Hub.`,
      });
      onOpenChange(false);
      setRecipientKey("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/share-hub/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/share-hub/unread-count"] });
      onComplete?.();
    },
    onError: () => {
      toast({ title: "Error", description: `Failed to share ${label}s.`, variant: "destructive" });
    },
  });

  if (!open) return null;

  return (
    <div className="rounded-xl border bg-card p-6 mt-4" data-testid="bulk-share-inline">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <Share2 className="w-5 h-5" />
          Share {count} {label}{count !== 1 ? "s" : ""}
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)} data-testid="button-close-bulk-share">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Share <span className="font-medium text-foreground">{count} {label}{count !== 1 ? "s" : ""}</span> via Share Hub
        </div>

        <div className="space-y-2">
          <Label>Recipient</Label>
          {recipientsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading recipients...
            </div>
          ) : (
            <Select value={recipientKey} onValueChange={setRecipientKey}>
              <SelectTrigger data-testid="select-bulk-share-recipient">
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
            data-testid="input-bulk-share-message"
            placeholder={`Add a note about these ${label}s...`}
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-bulk-share">
            Cancel
          </Button>
          <Button
            onClick={() => shareMutation.mutate()}
            disabled={!recipientKey || shareMutation.isPending}
            data-testid="button-confirm-bulk-share"
          >
            {shareMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Share2 className="w-4 h-4 mr-2" />
            )}
            Share {count} {label}{count !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
