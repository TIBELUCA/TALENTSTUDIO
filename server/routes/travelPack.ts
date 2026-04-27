import { Router } from "express";
import { requireAuth, getSalesmanId, isMaster } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { machineRepository, customerRepository, offerRepository, enquiryRepository, presetRepository, settingsRepository } from "../repositories";
import { machineImageStorage } from "../services";
import fs from "fs";
import path from "path";

const router = Router();

router.get("/api/travel-pack", requireAuth, asyncHandler(async (req, res) => {
  const companyId = req.companyId;
  const salesmanId = isMaster(req) ? null : getSalesmanId(req);

  const [machines, customers, enquiries, presets, documentFormat, familyDefaults] = await Promise.all([
    machineRepository.getAll(companyId),
    customerRepository.getAll(companyId),
    enquiryRepository.getAll(companyId, salesmanId),
    presetRepository.getAll(companyId),
    settingsRepository.getDocumentFormat(companyId),
    settingsRepository.getFamilyDefaults(companyId),
  ]);

  const allOffers = await offerRepository.getAll(companyId, salesmanId);
  const sortedOffers = [...allOffers].sort((a, b) => {
    const ta = new Date((a as any).updatedAt ?? (a as any).createdAt ?? 0).getTime();
    const tb = new Date((b as any).updatedAt ?? (b as any).createdAt ?? 0).getTime();
    return tb - ta;
  });

  const offerDetails = await Promise.all(
    sortedOffers.slice(0, 200).map(o => offerRepository.getById(o.id))
  ).then(arr => arr.filter(Boolean));

  const machineImages: Record<string, string> = {};
  const imgDir = machineImageStorage.getFullPath("");
  if (fs.existsSync(imgDir)) {
    for (const m of machines) {
      const desc = m.description || "";
      const imgMatches = desc.match(/\[\[IMG:([^\]]+)\]\]/g) || [];
      for (const match of imgMatches) {
        const filename = path.basename(match.replace("[[IMG:", "").replace("]]", ""));
        const fullPath = path.join(imgDir, filename);
        if (!fullPath.startsWith(imgDir)) continue;
        if (fs.existsSync(fullPath) && !machineImages[filename]) {
          try {
            const buf = fs.readFileSync(fullPath);
            const ext = path.extname(filename).toLowerCase();
            const mime = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/jpeg";
            machineImages[filename] = `data:${mime};base64,${buf.toString("base64")}`;
          } catch {}
        }
      }
      if (m.imageUrl) {
        const imgFilename = path.basename(m.imageUrl);
        const fullPath = path.join(imgDir, imgFilename);
        if (fullPath.startsWith(imgDir) && fs.existsSync(fullPath) && !machineImages[imgFilename]) {
          try {
            const buf = fs.readFileSync(fullPath);
            const ext = path.extname(imgFilename).toLowerCase();
            const mime = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/jpeg";
            machineImages[imgFilename] = `data:${mime};base64,${buf.toString("base64")}`;
          } catch {}
        }
      }
    }
  }

  const pack = {
    version: 1,
    generatedAt: new Date().toISOString(),
    companyId,
    salesmanId,
    machines,
    customers,
    enquiries,
    offers: offerDetails,
    presets,
    settings: { documentFormat, familyDefaults },
    machineImages,
  };

  res.json(pack);
}));

export default router;
