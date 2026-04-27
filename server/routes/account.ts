import express, { Router } from "express";
import { userRepository, dealerRepository, settingsRepository } from "../repositories";
import { isMaster, getSalesmanId } from "../middlewares/auth";
import { getDealerId } from "../middlewares/dealer";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { DEFAULT_COMPANY_ID } from "../middlewares/company";
import multer from "multer";
import path from "path";
import fs from "fs";

const DEALER_LOGOS_DIR = path.join(process.cwd(), "server", "assets", "dealer-logos");
if (!fs.existsSync(DEALER_LOGOS_DIR)) fs.mkdirSync(DEALER_LOGOS_DIR, { recursive: true });

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const selfLogoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DEALER_LOGOS_DIR),
  filename: (req, file, cb) => {
    const ext = MIME_TO_EXT[file.mimetype] || ".png";
    const dealerId = getDealerId(req);
    cb(null, `dealer-self-${dealerId}-${Date.now()}${ext}`);
  },
});

const selfLogoUpload = multer({
  storage: selfLogoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are accepted"));
  },
});

const router = Router();

const AVATARS_DIR = path.join(process.cwd(), "server", "assets", "avatars");
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const timestamp = Date.now();
    if (isMaster(req)) {
      cb(null, `master-0-${timestamp}${ext}`);
    } else {
      const salesmanId = getSalesmanId(req);
      const dealerId = getDealerId(req);
      if (salesmanId !== null) cb(null, `salesman-${salesmanId}-${timestamp}${ext}`);
      else if (dealerId !== null) cb(null, `dealer-${dealerId}-${timestamp}${ext}`);
      else cb(new Error("Not authenticated"), "");
    }
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are accepted"));
  },
});

function requireAnyAuth(req: any, res: any, next: any) {
  if (isMaster(req) || getSalesmanId(req) !== null || getDealerId(req) !== null) return next();
  res.status(401).json({ message: "Not authenticated" });
}

router.use("/avatars", (_req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=86400");
  next();
}, express.static(AVATARS_DIR));

router.get("/api/account", requireAnyAuth, asyncHandler(async (req, res) => {
  const dealerId = getDealerId(req);
  if (dealerId !== null) {
    const dealer = await dealerRepository.getById(dealerId);
    if (!dealer) throw AppError.notFound("User");
    const photoUrl = await settingsRepository.getAvatar(`avatar_dealer_${dealerId}`);
    return res.json({
      type: "dealer",
      id: dealer.id,
      name: dealer.name,
      surname: dealer.surname || "",
      email: dealer.email,
      mobileNumber: dealer.mobileNumber || "",
      photoUrl: photoUrl || null,
      isActive: dealer.isActive,
      role: (dealer as any).role || "",
      dealerCompany: dealer.dealerCompany ?? null,
    });
  }

  const salesmanId = getSalesmanId(req);
  if (salesmanId !== null) {
    const salesman = await userRepository.getById(salesmanId);
    if (!salesman) throw AppError.notFound("User");
    const photoUrl = await settingsRepository.getAvatar(`avatar_salesman_${salesmanId}`);
    return res.json({
      type: "salesman",
      id: salesman.id,
      name: salesman.name,
      surname: (salesman as any).surname || "",
      email: salesman.email,
      mobileNumber: (salesman as any).mobileNumber || "",
      isMasterSalesman: salesman.isMasterSalesman ?? false,
      photoUrl: photoUrl || null,
    });
  }

  const profile = await settingsRepository.getMasterProfile(DEFAULT_COMPANY_ID);
  const photoUrl = await settingsRepository.getAvatar(`avatar_master`);
  const user = (req as any).user;
  const replitName = `${user?.claims?.first_name || ""} ${user?.claims?.last_name || ""}`.trim();
  return res.json({
    type: "master",
    id: user?.claims?.sub,
    name: profile.name || replitName,
    surname: profile.surname || "",
    email: user?.claims?.email,
    mobileNumber: profile.mobileNumber || "",
    photoUrl: photoUrl || null,
  });
}));

router.put("/api/account", requireAnyAuth, asyncHandler(async (req, res) => {
  const { name, surname, mobileNumber, email, password } = req.body;

  const dealerId = getDealerId(req);
  if (dealerId !== null) {
    const updated = await dealerRepository.update(dealerId, {
      name: name || undefined,
      surname: surname ?? undefined,
      mobileNumber: mobileNumber ?? undefined,
      ...(email ? { email } : {}),
      ...(password ? { password } : {}),
    });
    const photoUrl = await settingsRepository.getAvatar(`avatar_dealer_${dealerId}`);
    return res.json({ ...updated, passwordHash: undefined, companyId: undefined, photoUrl: photoUrl || null });
  }

  const salesmanId = getSalesmanId(req);
  if (salesmanId !== null) {
    const updated = await userRepository.update(salesmanId, {
      name: name || undefined,
      surname: surname ?? undefined,
      mobileNumber: mobileNumber ?? undefined,
      ...(email ? { email } : {}),
      ...(password ? { password } : {}),
    });
    const photoUrl = await settingsRepository.getAvatar(`avatar_salesman_${salesmanId}`);
    return res.json({ ...updated, passwordHash: undefined, companyId: undefined, photoUrl: photoUrl || null });
  }

  const profile = await settingsRepository.getMasterProfile(DEFAULT_COMPANY_ID);
  const updatedProfile = {
    ...profile,
    name: name || profile.name,
    surname: surname ?? profile.surname,
    mobileNumber: mobileNumber ?? profile.mobileNumber,
  };
  await settingsRepository.saveMasterProfile(DEFAULT_COMPANY_ID, updatedProfile);
  const photoUrl = await settingsRepository.getAvatar(`avatar_master`);
  return res.json({ ...updatedProfile, photoUrl: photoUrl || null });
}));

