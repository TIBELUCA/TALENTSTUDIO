import type { Request, Response, NextFunction } from "express";
import "../types";
import { userRepository } from "../repositories";
import type { SalesmanFeatures, UserRole } from "@shared/schema";

export function isMaster(req: Request): boolean {
  return !!(req.session.salesmanIsMaster) || req.session.salesmanRole === "master";
}

export function getSalesmanId(req: Request): number | null {
  return req.session.salesmanId ?? null;
}

export function getUserRole(req: Request): UserRole | null {
  return (req.session.salesmanRole as UserRole) ?? null;
}

export function isInternalUser(req: Request): boolean {
  return getSalesmanId(req) !== null;
}

export function isAuthenticatedAny(req: Request): boolean {
  return isMaster(req) || getSalesmanId(req) !== null;
}

export async function getPerformedBy(req: Request): Promise<string> {
  const salesmanId = getSalesmanId(req);
  if (salesmanId) {
    const salesman = await userRepository.getById(salesmanId);
    if (salesman) {
      return [salesman.name, salesman.surname].filter(Boolean).join(" ") || (isMaster(req) ? "Master" : "Salesman");
    }
    return isMaster(req) ? "Master" : "Salesman";
  }
  if (isMaster(req)) return "Master";
  return "Unknown";
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!isAuthenticatedAny(req)) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

export async function requireAnyAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthenticatedAny(req) || !!req.session.dealerId) {
    return next();
  }
  return res.status(401).json({ message: "Authentication required" });
}

export async function requireMaster(req: Request, res: Response, next: NextFunction) {
  if (!isMaster(req)) {
    return res.status(403).json({ message: "Master access required" });
  }
  next();
}

export async function requireSalesmanOrMaster(req: Request, res: Response, next: NextFunction) {
  if (!isMaster(req) && getSalesmanId(req) === null) {
    return res.status(403).json({ message: "Salesman or Master access required" });
  }
  const role = getUserRole(req);
  if (role === "backoffice" && getBackofficeParentIds(req).length === 0) {
    return res.status(403).json({ message: "Backoffice account not linked to a salesman" });
  }
  next();
}

export function requireInternalUser(req: Request, res: Response, next: NextFunction) {
  if (!isInternalUser(req)) {
    return res.status(403).json({ message: "Internal user access required" });
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isMaster(req)) return next();
    const userRole = getUserRole(req);
    if (userRole && roles.includes(userRole)) return next();
    return res.status(403).json({ message: `Access denied. Required role: ${roles.join(" or ")}` });
  };
}

const INTERNAL_ONLY_ROLES: UserRole[] = ["amministrazione", "tecnico", "produzione", "service"];

export function requireSalesRole(req: Request, res: Response, next: NextFunction) {
  if (isMaster(req)) return next();
  const role = getUserRole(req);
  if (role && INTERNAL_ONLY_ROLES.includes(role)) {
    return res.status(403).json({ message: "Access denied for this role" });
  }
  // tecnico_commerciale manages drawings/requests but must not create or modify offers
  if (role === "tecnico_commerciale") {
    return res.status(403).json({ message: "Access denied for this role" });
  }
  if (role === "backoffice" && getBackofficeParentIds(req).length === 0) {
    return res.status(403).json({ message: "Backoffice account not linked to a salesman" });
  }
  if (getSalesmanId(req) !== null) return next();
  return res.status(403).json({ message: "Sales access required" });
}

export function getBackofficeParentIds(req: Request): number[] {
  const role = getUserRole(req);
  if (role !== "backoffice") return [];
  const ids = req.session.parentSalesmanIds;
  if (Array.isArray(ids) && ids.length > 0) return ids.filter((n) => typeof n === "number");
  // Backward-compat fallback: legacy single-id session field.
  if (req.session.parentSalesmanId != null) return [req.session.parentSalesmanId];
  return [];
}

export function getBackofficeParentId(req: Request): number | null {
  const ids = getBackofficeParentIds(req);
  return ids.length > 0 ? ids[0] : null;
}

export function isBackoffice(req: Request): boolean {
  return getUserRole(req) === "backoffice";
}

export function requireSpecialMachineAccess(req: Request, res: Response, next: NextFunction) {
  if (isMaster(req)) return next();
  const salesmanId = getSalesmanId(req);
  if (!salesmanId) {
    return res.status(403).json({ message: "Access denied" });
  }
  userRepository.getById(salesmanId).then(salesman => {
    if (!salesman) {
      return res.status(403).json({ message: "Access denied" });
    }
    const features = salesman.features as SalesmanFeatures | null;
    if (features?.canManageSpecialMachines) {
      return next();
    }
    return res.status(403).json({ message: "You do not have permission to manage special machines" });
  }).catch(() => {
    return res.status(500).json({ message: "Internal server error" });
  });
}
