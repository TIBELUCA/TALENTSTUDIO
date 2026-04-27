import { Router } from "express";
import { presetRepository } from "../repositories";
import { api } from "@shared/routes";
import { requireSalesRole } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validate, presetCreateSchema, presetUpdateSchema } from "../validators";

const router = Router();

router.get(api.presets.list.path, requireSalesRole, asyncHandler(async (req, res) => {
  const presets = await presetRepository.getAll(req.companyId);
  res.json(presets);
}));

router.post(api.presets.create.path, requireSalesRole, validate(presetCreateSchema), asyncHandler(async (req, res) => {
  const preset = await presetRepository.create({ ...req.body, companyId: req.companyId });
  res.status(201).json(preset);
}));

router.put(api.presets.update.path, requireSalesRole, validate(presetUpdateSchema), asyncHandler(async (req, res) => {
  const preset = await presetRepository.update(Number(req.params.id), req.body);
  res.json(preset);
}));

router.delete(api.presets.delete.path, requireSalesRole, asyncHandler(async (req, res) => {
  await presetRepository.delete(Number(req.params.id));
  res.status(204).end();
}));

export default router;
