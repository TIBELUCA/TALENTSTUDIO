import type { Request, Response, NextFunction } from "express";
import { offerRepository } from "../repositories";
import { isMaster, getSalesmanId } from "./auth";
import { getDealerId } from "./dealer";

export async function requireOfferOwnership(req: Request, res: Response, next: NextFunction) {
  const offerId = parseInt(req.params.id as string);
  if (isNaN(offerId)) {
    return res.status(400).json({ message: "Invalid offer ID" });
  }

  const offer = await offerRepository.getById(offerId);
  if (!offer || offer.companyId !== req.companyId) {
    return res.status(404).json({ message: "Offer not found" });
  }

  if (isMaster(req)) return next();

  const salesmanId = getSalesmanId(req);
  if (!salesmanId) {
    return res.status(403).json({ message: "Access denied" });
  }

  if (offer.salesmanUserId !== null && offer.salesmanUserId !== salesmanId) {
    return res.status(403).json({ message: "Access denied: you do not own this offer" });
  }

  next();
}

export async function requireEnquiryAccess(req: Request, res: Response, next: NextFunction) {
  const enquiryId = parseInt(req.params.id as string);
  if (isNaN(enquiryId)) {
    return res.status(400).json({ message: "Invalid enquiry ID" });
  }

  if (isMaster(req)) return next();

  const salesmanId = getSalesmanId(req);
  if (salesmanId) return next();

  const dealerId = getDealerId(req);
  if (dealerId) {
    const enquiry = await offerRepository.getById(enquiryId);
    if (!enquiry || enquiry.dealerId !== dealerId) {
      return res.status(403).json({ message: "Access denied" });
    }
    return next();
  }

  return res.status(403).json({ message: "Access denied" });
}

export async function requireDealerOfferAccess(req: Request, res: Response, next: NextFunction) {
  const offerId = parseInt(req.params.id as string);
  if (isNaN(offerId)) {
    return res.status(400).json({ message: "Invalid offer ID" });
  }

  const dealer = res.locals.dealer;
  if (!dealer) {
    return res.status(401).json({ message: "Dealer authentication required" });
  }

  const offer = await offerRepository.getById(offerId);
  if (!offer || offer.dealerId !== dealer.id) {
    return res.status(404).json({ message: "Offer not found" });
  }

  res.locals.offer = offer;
  next();
}
