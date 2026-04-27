import { Router } from "express";
import { userRepository, activityRepository } from "../repositories";
import { requireMaster } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validate, userCreateSchema, userUpdateSchema } from "../validators";
import { AppError } from "../errors";

const router = Router();

router.get("/api/users", requireMaster, asyncHandler(async (req, res) => {
  const users = await userRepository.getAll(req.companyId);
  res.json(users.map(u => ({ ...u, passwordHash: undefined, companyId: undefined })));
}));

router.get("/api/users/salesmen-list", requireMaster, asyncHandler(async (req, res) => {
  const users = await userRepository.getSalesmen(req.companyId);
  res.json(users.filter(u => (u as any).role === "salesman" || u.isMasterSalesman).map(u => ({ id: u.id, name: u.name, surname: (u as any).surname || "" })));
}));

router.get("/api/users/:id", requireMaster, asyncHandler(async (req, res) => {
  const user = await userRepository.getById(Number(req.params.id));
  if (!user || user.companyId !== req.companyId) throw AppError.notFound("User");
  res.json({ ...user, passwordHash: undefined, companyId: undefined });
}));

router.post("/api/users", requireMaster, validate(userCreateSchema), asyncHandler(async (req, res) => {
  const { email, name, surname, mobileNumber, password, features, isMasterSalesman, role, parentSalesmanIds, assignedCountries } = req.body;
  try {
    const user = await userRepository.create(req.companyId, {
      email, name, surname: surname ?? "", mobileNumber: mobileNumber ?? "", password, features,
      isMasterSalesman: role === "master" ? true : !!isMasterSalesman,
      role: role ?? "salesman",
      parentSalesmanIds: Array.isArray(parentSalesmanIds) ? parentSalesmanIds : [],
      assignedCountries: assignedCountries ?? null,
    });
    res.status(201).json({ ...user, passwordHash: undefined, companyId: undefined });
  } catch (err: unknown) {
    if (err instanceof Error && (err as Error & { code?: string }).code === "23505") {
      throw AppError.conflict("Email already exists");
    }
    throw err;
  }
}));

router.put("/api/users/:id", requireMaster, validate(userUpdateSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { email, name, surname, mobileNumber, password, features, isActive, isMasterSalesman, role, parentSalesmanIds, assignedCountries } = req.body;
  const user = await userRepository.update(id, {
    email, name, surname, mobileNumber, password, features, isActive,
    isMasterSalesman: role === "master" ? true : (isMasterSalesman !== undefined ? !!isMasterSalesman : undefined),
    role,
    parentSalesmanIds: parentSalesmanIds !== undefined ? (Array.isArray(parentSalesmanIds) ? parentSalesmanIds : []) : undefined,
    assignedCountries: assignedCountries !== undefined ? assignedCountries : undefined,
  });
  res.json({ ...user, passwordHash: undefined, companyId: undefined });
}));

router.delete("/api/users/:id", requireMaster, asyncHandler(async (req, res) => {
  await userRepository.delete(Number(req.params.id));
  res.status(204).end();
}));

router.get("/api/users/:id/logins", requireMaster, asyncHandler(async (req, res) => {
  const logins = await userRepository.getLoginHistory(Number(req.params.id));
  res.json(logins);
}));

router.get("/api/users/:id/activity", requireMaster, asyncHandler(async (req, res) => {
  const activity = await activityRepository.getBySalesmanId(Number(req.params.id));
  res.json(activity);
}));

router.get("/api/activity-logs/all", requireMaster, asyncHandler(async (req, res) => {
  const logs = await activityRepository.getAll(req.companyId);
  res.json(logs);
}));

export default router;