router.post("/api/account/photo", requireAnyAuth, avatarUpload.single("photo"), asyncHandler(async (req, res) => {
  const file = (req as any).file;
  if (!file) throw AppError.badRequest("No file uploaded");

  const photoUrl = `/avatars/${file.filename}`;

  const dealerId = getDealerId(req);
  if (dealerId !== null) {
    await settingsRepository.setAvatar(`avatar_dealer_${dealerId}`, DEFAULT_COMPANY_ID, photoUrl);
    return res.json({ photoUrl });
  }

  const salesmanId = getSalesmanId(req);
  if (salesmanId !== null) {
    await settingsRepository.setAvatar(`avatar_salesman_${salesmanId}`, DEFAULT_COMPANY_ID, photoUrl);
    return res.json({ photoUrl });
  }

  await settingsRepository.setAvatar(`avatar_master`, DEFAULT_COMPANY_ID, photoUrl);
  const profile = await settingsRepository.getMasterProfile(DEFAULT_COMPANY_ID);
  await settingsRepository.saveMasterProfile(DEFAULT_COMPANY_ID, { ...profile, photoUrl });
  return res.json({ photoUrl });
}));

function requireDealerAuth(req: any, res: any, next: any) {
  if (getDealerId(req) !== null) return next();
  res.status(401).json({ message: "Dealer authentication required" });
}

router.get("/api/account/branding", requireDealerAuth, asyncHandler(async (req, res) => {
  const dealerId = getDealerId(req)!;
  const dealer = await dealerRepository.getById(dealerId);
  if (!dealer?.dealerCompanyId) return res.json({ docLogoUrl: null, docFooterLines: [], docTermsText: "" });
  const company = await dealerRepository.getCompanyById(dealer.dealerCompanyId);
  if (!company) return res.json({ docLogoUrl: null, docFooterLines: [], docTermsText: "" });
  res.json({
    docLogoUrl: company.docLogoUrl ?? null,
    docFooterLines: Array.isArray(company.docFooterLines) ? company.docFooterLines : [],
    docTermsText: company.docTermsText ?? "",
  });
}));

router.put("/api/account/branding", requireDealerAuth, asyncHandler(async (req, res) => {
  const dealerId = getDealerId(req)!;
  const dealer = await dealerRepository.getById(dealerId);
  if (!dealer?.dealerCompanyId) throw AppError.badRequest("No dealer company linked to your account");
  const { docFooterLines, docTermsText } = req.body;
  const filteredFooter = Array.isArray(docFooterLines) ? docFooterLines.filter((l: string) => typeof l === "string" && l.trim() !== "") : null;
  await dealerRepository.updateCompany(dealer.dealerCompanyId, {
    docFooterLines: filteredFooter && filteredFooter.length > 0 ? filteredFooter : null,
    docTermsText: typeof docTermsText === "string" && docTermsText.trim() ? docTermsText.trim() : null,
  });
  res.json({ ok: true });
}));

router.post("/api/account/branding/logo", requireDealerAuth, selfLogoUpload.single("logo"), asyncHandler(async (req, res) => {
  const dealerId = getDealerId(req)!;
  const dealer = await dealerRepository.getById(dealerId);
  if (!dealer?.dealerCompanyId) throw AppError.badRequest("No dealer company linked to your account");
  const file = (req as any).file;
  if (!file) throw AppError.badRequest("No file uploaded");
  const company = await dealerRepository.getCompanyById(dealer.dealerCompanyId);
  if (company?.docLogoUrl) {
    const oldPath = path.join(DEALER_LOGOS_DIR, path.basename(company.docLogoUrl));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }
  const logoUrl = `/dealer-logos/${file.filename}`;
  await dealerRepository.updateCompany(dealer.dealerCompanyId, { docLogoUrl: logoUrl });
  res.json({ docLogoUrl: logoUrl });
}));

router.delete("/api/account/branding/logo", requireDealerAuth, asyncHandler(async (req, res) => {
  const dealerId = getDealerId(req)!;
  const dealer = await dealerRepository.getById(dealerId);
  if (!dealer?.dealerCompanyId) throw AppError.badRequest("No dealer company linked to your account");
  const company = await dealerRepository.getCompanyById(dealer.dealerCompanyId);
  if (company?.docLogoUrl) {
    const oldPath = path.join(DEALER_LOGOS_DIR, path.basename(company.docLogoUrl));
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    await dealerRepository.updateCompany(dealer.dealerCompanyId, { docLogoUrl: null });
  }
  res.json({ ok: true });
}));

export default router;
