import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, errorSchemas } from "@shared/routes";
import { type InsertPreset } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function usePresets() {
  return useQuery({
    queryKey: [api.presets.list.path],
    queryFn: async () => {
      const res = await fetch(api.presets.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch presets");
      return api.presets.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreatePreset() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertPreset) => {
      const res = await fetch(api.presets.list.path, { // api.presets.list.path is used as base for POST
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to create preset");
      // Note: In shared/routes, presets.list is GET. We need a create route.
      // Looking at shared/routes again, I accidentally removed 'create' when adding 'update'.
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.presets.list.path] });
      toast({ title: "Success", description: "Preset created" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdatePreset() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertPreset> }) => {
      const url = buildUrl(api.presets.update.path, { id });
      const res = await fetch(url, {
        method: api.presets.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update preset");
      return api.presets.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.presets.list.path] });
      toast({ title: "Success", description: "Preset updated" });
    },
  });
}

export function useDeletePreset() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.presets.delete.path, { id });
      const res = await fetch(url, {
        method: api.presets.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete preset");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.presets.list.path] });
      toast({ title: "Success", description: "Preset deleted" });
    },
  });
}
