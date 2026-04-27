import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CheckSquare, X } from "lucide-react";

interface SelectionBarProps {
  count: number;
  onCancel: () => void;
  actions?: ReactNode;
}

export function SelectionBar({ count, onCancel, actions }: SelectionBarProps) {
  return (
    <div
      className="flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-lg px-4 py-2"
      data-testid="selection-bar"
    >
      <CheckSquare className="w-4 h-4 text-primary" />
      <span className="text-sm font-medium" data-testid="text-selection-count">
        {count > 0
          ? `${count} ${count === 1 ? "item" : "items"} selected`
          : "Select items"}
      </span>
      {count > 0 && actions && (
        <div className="flex items-center gap-2 ml-2" data-testid="selection-actions">
          {actions}
        </div>
      )}
      <div className="ml-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          data-testid="button-cancel-selection"
        >
          <X className="w-4 h-4 mr-1" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
