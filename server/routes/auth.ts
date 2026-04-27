import { Router, type Request, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { dealerRepository, userRepository, settingsRepository } from "../repositories";
import { isMaster, getSalesmanId, requireMaster } from "../middlewares/auth";
import { getDealerId } from "../middlewares/dealer";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { DEFAULT_COMPANY_ID } from "../middlewares/company";
import "../types";
import fs from "fs";
import path from "path";

const router = Router();

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    const oldSession = req.session;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.cookie = oldSession.cookie;
      resolve();
    });
  });
}

function destroySession(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) return reject(err);
      res.clearCookie("connect.sid");
      resolve();
    });
  });
}

router.get("/api/logo", (_req, res) => {
  const logoPath = path.join(process.cwd(), "server", "assets", "logo.png");
  if (fs.existsSync(logoPath)) {
    res.sendFile(logoPath);
  } else {
    res.status(404).end();
  }
});

router.get("/api/dashboard-logo", (_req, res) => {
  const logo3DG = path.join(process.cwd(), "server", "assets", "3DG.png");
  const logoPath = path.join(process.cwd(), "server", "assets", "logo.png");

  if (fs.existsSync(logo3DG)) {
    res.sendFile(logo3DG);
  } else if (fs.existsSync(logoPath)) {
    res.sendFile(logoPath);
  } else {
    res.status(404).end();
  }
});

router.get("/api/auth/me", asyncHandler(async (req, res) => {
  const dealerSessionId = getDealerId(req);
  if (dealerSessionId) {
    const dealer = await dealerRepository.getById(dealerSessionId);
    if (dealer && dealer.isActive) {
      const dealerPhotoUrl = await settingsRepository.getAvatar(`avatar_dealer_${dealerSessionId}`);
      const company = dealer.dealerCompany;
      const linkedSalesmanId = company?.linkedSalesmanId ?? dealer.linkedSalesmanId;
      return res.json({ type: "dealer", id: dealer.id, email: dealer.email, name: dealer.name, surname: dealer.surname, mobileNumber: dealer.mobileNumber || "", linkedSalesmanId, dealerCompanyId: dealer.dealerCompanyId, dealerCompany: company, photoUrl: dealerPhotoUrl || null });
    }
    req.session.dealerId = undefined;
  }
  const salesmanId = getSalesmanId(req);
  if (salesmanId) {
    const salesman = await userRepository.getById(salesmanId);
    if (salesman && salesman.isActive) {
      const dbRole = (salesman as any).role;
      const effectiveRole = salesman.isMasterSalesman ? "master" : (dbRole && dbRole !== "salesman" ? dbRole : "salesman");
      return res.json({
        type: salesman.isMasterSalesman ? "master" : "salesman",
        id: salesman.id,
        name: salesman.name,
        surname: (salesman as any).surname || "",
        email: salesman.email,
        mobileNumber: (salesman as any).mobileNumber || "",
        features: salesman.features,
        isMaster: salesman.isMasterSalesman ?? false,
        role: effectiveRole,
        parentSalesmanId: (salesman as any).parentSalesmanId || null,
        parentSalesmanIds: Array.isArray((salesman as any).parentSalesmanIds) && (salesman as any).parentSalesmanIds.length > 0
          ? (salesman as any).parentSalesmanIds
          : ((salesman as any).parentSalesmanId ? [(salesman as any).parentSalesmanId] : []),
      });
    }
    req.session.salesmanId = undefined;
    req.session.salesmanIsMaster = undefined;
    req.session.salesmanRole = undefined;
    req.session.parentSalesmanId = undefined;
    req.session.parentSalesmanIds = undefined;
  }
  throw AppError.unauthorized("Not authenticated");
}));

router.get("/api/master/profile", requireMaster, asyncHandler(async (req, res) => {
  const salesmanId = getSalesmanId(req);
  if (salesmanId) {
    const salesman = await userRepository.getById(salesmanId);
    if (salesman) {
      return res.json({ name: salesman.name, surname: (salesman as any).surname || "", email: salesman.email, mobileNumber: (salesman as any).mobileNumber || "" });
    }
  }
  const profile = await settingsRepository.getMasterProfile(DEFAULT_COMPANY_ID);
  res.json(profile);
}));

