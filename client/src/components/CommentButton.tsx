import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface CommentButtonProps {
  comment: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function CommentButton({ comment, onChange, readOnly = false, className, "data-testid": testId }: CommentButtonProps) {
  const [open, setOpen] = useState(false);
  const hasComment = comment.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded transition-colors shrink-0",
            hasComment
              ? "text-amber-500 hover:text-amber-600"
              : "text-muted-foreground/40 hover:text-muted-foreground",
            className
          )}
          title={hasComment ? "View comment" : "Add comment"}
        >
          <MessageSquare className={cn("w-3.5 h-3.5", hasComment && "fill-amber-100")} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 p-3">
        {readOnly ? (
          <p className="text-sm whitespace-pre-wrap">{comment || "(no comment)"}</p>
        ) : (
          <Textarea
            placeholder="Add a comment (internal only)…"
            value={comment}
            onChange={(e) => onChange?.(e.target.value)}
            className="text-xs min-h-[80px] resize-none"
            autoFocus
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

interface BlinkingCommentIconProps {
  comment: string;
  "data-testid"?: string;
}

export function BlinkingCommentIcon({ comment, "data-testid": testId }: BlinkingCommentIconProps) {
  const [open, setOpen] = useState(false);
  if (!comment?.trim()) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className="flex items-center justify-center w-6 h-6 rounded text-amber-500 hover:text-amber-600 animate-pulse shrink-0"
          title="View comment"
        >
          <MessageSquare className="w-4 h-4 fill-amber-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72 p-3">
        <p className="text-xs font-medium text-muted-foreground mb-1">Internal comment</p>
        <p className="text-sm whitespace-pre-wrap">{comment}</p>
      </PopoverContent>
    </Popover>
  );
}
