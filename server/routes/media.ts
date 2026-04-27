import { Router } from "express";
import { settingsRepository } from "../repositories";
import { requireMaster } from "../middlewares/auth";
import { machineImageStorage } from "../services";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import multer from "multer";

const router = Router();

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, machineImageStorage.getFullPath("")),
  filename: (_req, file, cb) => {
    cb(null, file.originalname.toLowerCase());
  },
});
const imageUpload = multer({ storage: imageStorage, limits: { fileSize: 1 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (file.mimetype === 'image/png') cb(null, true);
  else cb(new Error("Only PNG files are accepted (max 1 MB)"));
}});

router.get("/api/media/import-info", requireMaster, asyncHandler(async (_req, res) => {
  const info = await settingsRepository.getMediaImportInfo();
  res.json(info);
}));

router.get("/api/media/images", requireMaster, asyncHandler(async (_req, res) => {
  const files = await machineImageStorage.list(/\.(jpe?g|png|gif|webp|svg)$/i);
  const images = await Promise.all(files.map(async (f) => {
    const s = await machineImageStorage.stat(f);
    return {
      filename: f,
      url: machineImageStorage.getUrl(f),
      size: s?.size ?? 0,
      uploadedAt: s?.mtime.toISOString() ?? new Date().toISOString(),
    };
  }));
  images.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  res.json(images);
}));

router.post("/api/media/images", requireMaster, imageUpload.array("images", 50), asyncHandler(async (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  const saved = files.map(f => ({ filename: f.filename, url: machineImageStorage.getUrl(f.filename), size: f.size }));
  res.json({ uploaded: saved.length, files: saved });
}));

router.delete("/api/media/images/:filename", requireMaster, asyncHandler(async (req, res) => {
  const filename = String(req.params.filename).replace(/[^a-zA-Z0-9_\-\.]/g, "");
  const exists = await machineImageStorage.exists(filename);
  if (!exists) throw AppError.notFound("File");
  await machineImageStorage.delete(filename);
  res.json({ ok: true });
}));

export default router;