router.put("/api/master/profile", requireMaster, asyncHandler(async (req, res) => {
  const { name, surname, email, mobileNumber } = req.body;
  const profile = { name: name || "", surname: surname || "", email: email || "", mobileNumber: mobileNumber || "" };
  await settingsRepository.saveMasterProfile(DEFAULT_COMPANY_ID, profile);
  res.json(profile);
}));

// Email + password login (used temporarily while OAuth is disabled).
// Both /api/master/login and /api/salesman/login go through the same handler:
// the role assigned to the session depends on the user's `isMasterSalesman`
// flag and `role` column.
const loginSchema = z.object({
  email: z.string().email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria"),
});

const passwordLoginHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw AppError.badRequest("Email o password non valida");
  }
  const email = parsed.data.email.trim().toLowerCase();
  const salesman = await userRepository.getByEmail(email);
  if (!salesman || !salesman.isActive) {
    throw AppError.unauthorized("Credenziali non valide");
  }
  if (!salesman.passwordHash || salesman.passwordHash === "GOOGLE_OAUTH_USER") {
    throw AppError.unauthorized("Credenziali non valide");
  }
  const ok = await bcrypt.compare(parsed.data.password, salesman.passwordHash);
  if (!ok) {
    throw AppError.unauthorized("Credenziali non valide");
  }

  await regenerateSession(req);
  const dbRole = salesman.role;
  const effectiveRole = salesman.isMasterSalesman
    ? "master"
    : dbRole && dbRole !== "salesman"
      ? dbRole
      : "salesman";
  req.session.salesmanId = salesman.id;
  req.session.salesmanIsMaster = salesman.isMasterSalesman ?? false;
  req.session.salesmanRole = effectiveRole;
  const sessionParentIds: number[] =
    Array.isArray(salesman.parentSalesmanIds) && salesman.parentSalesmanIds.length > 0
      ? (salesman.parentSalesmanIds as number[])
      : salesman.parentSalesmanId != null
        ? [salesman.parentSalesmanId]
        : [];
  req.session.parentSalesmanId = sessionParentIds.length > 0 ? sessionParentIds[0] : null;
  req.session.parentSalesmanIds = sessionParentIds;

  const deviceInfo =
    typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : undefined;
  const xff = req.headers["x-forwarded-for"];
  const ipAddress =
    (typeof xff === "string" ? xff.split(",")[0]?.trim() : undefined) ||
    req.socket?.remoteAddress ||
    undefined;
  try {
    await userRepository.recordLogin(salesman.id, deviceInfo, ipAddress);
  } catch (recordErr) {
    console.error("[auth] failed to record login", recordErr);
  }

  res.json({
    ok: true,
    id: salesman.id,
    email: salesman.email,
    name: salesman.name,
    isMaster: salesman.isMasterSalesman ?? false,
    role: effectiveRole,
  });
});

router.post("/api/master/login", passwordLoginHandler);
router.post("/api/salesman/login", passwordLoginHandler);

router.post("/api/master/logout", asyncHandler(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

router.post("/api/salesman/logout", asyncHandler(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

// Generic alias used by the new Login page.
router.post("/api/auth/logout", asyncHandler(async (req, res) => {
  await destroySession(req, res);
  res.json({ ok: true });
}));

router.get("/api/auth/me/dealer-check", asyncHandler(async (req, res) => {
  const dealerId = getDealerId(req);
  if (dealerId) {
    const dealer = await dealerRepository.getById(dealerId);
    if (dealer && dealer.isActive) {
      return res.json({ type: "dealer", id: dealer.id, email: dealer.email, name: dealer.name, surname: dealer.surname, linkedSalesmanId: dealer.linkedSalesmanId });
    }
    req.session.dealerId = undefined;
  }
  throw AppError.unauthorized("Not a dealer");
}));

export default router;
