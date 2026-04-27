import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface InlineConfirmProps {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  onConfirm: () => void;
  isPending?: boolean;
}

export function InlineConfirm({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  onConfirm,
  isPending,
}: InlineConfirmProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5" data-testid="inline-confirm-panel">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirming(false)}
            disabled={isPending}
            data-testid="button-inline-cancel"
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            variant={variant}
            onClick={() => { onConfirm(); setConfirming(false); }}
            disabled={isPending}
            data-testid="button-inline-confirm"
          >
            {isPending ? "..." : confirmLabel}
          </Button>
        </div>
      </div>
    );
  }

  return <span onClick={() => setConfirming(true)}>{trigger}</span>;
}

interface InlineConfirmButtonProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  isPending?: boolean;
  buttonContent: React.ReactNode;
  buttonVariant?: "ghost" | "outline" | "destructive" | "default";
  buttonSize?: "default" | "sm" | "icon";
  buttonClassName?: string;
  "data-testid"?: string;
}

export function InlineConfirmButton({
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  isPending,
  buttonContent,
  buttonVariant = "ghost",
  buttonSize = "icon",
  buttonClassName,
  "data-testid": testId,
}: InlineConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2 animate-in fade-in duration-200" data-testid="inline-confirm-active">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{title}</span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setConfirming(false)} data-testid="button-cancel-confirm">
          Cancel
        </Button>
        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => { onConfirm(); setConfirming(false); }} disabled={isPending} data-testid="button-do-confirm">
          {isPending ? "..." : confirmLabel}
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant={buttonVariant}
      size={buttonSize}
      className={buttonClassName}
      onClick={() => setConfirming(true)}
      data-testid={testId}
    >
      {buttonContent}
    </Button>
  );
}
