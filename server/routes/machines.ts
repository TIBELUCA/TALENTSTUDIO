import { Router } from "express";
import crypto from "crypto";
import { machineRepository, settingsRepository } from "../repositories";
import { api } from "@shared/routes";
import { requireSalesRole, requireRole, requireMaster, requireSpecialMachineAccess, isMaster } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { validate, machineCreateSchema, machineUpdateSchema, machineOptionCreateSchema, machineOptionUpdateSchema } from "../validators";
import { AppError } from "../errors";
import multer from "multer";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

export function expandDetailImagePlaceholders(text: string | undefined | null, detailImages: string[]): string {
  if (!text) return text ?? "";
  if (!detailImages || detailImages.length === 0) return text;
  let out = text;
  for (let i = 0; i < detailImages.length; i++) {
    const re = new RegExp(`\\[\\[IMG${i + 1}\\]\\]`, "g");
    out = out.replace(re, `[[IMG:${detailImages[i]}]]`);
  }
  return out;
}

function wsToAoA(ws: ExcelJS.Worksheet): unknown[][] {
  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const vals = row.values as unknown[];
    const arr: unknown[] = [];
    for (let i = 1; i < vals.length; i++) {
      const v = vals[i];
      if (v != null && typeof v === "object" && "richText" in (v as object)) {
        arr.push((v as any).richText.map((rt: any) => rt.text).join(""));
      } else if (v != null && typeof v === "object" && "text" in (v as object) && "hyperlink" in (v as object)) {
        arr.push((v as any).text);
      } else {
        arr.push(v ?? null);
      }
    }
    rows.push(arr);
  });
  return rows;
}

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const MACHINE_IMAGES_DIR = path.join(process.cwd(), "server", "assets", "machine-images");
if (!fs.existsSync(MACHINE_IMAGES_DIR)) fs.mkdirSync(MACHINE_IMAGES_DIR, { recursive: true });

const machineImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MACHINE_IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    const timestamp = Date.now();
    cb(null, `machine-${req.params.id}-${timestamp}${ext}`);
  },
});
const machineImageUpload = multer({
  storage: machineImageStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are accepted"));
  },
});

router.get("/api/machines/families", requireRole("salesman", "backoffice", "tecnico"), asyncHandler(async (req, res) => {
  const families = await machineRepository.getFamilies(req.companyId);
  res.json(families);
}));

router.get("/api/machines/family/:family", requireRole("salesman", "backoffice", "tecnico"), asyncHandler(async (req, res) => {
  const family = decodeURIComponent(req.params.family as string);
  const machines = await machineRepository.getByFamily(req.companyId, family);
  res.json(machines);
}));

router.get("/api/machines/:id", requireRole("salesman", "backoffice", "tecnico"), asyncHandler(async (req, res) => {
  const machine = await machineRepository.getById(Number(req.params.id));
  if (!machine || machine.companyId !== req.companyId) throw AppError.notFound("Machine");
  res.json(machine);
}));

router.post("/api/machines/:id/image", requireSpecialMachineAccess, machineImageUpload.single("image"), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest("No file uploaded");
  const machine = await machineRepository.getById(Number(req.params.id));
  if (!machine || machine.companyId !== req.companyId) throw AppError.notFound("Machine");
  if (machine.source !== "manual" && !isMaster(req)) {
    throw AppError.forbidden("Only masters can modify non-special machines");
  }
  const imageUrl = req.file.filename;
  await machineRepository.update(Number(req.params.id), { imageUrl });
  res.json({ imageUrl });
}));

router.get(api.machines.list.path, requireRole("salesman", "backoffice", "tecnico"), asyncHandler(async (req, res) => {
  const machines = await machineRepository.getAll(req.companyId);
  res.json(machines);
}));

router.post(api.machines.create.path, requireSpecialMachineAccess, validate(machineCreateSchema), asyncHandler(async (req, res) => {
  const data = { ...req.body };
  const isSpecialMachine = data.macroType === "SPECIAL" || data.macroType === "Speciale" || data.source === "manual";
  if (!isSpecialMachine && !isMaster(req)) {
    throw AppError.forbidden("Only masters can create non-special machines");
  }
  if (isSpecialMachine) {
    data.source = "manual";
  }
  const machine = await machineRepository.create(data, req.companyId);
  res.status(201).json(machine);
}));

