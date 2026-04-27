import { Layout } from "@/components/Layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: number;
  companyId: number | null;
  recipientUserId: number;
  senderUserId: number | null;
  type: string;
  title: string;
  message: string;
  orderId: number | null;
  offerId: number | null;
  isRead: boolean;
  createdAt: string;
}

export default function Notifications() {
  const { toast } = useToast();

  const { data: items = [], isLoading, isError } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
    onError: () => {
      toast({ title: "Errore nel segnare come letta", variant: "destructive" });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
    onError: () => {
      toast({ title: "Errore nel segnare tutte come lette", variant: "destructive" });
    },
  });

  const unreadCount = items.filter(n => !n.isRead).length;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-notifications-title">
            <Bell className="w-6 h-6 text-primary" /> Notifiche
          </h1>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              data-testid="btn-mark-all-read"
            >
              {markAllRead.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
              Segna tutte come lette
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="w-10 h-10 text-destructive/50 mx-auto mb-3" />
              <p className="text-muted-foreground" data-testid="text-notifications-error">Errore nel caricamento delle notifiche.</p>
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Bell className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground" data-testid="text-no-notifications">Nessuna notifica.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2" data-testid="notifications-list">
            {items.map((n) => (
              <Card
                key={n.id}
                className={`transition-colors ${!n.isRead ? "border-primary/30 bg-primary/5" : ""}`}
                data-testid={`notification-item-${n.id}`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm" data-testid={`notification-title-${n.id}`}>{n.title}</span>
                        {!n.isRead && <Badge variant="default" className="text-[9px] h-4 px-1.5">Nuova</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground" data-testid={`notification-message-${n.id}`}>{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {n.createdAt ? format(new Date(n.createdAt), "dd/MM/yyyy HH:mm") : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {n.orderId && (
                        <Link href={`/orders/${n.orderId}`}>
                          <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`btn-goto-order-${n.id}`}>
                            <ExternalLink className="w-3 h-3 mr-1" /> Vai alla commessa
                          </Button>
                        </Link>
                      )}
                      {n.offerId && (
                        <Link href={`/offers/${n.offerId}`}>
                          <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`btn-goto-offer-${n.id}`}>
                            <ExternalLink className="w-3 h-3 mr-1" /> Vai all'offerta
                          </Button>
                        </Link>
                      )}
                      {!n.isRead && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => markRead.mutate(n.id)}
                          disabled={markRead.isPending}
                          data-testid={`btn-mark-read-${n.id}`}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Letta
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
