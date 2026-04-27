import type { Request, Response, NextFunction } from "express";
import { dealerRepository } from "../repositories";

export function getDealerId(req: Request): number | null {
  return req.session.dealerId ?? null;
}

export async function requireDealer(req: Request, res: Response, next: NextFunction) {
  const dealerId = getDealerId(req);
  if (!dealerId) {
    return res.status(401).json({ message: "Dealer authentication required" });
  }
  const dealer = await dealerRepository.getById(dealerId);
  if (!dealer || !dealer.isActive) {
    req.session.dealerId = undefined;
    return res.status(401).json({ message: "Dealer session invalid" });
  }
  res.locals.dealer = dealer;
  res.locals.dealerCompany = dealer.dealerCompany ?? null;
  next();
}