router.put(api.machines.update.path, requireSpecialMachineAccess, validate(machineUpdateSchema), asyncHandler(async (req, res) => {
  const existing = await machineRepository.getById(Number(req.params.id));
  if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Machine");
  if (existing.source !== "manual" && !isMaster(req)) {
    throw AppError.forbidden("Only masters can modify non-special machines");
  }
  const machine = await machineRepository.update(Number(req.params.id), req.body);
  res.json(machine);
}));

router.delete(api.machines.deleteMachine.path, requireSpecialMachineAccess, asyncHandler(async (req, res) => {
  const existing = await machineRepository.getById(Number(req.params.id));
  if (!existing || existing.companyId !== req.companyId) throw AppError.notFound("Machine");
  if (existing.source !== "manual" && !isMaster(req)) {
    throw AppError.forbidden("Only masters can delete non-special machines");
  }
  await machineRepository.delete(Number(req.params.id));
  res.status(204).end();
}));

router.post(api.machines.import.path, requireMaster, upload.single("file"), asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest("No file uploaded");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const isMO = (v: unknown) => v != null && /^[MmOo]$/.test(String(v).trim());

  let bestWorksheet = workbook.worksheets[0];
  let bestSheetScore = 0;
  for (const ws of workbook.worksheets) {
    const rows = wsToAoA(ws);
    const score = rows.slice(0, 50).reduce((acc, row) => acc + (row.some(isMO) ? 1 : 0), 0);
    if (score > bestSheetScore) { bestSheetScore = score; bestWorksheet = ws; }
  }

  const rawRows: unknown[][] = wsToAoA(bestWorksheet);

  const sampleRows = rawRows.slice(0, 30);
  let typeColIndex = 0;
  let bestCount = 0;
  for (let col = 0; col < 5; col++) {
    const count = sampleRows.filter(r => isMO(r[col])).length;
    if (count > bestCount) { bestCount = count; typeColIndex = col; }
  }

  const colOffset = typeColIndex;

  const langKeys = ["it", "en", "de", "fr", "es", "pt"] as const;
  const titleHeaderPatterns = [
    /titolo\s*italiano|title\s*it/i,
    /titolo\s*inglese|title\s*en/i,
    /titolo\s*tedesco|title\s*de/i,
    /titolo\s*francese|title\s*fr/i,
    /titolo\s*spagnolo|title\s*es/i,
    /titolo\s*portoghe|title\s*pt/i,
  ];
  const descHeaderPatterns = [
    /descri.*italiano|descri.*it\b/i,
    /descri.*inglese|descri.*en\b/i,
    /descri.*tedesco|descri.*de\b/i,
    /descri.*francese|descri.*fr\b/i,
    /descri.*spagnolo|descri.*es\b/i,
    /descri.*portoghe|descri.*pt\b/i,
  ];

  const headerRow = rawRows[0] ?? [];
  const titleColIndices: (number | null)[] = langKeys.map((_, li) => {
    const idx = headerRow.findIndex((cell: unknown) =>
      cell != null && titleHeaderPatterns[li].test(String(cell))
    );
    return idx >= 0 ? idx : null;
  });
  const descColIndices: (number | null)[] = langKeys.map((_, li) => {
    const idx = headerRow.findIndex((cell: unknown) =>
      cell != null && descHeaderPatterns[li].test(String(cell))
    );
    return idx >= 0 ? idx : null;
  });

  const titleFallbackOffsets = [4, 5, 6, 7, 8, 9];
  const descFallbackOffsets = [16, 17, 18, 19, 20, 21];

  function findCol(pattern: RegExp, fallback: number): number {
    const idx = headerRow.findIndex((cell: unknown) => cell != null && pattern.test(String(cell)));
    return idx >= 0 ? idx : fallback;
  }

  const seqColIndex = findCol(/\brif|seq|ref\b/i, 1 + colOffset);
  const codeColIndex = findCol(/codice|code|riferimento/i, 2 + colOffset);
  const familyColIndex = findCol(/famiglia|family|macro/i, 3 + colOffset);
  const priceColIndex = findCol(/prezz|price|listino/i, 10 + colOffset);
  const electricalPowerColIndex = findCol(/potenza.*elettr|electrical.*power/i, 11 + colOffset);
  const compressedAirColIndex = findCol(/aria.*compress|compressed.*air/i, 12 + colOffset);
  const exhaustedAirColIndex = findCol(/aria.*aspir|exhausted.*air/i, 13 + colOffset);
  const airIntroducedColIndex = findCol(/aria.*immes|air.*introd/i, 14 + colOffset);
  const installationDaysColIndex = findCol(/giorni.*mont|install.*days/i, 15 + colOffset);
  const imageColIndex = findCol(/immag|image|foto|photo/i, 22 + colOffset);

  function readLangField(row: unknown[], indices: (number | null)[], fallbackOffsets: number[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (let i = 0; i < langKeys.length; i++) {
      const colIdx = indices[i] ?? (fallbackOffsets[i] + colOffset);
      const val = row[colIdx];
      if (val != null && String(val).trim()) {
        result[langKeys[i]] = String(val).trim();
      }
    }
    return result;
  }

  function parseEuropeanNumber(val: unknown): number {
    if (val == null) return 0;
    if (typeof val === 'number') return val;
    let s = String(val).trim();
    if (!s) return 0;
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (hasComma) {
      s = s.replace(',', '.');
    }
    s = s.replace(/[^0-9.\-]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  const parsedRows: Parameters<typeof machineRepository.importMachines>[0] = [];

  const dataRows = rawRows.slice(1);
  for (const row of dataRows) {
    const typeRaw = String(row[typeColIndex] ?? '').trim().toUpperCase();
    if (typeRaw !== 'M' && typeRaw !== 'O') continue;

    const type = typeRaw as 'M' | 'O';
    const code = String(row[codeColIndex] ?? '').trim();
    if (!code) continue;

    const titles = readLangField(row as unknown[], titleColIndices, titleFallbackOffsets);
    const name = titles.it || String(row[titleColIndices[0] ?? (4 + colOffset)] ?? '').trim();
    if (!name) continue;

    const rawImageCol = row[imageColIndex] != null ? String(row[imageColIndex]).trim() : undefined;
    let imageName: string | undefined;
    let detailImages: string[] = [];
    if (rawImageCol) {
      const imageNames = rawImageCol.split(",").map((s: string) => {
        let n = s.trim().toLowerCase();
        if (n && !n.match(/\.\w+$/)) n += ".png";
        return n;
      }).filter(Boolean);
      imageName = imageNames[0];
      detailImages = imageNames.slice(1);
    }

    const rawPrice = row[priceColIndex];
    const price = parseEuropeanNumber(rawPrice);

    const toNum = (val: unknown) => {
      if (val == null || val === '') return undefined;
      if (typeof val === 'number') return val;
      const s = String(val).trim();
      if (!s) return undefined;
      const n = parseEuropeanNumber(val);
      return isNaN(n) ? undefined : n;
    };

    const seqRaw = row[seqColIndex];
    const seqNum = seqRaw != null ? parseInt(String(seqRaw).replace(/[^0-9]/g, '')) : undefined;

    const descriptions = readLangField(row as unknown[], descColIndices, descFallbackOffsets);
    if (detailImages.length > 0) {
      for (const lang of Object.keys(descriptions)) {
        descriptions[lang] = expandDetailImagePlaceholders(descriptions[lang], detailImages);
      }
    }
    const description = (() => {
      let desc = descriptions.it || (row[descColIndices[0] ?? (11 + colOffset)] != null ? String(row[descColIndices[0] ?? (11 + colOffset)]).trim() : undefined);
      if (desc && detailImages.length > 0) {
        desc = expandDetailImagePlaceholders(desc, detailImages);
      }
      return desc;
    })();

    parsedRows.push({
      type,
      seqNum: seqNum != null && !isNaN(seqNum) ? seqNum : undefined,
      code,
      macroType: type === 'M' ? String(row[familyColIndex] ?? '').trim() || undefined : undefined,
      name,
      titles: Object.keys(titles).length > 0 ? titles : undefined,
      price: isNaN(price) ? 0 : price,
      electricalPower: toNum(row[electricalPowerColIndex]),
      compressedAir: toNum(row[compressedAirColIndex]),
      exhaustedAir: toNum(row[exhaustedAirColIndex]),
      airIntroduced: toNum(row[airIntroducedColIndex]),
      installationDays: toNum(row[installationDaysColIndex]),
      description,
      descriptions: Object.keys(descriptions).length > 0 ? descriptions : undefined,
      imageName,
    });
  }
  if (parsedRows.length === 0) {
    throw AppError.badRequest(`No valid machine rows found in sheet "${bestSheet}". Ensure column A contains "M" (machine) or "O" (option).`);
  }

  const result = await machineRepository.importMachines(parsedRows, req.companyId);
  await settingsRepository.saveMediaImportInfo({
    filename: req.file.originalname,
    importedAt: new Date().toISOString(),
    machines: result.machinesCreated,
    options: result.optionsCreated,
  });

  const fileHash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
  await settingsRepository.createCatalogImport(req.companyId, {
    filename: req.file.originalname,
    fileHash,
    machineCount: result.machinesCreated,
    optionCount: result.optionsCreated,
  });

  res.json({
    machines: result.machinesCreated,
    options: result.optionsCreated,
    optionsSkipped: result.optionsSkipped,
    skippedCodes: result.skippedCodes,
  });
}));

router.post(api.machineOptions.create.path, requireSpecialMachineAccess, validate(machineOptionCreateSchema), asyncHandler(async (req, res) => {
  const machine = await machineRepository.getById(Number(req.params.machineId));
  if (!machine || machine.companyId !== req.companyId) throw AppError.notFound("Machine");
  if (machine.source !== "manual" && !isMaster(req)) {
    throw AppError.forbidden("Only masters can modify non-special machines");
  }
  const option = await machineRepository.createOption({
    ...req.body,
    machineId: Number(req.params.machineId),
    companyId: req.companyId,
  });
  res.status(201).json(option);
}));

router.put(api.machineOptions.update.path, requireSpecialMachineAccess, validate(machineOptionUpdateSchema), asyncHandler(async (req, res) => {
  const existingOption = await machineRepository.getOptionById(Number(req.params.optionId));
  if (!existingOption) throw AppError.notFound("Option");
  const machine = await machineRepository.getById(existingOption.machineId);
  if (!machine || machine.companyId !== req.companyId) throw AppError.notFound("Machine");
  if (machine.source !== "manual" && !isMaster(req)) {
    throw AppError.forbidden("Only masters can modify non-special machines");
  }
  const option = await machineRepository.updateOption(Number(req.params.optionId), req.body);
  res.json(option);
}));

router.post("/api/machines/migrate-detail-image-placeholders", requireMaster, asyncHandler(async (req, res) => {
  const { db } = await import("../repositories/base");
  const { machines, machineOptions, offerItems } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");

  const extractDetailImagesFromDesc = (desc: string | null | undefined): string[] => {
    if (!desc) return [];
    const matches = Array.from(desc.matchAll(/\[\[IMG:([^\]]+)\]\]/g));
    return matches.map(m => m[1].trim()).filter(Boolean);
  };

  const countUnresolvedPlaceholders = (text: string, listLength: number): number => {
    const matches = Array.from(text.matchAll(/\[\[IMG(\d+)\]\]/g));
    let n = 0;
    for (const m of matches) {
      const idx = Number(m[1]);
      if (!Number.isFinite(idx) || idx < 1 || idx > listLength) n++;
    }
    return n;
  };

  const stats = {
    machinesScanned: 0,
    machinesUpdated: 0,
    optionsScanned: 0,
    optionsUpdated: 0,
    offerItemsScanned: 0,
    offerItemsUpdated: 0,
    unresolvedPlaceholders: 0,
  };

  const allMachines = await db.select().from(machines).where(eq(machines.companyId, req.companyId));
  for (const m of allMachines) {
    stats.machinesScanned++;
    const detailImages = extractDetailImagesFromDesc(m.description);
    if (detailImages.length === 0) continue;
    const descs = (m.descriptions || {}) as Record<string, string>;
    let changed = false;
    const newDescs: Record<string, string> = {};
    for (const lang of Object.keys(descs)) {
      const original = descs[lang];
      const expanded = expandDetailImagePlaceholders(original, detailImages);
      newDescs[lang] = expanded;
      if (expanded !== original) changed = true;
      stats.unresolvedPlaceholders += countUnresolvedPlaceholders(expanded, detailImages.length);
    }
    const newDescription = m.description ? expandDetailImagePlaceholders(m.description, detailImages) : m.description;
    if (newDescription !== m.description) changed = true;
    if (changed) {
      await db.update(machines).set({ descriptions: newDescs, description: newDescription }).where(eq(machines.id, m.id));
      stats.machinesUpdated++;
    }
  }

  const allOptions = await db.select().from(machineOptions).where(eq(machineOptions.companyId, req.companyId));
  for (const o of allOptions) {
    stats.optionsScanned++;
    const detailImages = extractDetailImagesFromDesc(o.description);
    if (detailImages.length === 0) continue;
    const descs = (o.descriptions || {}) as Record<string, string>;
    let changed = false;
    const newDescs: Record<string, string> = {};
    for (const lang of Object.keys(descs)) {
      const original = descs[lang];
      const expanded = expandDetailImagePlaceholders(original, detailImages);
      newDescs[lang] = expanded;
      if (expanded !== original) changed = true;
      stats.unresolvedPlaceholders += countUnresolvedPlaceholders(expanded, detailImages.length);
    }
    const newOptDescription = o.description ? expandDetailImagePlaceholders(o.description, detailImages) : o.description;
    if (newOptDescription !== o.description) changed = true;
    if (changed) {
      await db.update(machineOptions).set({ descriptions: newDescs, description: newOptDescription }).where(eq(machineOptions.id, o.id));
      stats.optionsUpdated++;
    }
  }

  // Also migrate snapshot_descriptions on existing offer_items (per-language jsonb)
  // that were created before the placeholder-resolution logic was introduced.
  // We derive the detail-image filename list from the already-resolved flat
  // `snapshotMachineDescription`; if that one is ALSO still positional, we fall
  // back to re-scanning the currently linked machine's description.
  const machineDetailImagesCache = new Map<number, string[]>();
  const getMachineDetailImages = async (machineId: number | null): Promise<string[]> => {
    if (!machineId) return [];
    if (machineDetailImagesCache.has(machineId)) return machineDetailImagesCache.get(machineId)!;
    const [m] = await db.select().from(machines).where(eq(machines.id, machineId));
    const list = m ? extractDetailImagesFromDesc(m.description) : [];
    machineDetailImagesCache.set(machineId, list);
    return list;
  };

  const allOfferItems = await db.select().from(offerItems).where(eq(offerItems.companyId, req.companyId));
  for (const it of allOfferItems) {
    stats.offerItemsScanned++;
    let detailImages = extractDetailImagesFromDesc(it.snapshotMachineDescription);
    if (detailImages.length === 0) {
      detailImages = await getMachineDetailImages(it.machineId);
    }
    if (detailImages.length === 0) continue;

    let changed = false;
    // Flat field (already usually resolved, but patch just in case).
    const newSnapDesc = it.snapshotMachineDescription
      ? expandDetailImagePlaceholders(it.snapshotMachineDescription, detailImages)
      : it.snapshotMachineDescription;
    if (newSnapDesc !== it.snapshotMachineDescription) changed = true;

    // Per-language jsonb (this is what the UI actually renders).
    const descs = (it.snapshotDescriptions || {}) as Record<string, string>;
    const newDescs: Record<string, string> = {};
    for (const lang of Object.keys(descs)) {
      const original = descs[lang];
      const expanded = expandDetailImagePlaceholders(original, detailImages);
      newDescs[lang] = expanded;
      if (expanded !== original) changed = true;
      stats.unresolvedPlaceholders += countUnresolvedPlaceholders(expanded, detailImages.length);
    }

    if (changed) {
      await db
        .update(offerItems)
        .set({
          snapshotMachineDescription: newSnapDesc ?? it.snapshotMachineDescription,
          snapshotDescriptions: Object.keys(newDescs).length > 0 ? newDescs : it.snapshotDescriptions,
        })
        .where(eq(offerItems.id, it.id));
      stats.offerItemsUpdated++;
    }
  }

  res.json(stats);
}));

router.delete(api.machineOptions.delete.path, requireSpecialMachineAccess, asyncHandler(async (req, res) => {
  const existingOption = await machineRepository.getOptionById(Number(req.params.optionId));
  if (!existingOption) throw AppError.notFound("Option");
  const machine = await machineRepository.getById(existingOption.machineId);
  if (!machine || machine.companyId !== req.companyId) throw AppError.notFound("Machine");
  if (machine.source !== "manual" && !isMaster(req)) {
    throw AppError.forbidden("Only masters can delete non-special machines");
  }
  await machineRepository.deleteOption(Number(req.params.optionId));
  res.status(204).end();
}));

export default router;
