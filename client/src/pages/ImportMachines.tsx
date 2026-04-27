import { useState, useRef } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, Loader2, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

function useImportMachines() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(api.machines.import.path, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Import failed" }));
        throw new Error(err.message);
      }
      return res.json() as Promise<{ machines: number; options: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.machines.list.path] });
      queryClient.removeQueries({ queryKey: ["/api/machines/families"] });
      queryClient.removeQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/machines/family");
      }});
      toast({ title: "Import successful", description: `${data.machines} machines and ${data.options} options imported.` });
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });
}

export default function ImportMachines() {
  const importMachines = useImportMachines();
  const { toast } = useToast();
  const [importResult, setImportResult] = useState<{ machines: number; options: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|ods|csv)$/i)) {
      toast({ title: "Invalid file", description: "Please select an Excel file (.xlsx or .xls)", variant: "destructive" });
      return;
    }
    setImportResult(null);
    const result = await importMachines.mutateAsync(file);
    setImportResult(result);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <PageHeader
          title="Import Machines from Excel"
          subtitle="Upload your Excel file to import machine catalog data"
          actions={
            <Button variant="outline" onClick={() => window.history.back()} data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          }
        />

        <div className="bg-card border rounded-lg p-6 space-y-6">
          <div>
            <h3 className="font-medium mb-2 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> Expected Format
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              All existing machines and options will be replaced. Expected columns:
            </p>
            <div className="text-xs bg-muted rounded p-3 font-mono space-y-1">
              <div><span className="font-bold">A</span>: M (machine) or O (option)</div>
              <div><span className="font-bold">B</span>: Sequential number</div>
              <div><span className="font-bold">C</span>: Machine code / parent code</div>
              <div><span className="font-bold">D</span>: Macro type (family)</div>
              <div><span className="font-bold">E</span>: Name/title</div>
              <div><span className="font-bold">F</span>: List price (€)</div>
              <div><span className="font-bold">G</span>: Electrical power (kW)</div>
              <div><span className="font-bold">H</span>: Compressed air (Nl/min)</div>
              <div><span className="font-bold">I</span>: Exhausted air (m³/h)</div>
              <div><span className="font-bold">J</span>: Air introduced (m³/h)</div>
              <div><span className="font-bold">K</span>: Installation days</div>
              <div><span className="font-bold">L</span>: Description (shown in offer)</div>
              <div><span className="font-bold">M</span>: Image filename</div>
            </div>
          </div>

          <div
            data-testid="import-dropzone"
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {importMachines.isPending ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-medium">Importing...</p>
              </div>
            ) : importResult ? (
              <div className="flex flex-col items-center gap-2 text-green-600">
                <CheckCircle2 className="h-10 w-10" />
                <p className="font-semibold text-lg">Import complete!</p>
                <p className="text-sm">{importResult.machines} machines · {importResult.options} options</p>
                <p className="text-xs text-muted-foreground mt-2">Click to import another file</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-10 w-10" />
                <p className="font-medium text-lg">Drop your Excel file here</p>
                <p className="text-sm">or click to browse</p>
                <p className="text-xs">.xlsx, .xls files supported</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.ods,.csv"
            className="hidden"
            data-testid="input-import-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </Layout>
  );
}
