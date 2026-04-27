import { useEffect, useState, type CSSProperties } from "react";

type PdfDataInput = ArrayBuffer | Uint8Array | Blob | null | undefined;

interface PdfViewerProps {
  src?: string | null;
  data?: PdfDataInput;
  title?: string;
  testId?: string;
  height?: string;
  minHeight?: string;
  bordered?: boolean;
  resizable?: boolean;
  className?: string;
}

export function PdfViewer({
  src,
  data,
  title = "PDF",
  testId,
  height = "85vh",
  minHeight = "300px",
  bordered = true,
  resizable = true,
  className,
}: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (src || !data) {
      setBlobUrl(null);
      return;
    }
    let url: string;
    if (data instanceof Blob) {
      url = URL.createObjectURL(data);
    } else if (data instanceof Uint8Array) {
      url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
    } else {
      url = URL.createObjectURL(
        new Blob([new Uint8Array(data)], { type: "application/pdf" }),
      );
    }
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data, src]);

  const finalSrc = src ?? blobUrl ?? "";

  const wrapperClass = bordered
    ? `rounded-md border overflow-hidden bg-muted/10${className ? ` ${className}` : ""}`
    : (className ?? "");

  const wrapperStyle: CSSProperties = {
    height,
    minHeight,
    overflow: "auto",
    ...(resizable ? { resize: "vertical" as const } : {}),
  };

  return (
    <div className={wrapperClass} style={wrapperStyle} data-testid={testId}>
      {finalSrc ? (
        <iframe
          src={finalSrc}
          className="w-full h-full border-0"
          title={title}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          Caricamento…
        </div>
      )}
    </div>
  );
}
