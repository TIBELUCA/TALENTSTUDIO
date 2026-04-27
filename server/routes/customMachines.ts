import { Router } from "express";
import { customMachineRepository } from "../repositories";
import { requireSalesRole, getSalesmanId, getPerformedBy } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";

const router = Router();

router.get("/api/custom-machines", requireSalesRole, asyncHandler(async (req, res) => {
  const list = await customMachineRepository.list(req.companyId);
  res.json(list);
}));

router.get("/api/custom-machines/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const machine = await customMachineRepository.getById(Number(req.params.id));
  if (!machine || machine.companyId !== req.companyId) throw AppError.notFound("Custom machine");
  res.json(machine);
}));

router.post("/api/custom-machines", requireSalesRole, asyncHandler(async (req, res) => {
  const { name, description, basePrice, imageUrl, detailImages, options, titles, descriptions } = req.body;
  if (!name?.trim()) throw AppError.badRequest("Name is required");

  const salesmanId = getSalesmanId(req);
  const createdByName = await getPerformedBy(req);

  const machine = await customMachineRepository.create({
    companyId: req.companyId,
    name: name.trim(),
    description: description || "",
    basePrice: String(basePrice ?? 0),
    imageUrl: imageUrl || null,
    detailImages: detailImages || null,
    titles: titles || null,
    descriptions: descriptions || null,
    createdBy: salesmanId || undefined,
    createdByName,
    options: (options || []).map((o: any) => ({
      name: o.name,
      price: String(o.price ?? 0),
      quantity: o.quantity ?? 1,
    })),
  });

  res.status(201).json(machine);
}));

router.put("/api/custom-machines/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await customMachineRepository.getById(id);
  if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Custom machine");

  const { name, description, basePrice, imageUrl, detailImages, options, titles, descriptions } = req.body;

  const machine = await customMachineRepository.update(id, {
    name: name?.trim(),
    description,
    basePrice: basePrice !== undefined ? String(basePrice) : undefined,
    imageUrl,
    detailImages,
    titles,
    descriptions,
    options: options ? options.map((o: any) => ({
      name: o.name,
      price: String(o.price ?? 0),
      quantity: o.quantity ?? 1,
    })) : undefined,
  });

  res.json(machine);
}));

router.delete("/api/custom-machines/:id", requireSalesRole, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await customMachineRepository.getById(id);
  if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Custom machine");
  await customMachineRepository.remove(id);
  res.json({ ok: true });
}));

export default router;
