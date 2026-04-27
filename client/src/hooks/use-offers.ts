import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, errorSchemas } from "@shared/routes";
import { type InsertOffer, type InsertOfferItem } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

export function useOffers(filters?: { salesmanId?: string; dealerId?: string; fromDate?: string; toDate?: string }) {
  const params = new URLSearchParams();
  if (filters?.salesmanId && filters.salesmanId !== "all") params.set("salesmanId", filters.salesmanId);
  if (filters?.dealerId && filters.dealerId !== "all") params.set("dealerId", filters.dealerId);
  if (filters?.fromDate) params.set("fromDate", filters.fromDate);
  if (filters?.toDate) params.set("toDate", filters.toDate);
  const qs = params.toString();
  const url = qs ? `${api.offers.list.path}?${qs}` : api.offers.list.path;

  return useQuery({
    queryKey: [api.offers.list.path, filters?.salesmanId, filters?.dealerId, filters?.fromDate, filters?.toDate],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch offers");
      return res.json();
    },
  });
}

export function useBinOffers() {
  return useQuery({
    queryKey: ["/api/offers/bin"],
    queryFn: async () => {
      const res = await fetch("/api/offers/bin", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch bin offers");
      return res.json() as Promise<any[]>;
    },
  });
}

export function useOffer(id: number) {
  return useQuery({
    queryKey: [api.offers.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.offers.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch offer");
      return api.offers.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

// Define the complex input type expected by the endpoint
type CreateOfferPayload = z.infer<typeof api.offers.create.input>;

export function useCreateOffer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: CreateOfferPayload) => {
      const res = await fetch(api.offers.create.path, {
        method: api.offers.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to create offer");
      return api.offers.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.offers.list.path] });
      toast({ title: "Success", description: "Offer created successfully" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteOffer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (offerId: number) => {
      const url = buildUrl(api.offers.delete.path, { id: offerId });
      const res = await fetch(url, {
        method: api.offers.delete.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete offer");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.offers.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/offers/bin"] });
      toast({ title: "Moved to Bin", description: "The offer has been moved to the Bin." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function usePermanentDeleteOffer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (offerId: number) => {
      const res = await fetch(`/api/offers/${offerId}/permanent`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 403) throw new Error("Only administrators can permanently delete offers");
      if (!res.ok) throw new Error("Failed to permanently delete offer");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/offers/bin"] });
      queryClient.invalidateQueries({ queryKey: [api.offers.list.path] });
      toast({ title: "Permanently deleted", description: "The offer has been permanently removed." });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateOfferStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ offerId, status }: { offerId: number; status: string }) => {
      const url = buildUrl(api.offers.updateStatus.path, { id: offerId });
      const res = await fetch(url, {
        method: api.offers.updateStatus.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: (_data, { offerId }) => {
      queryClient.invalidateQueries({ queryKey: [api.offers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.offers.get.path, offerId] });
      toast({ title: "Success", description: "Status updated" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export interface OfferVersionRow {
  id: number;
  version: number;
  displayVersion?: number;
  referenceNumber: string;
  status: string;
  date: string;
  totalPrice: string | number;
  salesmanName: string;
  salesmanUserId: number | null;
  subject: string;
  customerId: number | null;
  customerName: string | null;
  language: string | null;
  projectData: Record<string, any> | null;
  items: any[];
  isCurrent: boolean;
  isViewed: boolean;
  changeSummary: string[];
}

export function useOfferVersions(offerId: number) {
  return useQuery<OfferVersionRow[]>({
    queryKey: ["/api/offers", offerId, "versions"],
    queryFn: async () => {
      const res = await fetch(`/api/offers/${offerId}/versions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch offer versions");
      return res.json();
    },
    enabled: offerId > 0,
  });
}

export function useCreateOfferVersion() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (offerId: number) => {
      const url = buildUrl(api.offers.createVersion.path, { id: offerId });
      const res = await fetch(url, {
        method: api.offers.createVersion.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create new version");
      return api.offers.createVersion.responses[201].parse(await res.json());
    },
    onSuccess: (_data, offerId) => {
      queryClient.invalidateQueries({ queryKey: [api.offers.list.path] });
      queryClient.invalidateQueries({ queryKey: ["/api/offers", offerId, "versions"] });
      toast({ title: "Success", description: "New version created" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

type UpdateOfferPayload = z.infer<typeof api.offers.update.input>;

export function useUpdateOffer() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ offerId, payload }: { offerId: number; payload: UpdateOfferPayload }) => {
      const url = buildUrl(api.offers.update.path, { id: offerId });
      const res = await fetch(url, {
        method: api.offers.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update offer");
      return api.offers.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, { offerId }) => {
      queryClient.invalidateQueries({ queryKey: [api.offers.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.offers.get.path, offerId] });
      toast({ title: "Success", description: "Offer updated successfully" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}
