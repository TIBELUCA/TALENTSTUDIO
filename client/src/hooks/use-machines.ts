import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, errorSchemas } from "@shared/routes";
import { type InsertMachine, type InsertMachineOption } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

function clearAllMachineCaches(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [api.machines.list.path] });
  queryClient.removeQueries({ queryKey: ["/api/machines/families"] });
  queryClient.removeQueries({ predicate: (query) => {
    const key = query.queryKey[0];
    return typeof key === "string" && key.startsWith("/api/machines/family");
  }});
}

export function useMachines() {
  return useQuery({
    queryKey: [api.machines.list.path],
    queryFn: async () => {
      const res = await fetch(api.machines.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch machines");
      return api.machines.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateMachine() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertMachine) => {
      const res = await fetch(api.machines.create.path, {
        method: api.machines.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
         if (res.status === 400) {
           const error = errorSchemas.validation.parse(await res.json());
           throw new Error(error.message);
         }
         throw new Error("Failed to create machine");
      }
      return api.machines.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      clearAllMachineCaches(queryClient);
      toast({ title: "Success", description: "Machine added to catalog" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useCreateMachineOption() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ machineId, ...data }: InsertMachineOption) => {
      const url = buildUrl(api.machineOptions.create.path, { machineId });
      const res = await fetch(url, {
        method: api.machineOptions.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to add option");
      return api.machineOptions.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      clearAllMachineCaches(queryClient);
      toast({ title: "Success", description: "Option added to machine" });
    },
  });
}

export function useUpdateMachine() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, machine }: { id: number; machine: Partial<InsertMachine> }) => {
      const res = await fetch(buildUrl(api.machines.update.path, { id }), {
        method: api.machines.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(machine),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update machine");
      return api.machines.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      clearAllMachineCaches(queryClient);
      toast({ title: "Success", description: "Machine updated" });
    },
  });
}

export function useUpdateMachineOption() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ optionId, option }: { optionId: number; option: Partial<InsertMachineOption> }) => {
      const res = await fetch(buildUrl(api.machineOptions.update.path, { optionId }), {
        method: api.machineOptions.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(option),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update option");
      return api.machineOptions.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      clearAllMachineCaches(queryClient);
      toast({ title: "Success", description: "Option updated" });
    },
  });
}

export function useDeleteMachine() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(buildUrl(api.machines.deleteMachine.path, { id }), {
        method: api.machines.deleteMachine.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete machine");
    },
    onSuccess: () => {
      clearAllMachineCaches(queryClient);
      toast({ title: "Success", description: "Machine deleted" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteMachineOption() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (optionId: number) => {
      const res = await fetch(buildUrl(api.machineOptions.delete.path, { optionId }), {
        method: api.machineOptions.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete option");
    },
    onSuccess: () => {
      clearAllMachineCaches(queryClient);
      toast({ title: "Success", description: "Option deleted" });
    },
  });
}
