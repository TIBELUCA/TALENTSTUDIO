import type { Request, Response, NextFunction } from "express";
import "../types";

export const DEFAULT_COMPANY_ID = 1;

export function attachCompanyId(req: Request, _res: Response, next: NextFunction) {
  req.companyId = DEFAULT_COMPANY_ID;
  next();
}
