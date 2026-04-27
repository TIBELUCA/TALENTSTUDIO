import { FormatEditor } from "./Format";
import { DealerLayout } from "@/components/DealerLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Hash, Save } from "lucide-react";

interface OfferNamingConfig {
  offerPrefix: string;
  nextNumber: number;
  numberPadding: number;
}

function OfferNamingSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [prefix, setPrefix] = useState("");
  const [nextNumber, setNextNumber] = useState(1);
  const [padding, setPadding] = useState(3);

  const { data, isLoading } = useQuery<OfferNamingConfig>({
    queryKey: ["/api/dealer/settings/offer-naming"],
  });

  useEffect(() => {
    if (data) {
      setPrefix(data.offerPrefix || "");
      setNextNumber(data.nextNumber || 1);
      setPadding(data.numberPadding || 3);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/dealer/settings/offer-naming", {
        offerPrefix: prefix,
        nextNumber,
        numberPadding: padding,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dealer/settings/offer-naming"] });
      toast({ title: "Offer naming saved" });
    },
    onError: () => {
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const previewNumber = String(nextNumber).padStart(padding, "0");
  const previewRef = prefix ? `${prefix}-${previewNumber}` : previewNumber;

  if (isLoading) return null;

  return (
    <Card className="mb-6" data-testid="offer-naming-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash className="h-4 w-4" />
          Offer Numbering
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Configure a custom prefix and numbering for your dealer offers. When you create a new dealer offer, the reference number will use this format instead of the supplier's numbering.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="offer-prefix">Prefix</Label>
            <Input
              id="offer-prefix"
              data-testid="input-offer-prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase())}
              placeholder="e.g. DLR"
            />
            <p className="text-xs text-muted-foreground mt-1">Letters/numbers before the sequential number</p>
          </div>
          <div>
            <Label htmlFor="next-number">Next Number</Label>
            <Input
              id="next-number"
              data-testid="input-next-number"
              type="number"
              min={1}
              value={nextNumber}
              onChange={(e) => setNextNumber(Math.max(1, parseInt(e.target.value) || 1))}
            />
            <p className="text-xs text-muted-foreground mt-1">The number for your next offer</p>
          </div>
          <div>
            <Label htmlFor="number-padding">Number Padding</Label>
            <Input
              id="number-padding"
              data-testid="input-number-padding"
              type="number"
              min={1}
              max={6}
              value={padding}
              onChange={(e) => setPadding(Math.max(1, Math.min(6, parseInt(e.target.value) || 3)))}
            />
            <p className="text-xs text-muted-foreground mt-1">Minimum digits (e.g. 3 → 001)</p>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <div className="text-sm">
            <span className="text-muted-foreground">Preview: </span>
            <span className="font-mono font-medium" data-testid="text-naming-preview">{previewRef}</span>
          </div>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-naming"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PassthroughLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function DealerFormat({ embedded }: { embedded?: boolean }) {
  return (
    <FormatEditor
      apiBase="/api/dealer/settings/document-format"
      logoUploadUrl="/api/dealer/settings/document-format/logo"
      logoPreviewUrl="/api/dealer/settings/document-format/logo-preview"
      previewUrl="/api/dealer/settings/document-format/preview"
      layoutWrapper={embedded ? PassthroughLayout : DealerLayout}
      allowOfferReferenceInherit
    />
  );
}
