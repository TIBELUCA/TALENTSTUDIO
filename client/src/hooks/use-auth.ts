import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SalesmanFeatures, UserRole } from "@shared/schema";

export interface AppUser {
  type: "master" | "salesman" | "dealer";
  id: string | number;
  name: string;
  email: string;
  surname?: string;
  mobileNumber?: string;
  features?: SalesmanFeatures;
  linkedSalesmanId?: number | null;
  role?: UserRole;
  parentSalesmanId?: number | null;
  parentSalesmanIds?: number[];
}

async function fetchMe(): Promise<AppUser | null> {
  const response = await fetch("/api/auth/me", { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
  return response.json();
}

async function logoutMaster(): Promise<void> {
  await fetch("/api/master/logout", { method: "POST", credentials: "include" });
  window.location.reload();
}

async function logoutSalesman(): Promise<void> {
  await fetch("/api/salesman/logout", { method: "POST", credentials: "include" });
  window.location.reload();
}

async function logoutDealer(): Promise<void> {
  await fetch("/api/dealer/logout", { method: "POST", credentials: "include" });
  window.location.reload();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<AppUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (user?.type === "salesman") {
        await logoutSalesman();
      } else if (user?.type === "dealer") {
        await logoutDealer();
      } else {
        await logoutMaster();
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
    },
  });

  const isMaster = user?.type === "master" || !!(user as any)?.isMaster;
  const isDealer = user?.type === "dealer";
  const features = user?.features;
  const role: UserRole = (user?.role as UserRole) ?? (isMaster ? "master" : isDealer ? "salesman" : "salesman");

  const hasRole = (...roles: UserRole[]): boolean => {
    if (isMaster) return true;
    return roles.includes(role);
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isMaster,
    isDealer,
    features,
    role,
    hasRole,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
