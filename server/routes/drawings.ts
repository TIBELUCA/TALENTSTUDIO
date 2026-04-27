import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { db, eq, desc, and, sql } from "../repositories/base";
import { drawings, drawingRequests, salesmanUsers, notifications, offers, customers, offerItems, drawingMachines, machines } from "@shared/schema";
import { requireSalesmanOrMaster, requireRole, getSalesmanId, getUserRole, isMaster, getPerformedBy, isAuthenticatedAny } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { AppError } from "../errors";
import { drawingsFileStorage, drawingAttachmentStorage } from "../services";
import { extractAndMatchMachines } from "../services/drawingMachines";
import { queueDrawing as driveQueueDrawing, queueDrawingRequest as driveQueueDrawingRequest, queueOffer as driveQueueOffer } from "../services/googleDrive";

const router = Router();

const drawingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, drawingsFileStorage.getFullPath("")),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `drawing-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, drawingAttachmentStorage.getFullPath("")),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `attach-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get("/drawings-files/:filename", (req, res) => {
  if (!isAuthenticatedAny(req)) return res.status(401).json({ message: "Unauthorized" });
  const filename = path.basename(req.params.filename);
  const fullPath = drawingsFileStorage.getFullPath(filename);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ message: "File not found" });
  return res.sendFile(fullPath);
});

router.get("/drawing-attachments/:filename", (req, res) => {
  if (!isAuthenticatedAny(req)) return res.status(401).json({ message: "Unauthorized" });
  const filename = path.basename(req.params.filename);
  const fullPath = drawingAttachmentStorage.getFullPath(filename);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ message: "File not found" });
  return res.sendFile(fullPath);
});

router.get("/api/drawings", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const salesmanId = getSalesmanId(req);
  const role = getUserRole(req);
  const masterUser = isMaster(req);
  const customerId = req.query.customerId ? Number(req.query.customerId) : null;
  const offerId = req.query.offerId ? Number(req.query.offerId) : null;

  const conditions: ReturnType<typeof eq>[] = [];
  if (req.companyId) conditions.push(eq(drawings.companyId, req.companyId));
  if (customerId) conditions.push(eq(drawings.customerId, customerId));
  if (offerId) conditions.push(eq(drawings.offerId, offerId));

  const rows = await db
    .select()
    .from(drawings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(drawings.createdAt));

  res.json(rows);
}));

router.get("/api/drawings/:id", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const [row] = await db.select().from(drawings).where(eq(drawings.id, id));
  if (!row) throw AppError.notFound("Disegno non trovato");
  if (req.companyId && row.companyId !== req.companyId) throw AppError.notFound("Disegno non trovato");
  res.json(row);
}));

router.post(
  "/api/drawings",
  requireRole("tecnico_commerciale"),
  drawingUpload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "dwg", maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const salesmanId = getSalesmanId(req);
    if (!salesmanId && !isMaster(req)) throw AppError.unauthorized();

    const { customerId, notes, offerId, requestId } = req.body;
    if (!customerId) throw AppError.badRequest("customerId obbligatorio");

    const files = req.files as Record<string, Express.Multer.File[]>;
    const pdfFile = files?.pdf?.[0];
    const dwgFile = files?.dwg?.[0];

    // PDF is mandatory when not fulfilling an existing request
    if (!requestId && !pdfFile) throw AppError.badRequest("Il file PDF è obbligatorio");

    // Validate linked request BEFORE inserting drawing to avoid orphaned rows
    let targetRequest: typeof drawingRequests.$inferSelect | undefined;
    if (requestId) {
      const reqId = Number(requestId);
      const reqConditions: ReturnType<typeof eq>[] = [
        eq(drawingRequests.id, reqId),
        eq(drawingRequests.status, "pending"),
      ];
      if (req.companyId) reqConditions.push(eq(drawingRequests.companyId, req.companyId));
      const [found] = await db.select().from(drawingRequests).where(and(...reqConditions));
      if (!found) {
        // Clean up uploaded files to avoid orphans
        if (pdfFile) try { await drawingsFileStorage.delete(pdfFile.filename); } catch {}
        if (dwgFile) try { await drawingsFileStorage.delete(dwgFile.filename); } catch {}
        throw AppError.notFound("Richiesta non trovata, non in attesa o appartiene a un'altra azienda");
      }
      targetRequest = found;
    }

    // When fulfilling a request, derive customer/offer from validated request row
    // to prevent client-side spoofing of mismatched IDs
    const resolvedCustomerId = targetRequest ? targetRequest.customerId : Number(customerId);
    const resolvedOfferId = targetRequest ? targetRequest.offerId : (offerId ? Number(offerId) : null);

    const [inserted] = await db.insert(drawings).values({
      companyId: req.companyId ?? null,
      createdByUserId: salesmanId ?? 0,
      customerId: resolvedCustomerId,
      notes: notes ?? "",
      pdfFilename: pdfFile?.filename ?? null,
      pdfOriginalName: pdfFile?.originalname ?? null,
      dwgFilename: dwgFile?.filename ?? null,
      dwgOriginalName: dwgFile?.originalname ?? null,
      offerId: resolvedOfferId,
      requestId: requestId ? Number(requestId) : null,
    }).returning();

    if (requestId && targetRequest) {
      const reqId = Number(requestId);

      const [updatedRequest] = await db
        .update(drawingRequests)
        .set({ status: "fulfilled", fulfilledAt: new Date() })
        .where(eq(drawingRequests.id, reqId))
        .returning();

      if (updatedRequest && updatedRequest.requestedByUserId) {
        const [tecUser] = salesmanId
          ? await db.select().from(salesmanUsers).where(eq(salesmanUsers.id, salesmanId))
          : [];
        const tecName = tecUser
          ? `${tecUser.name} ${tecUser.surname}`.trim()
          : "Tecnico Commerciale";

        await db.insert(notifications).values([{
          companyId: req.companyId ?? null,
          recipientUserId: updatedRequest.requestedByUserId,
          senderUserId: salesmanId ?? null,
          type: "drawing_fulfilled",
          title: "Disegno caricato",
          message: `${tecName} ha caricato un disegno per la tua richiesta #${reqId}.`,
          isRead: false,
        }]);
      }
    }

    driveQueueDrawing(inserted.id).catch(err => console.error("[drive] queue drawing failed:", err));

    res.status(201).json(inserted);
  }),
);

router.delete("/api/drawings/:id", requireRole("tecnico_commerciale"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const salesmanId = getSalesmanId(req);
  const masterUser = isMaster(req);
  const [row] = await db.select().from(drawings).where(eq(drawings.id, id));
  if (!row) throw AppError.notFound("Disegno non trovato");
  if (req.companyId && row.companyId !== req.companyId) throw AppError.notFound("Disegno non trovato");
  if (!masterUser && row.createdByUserId !== salesmanId) throw AppError.forbidden("Non autorizzato a eliminare questo disegno");

  if (row.pdfFilename) {
    try { await drawingsFileStorage.delete(row.pdfFilename); } catch {}
  }
  if (row.dwgFilename) {
    try { await drawingsFileStorage.delete(row.dwgFilename); } catch {}
  }

  await db.delete(drawings).where(eq(drawings.id, id));
  res.json({ ok: true });
}));

router.get("/api/drawing-requests", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const salesmanId = getSalesmanId(req);
  const role = getUserRole(req);
  const masterUser = isMaster(req);

  const conditions: ReturnType<typeof eq>[] = [];
  if (req.companyId) conditions.push(eq(drawingRequests.companyId, req.companyId));

  // tecnico_commerciale and master see all requests; salesman/backoffice see only their own
  if (!masterUser && role !== "tecnico_commerciale") {
    if (salesmanId) conditions.push(eq(drawingRequests.requestedByUserId, salesmanId));
  }

  const rows = await db
    .select()
    .from(drawingRequests)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(drawingRequests.createdAt));

  // Enrich with offer reference, subject, machine list (distinta macchine), and customer name
  const enriched = await Promise.all(rows.map(async (row) => {
    let offerRef: string | null = null;
    let offerSubject: string | null = null;
    let machineSummary: { machineName: string; quantity: number }[] = [];
    if (row.offerId) {
      const [offer] = await db.select({ referenceNumber: offers.referenceNumber, subject: offers.subject }).from(offers).where(eq(offers.id, row.offerId));
      offerRef = offer?.referenceNumber ?? null;
      offerSubject = offer?.subject ?? null;
      const items = await db.select({ machineName: offerItems.snapshotMachineName, quantity: offerItems.quantity }).from(offerItems).where(eq(offerItems.offerId, row.offerId));
      machineSummary = items.map(i => ({ machineName: i.machineName, quantity: i.quantity }));
    }
    const [customer] = await db.select({ name: customers.name, company: customers.company }).from(customers).where(eq(customers.id, row.customerId));
    const customerName = customer?.company ?? customer?.name ?? null;
    return { ...row, offerRef, offerSubject, customerName, machineSummary };
  }));

  res.json(enriched);
}));

router.post(
  "/api/drawing-requests",
  requireSalesmanOrMaster,
  attachmentUpload.single("attachment"),
  asyncHandler(async (req, res) => {
    const salesmanId = getSalesmanId(req);
    if (!salesmanId && !isMaster(req)) throw AppError.unauthorized();

    // tecnico_commerciale fulfills requests but does not create them
    const requesterRole = getUserRole(req);
    if (requesterRole === "tecnico_commerciale") throw AppError.forbidden("Il tecnico commerciale non può creare richieste");

    const { offerId, customerId, notes } = req.body;
    if (!customerId) throw AppError.badRequest("customerId è obbligatorio");
    if (!notes || !notes.trim()) throw AppError.badRequest("Le note sono obbligatorie");

    const attachFile = req.file;

    const [inserted] = await db.insert(drawingRequests).values({
      companyId: req.companyId ?? null,
      offerId: offerId ? Number(offerId) : null,
      customerId: Number(customerId),
      requestedByUserId: salesmanId ?? 0,
      notes: notes ?? "",
      attachmentFilename: attachFile?.filename ?? null,
      attachmentOriginalName: attachFile?.originalname ?? null,
      status: "pending",
    }).returning();

    const tcConditions: ReturnType<typeof eq>[] = [
      eq(salesmanUsers.role, "tecnico_commerciale"),
      eq(salesmanUsers.isActive, true),
    ];
    if (req.companyId) tcConditions.push(eq(salesmanUsers.companyId, req.companyId));
    const tcUsers = await db.select().from(salesmanUsers).where(and(...tcConditions));

    let offerRef = offerId ? `#${offerId}` : "(bozza)";
    if (offerId) {
      const [offer] = await db.select().from(offers).where(eq(offers.id, Number(offerId)));
      offerRef = offer?.referenceNumber ?? `#${offerId}`;
    }

    const [senderUser] = salesmanId
      ? await db.select().from(salesmanUsers).where(eq(salesmanUsers.id, salesmanId))
      : [];
    const senderName = senderUser
      ? `${senderUser.name} ${senderUser.surname}`.trim()
      : (isMaster(req) ? "Master" : "Utente");

    if (tcUsers.length > 0) {
      const notifValues = tcUsers.map(u => ({
        companyId: req.companyId ?? null,
        recipientUserId: u.id,
        senderUserId: salesmanId ?? null,
        type: "drawing_request",
        title: "Nuova richiesta disegno",
        message: `${senderName} ha richiesto un disegno per l'offerta ${offerRef}.`,
        isRead: false,
      }));
      await db.insert(notifications).values(notifValues);
    }

    driveQueueDrawingRequest(inserted.id).catch(err => console.error("[drive] queue drawing request failed:", err));

    res.status(201).json(inserted);
  }),
);

router.patch("/api/drawing-requests/:id/link-offer", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const salesmanId = getSalesmanId(req);
  const masterUser = isMaster(req);
  const { offerId } = req.body;
  if (!offerId) throw AppError.badRequest("offerId obbligatorio");

  const conditions: ReturnType<typeof eq>[] = [eq(drawingRequests.id, id)];
  if (req.companyId) conditions.push(eq(drawingRequests.companyId, req.companyId));
  if (!masterUser && salesmanId) conditions.push(eq(drawingRequests.requestedByUserId, salesmanId));

  const [row] = await db.select().from(drawingRequests).where(and(...conditions));
  if (!row) throw AppError.notFound("Richiesta non trovata");

  const [updated] = await db
    .update(drawingRequests)
    .set({ offerId: Number(offerId) })
    .where(eq(drawingRequests.id, id))
    .returning();

  driveQueueDrawingRequest(updated.id).catch(err => console.error("[drive] queue request after link failed:", err));
  driveQueueOffer(Number(offerId)).catch(err => console.error("[drive] queue offer after link failed:", err));

  res.json(updated);
}));

router.patch("/api/drawing-requests/:id/fulfill", requireRole("tecnico_commerciale"), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const [row] = await db.select().from(drawingRequests).where(eq(drawingRequests.id, id));
  if (!row) throw AppError.notFound("Richiesta non trovata");
  if (req.companyId && row.companyId !== req.companyId) throw AppError.notFound("Richiesta non trovata");

  const [updated] = await db
    .update(drawingRequests)
    .set({ status: "fulfilled", fulfilledAt: new Date() })
    .where(eq(drawingRequests.id, id))
    .returning();

  if (updated && updated.requestedByUserId) {
    const salesmanId = getSalesmanId(req);
    const [tecUser] = salesmanId
      ? await db.select().from(salesmanUsers).where(eq(salesmanUsers.id, salesmanId))
      : [];
    const tecName = tecUser
      ? `${tecUser.name} ${tecUser.surname}`.trim()
      : "Tecnico Commerciale";

    await db.insert(notifications).values([{
      companyId: req.companyId ?? null,
      recipientUserId: updated.requestedByUserId,
      senderUserId: salesmanId ?? null,
      type: "drawing_fulfilled",
      title: "Richiesta disegno evasa",
      message: `${tecName} ha evaso la tua richiesta disegno #${id}.`,
      isRead: false,
    }]);
  }

  res.json(updated);
}));

router.get("/api/drawing-machines/catalog", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const conditions: ReturnType<typeof eq>[] = [];
  if (req.companyId) conditions.push(eq(machines.companyId, req.companyId));
  const rows = await db
    .select({ id: machines.id, name: machines.name, machineCode: machines.machineCode, macroType: machines.macroType })
    .from(machines)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  res.json(rows);
}));

router.post("/api/drawings/:id/extract-machines", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");
  const [drawing] = await db.select().from(drawings).where(eq(drawings.id, id));
  if (!drawing) throw AppError.notFound("Disegno non trovato");
  if (req.companyId && drawing.companyId !== req.companyId) throw AppError.notFound("Disegno non trovato");
  if (!drawing.pdfFilename) throw AppError.badRequest("Il disegno non ha un file PDF");

  const result = await extractAndMatchMachines(id);
  res.json(result);
}));

router.get("/api/drawing-machines", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const drawingId = req.query.drawingId ? Number(req.query.drawingId) : null;

  if (drawingId) {
    const [parentDrawing] = await db.select().from(drawings).where(eq(drawings.id, drawingId));
    if (!parentDrawing) throw AppError.notFound("Disegno non trovato");
    if (req.companyId && parentDrawing.companyId !== req.companyId) throw AppError.notFound("Disegno non trovato");
  }

  const companyDrawingIds = await db
    .select({ id: drawings.id })
    .from(drawings)
    .where(req.companyId ? eq(drawings.companyId, req.companyId) : undefined);
  const allowedDrawingIds = new Set(companyDrawingIds.map(d => d.id));

  const conditions: ReturnType<typeof eq>[] = [];
  if (drawingId) conditions.push(eq(drawingMachines.drawingId, drawingId));

  const rows = await db
    .select()
    .from(drawingMachines)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(drawingMachines.drawingId, drawingMachines.id);

  const scopedRows = rows.filter(r => allowedDrawingIds.has(r.drawingId));

  const enriched = await Promise.all(scopedRows.map(async (row) => {
    let matchedMachineName: string | null = null;
    let matchedMachineCode: string | null = null;
    if (row.matchedMachineId) {
      const [m] = await db.select({ name: machines.name, machineCode: machines.machineCode }).from(machines).where(eq(machines.id, row.matchedMachineId));
      matchedMachineName = m?.name ?? null;
      matchedMachineCode = m?.machineCode ?? null;
    }
    return { ...row, matchedMachineName, matchedMachineCode };
  }));

  res.json(enriched);
}));

type EnrichedDrawingMachine = typeof drawingMachines.$inferSelect & {
  matchedMachineName: string | null;
  matchedMachineCode: string | null;
};

type DrawingMachineGroup = {
  drawing: typeof drawings.$inferSelect;
  machines: EnrichedDrawingMachine[];
};

router.get("/api/drawing-machines/by-drawing", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const drawingConditions: ReturnType<typeof eq>[] = [];
  if (req.companyId) drawingConditions.push(eq(drawings.companyId, req.companyId));

  const companyDrawings = await db
    .select()
    .from(drawings)
    .where(drawingConditions.length > 0 ? and(...drawingConditions) : undefined);

  const drawingMap = new Map(companyDrawings.map(d => [d.id, d]));
  const drawingIds = companyDrawings.map(d => d.id);

  if (drawingIds.length === 0) {
    res.json([]);
    return;
  }

  const scopedDrawingMachines = await db
    .select()
    .from(drawingMachines)
    .where(sql`${drawingMachines.drawingId} IN (${sql.join(drawingIds.map(id => sql`${id}`), sql`, `)})`)
    .orderBy(drawingMachines.drawingId, drawingMachines.id);

  const machineIds = [...new Set(scopedDrawingMachines.filter(dm => dm.matchedMachineId).map(dm => dm.matchedMachineId!))];
  const machineList = machineIds.length > 0
    ? await db.select({ id: machines.id, name: machines.name, machineCode: machines.machineCode }).from(machines).where(sql`${machines.id} IN (${sql.join(machineIds.map(id => sql`${id}`), sql`, `)})`)
    : [];
  const machineMap = new Map(machineList.map(m => [m.id, m]));

  const grouped: Record<number, DrawingMachineGroup> = {};
  for (const dm of scopedDrawingMachines) {
    const drawing = drawingMap.get(dm.drawingId);
    if (!drawing) continue;
    if (!grouped[dm.drawingId]) {
      grouped[dm.drawingId] = { drawing, machines: [] };
    }
    const matched = dm.matchedMachineId ? machineMap.get(dm.matchedMachineId) : null;
    grouped[dm.drawingId].machines.push({
      ...dm,
      matchedMachineName: matched?.name ?? null,
      matchedMachineCode: matched?.machineCode ?? null,
    });
  }

  res.json(Object.values(grouped));
}));

router.patch("/api/drawing-machines/:id", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) throw AppError.badRequest("ID non valido");

  const [existing] = await db.select().from(drawingMachines).where(eq(drawingMachines.id, id));
  if (!existing) throw AppError.notFound("Voce non trovata");

  const [parentDrawing] = await db.select().from(drawings).where(eq(drawings.id, existing.drawingId));
  if (!parentDrawing) throw AppError.notFound("Disegno associato non trovato");
  if (req.companyId && parentDrawing.companyId !== req.companyId) throw AppError.notFound("Voce non trovata");

  const { matchedMachineId, verified, notInCatalog } = req.body;

  if (matchedMachineId !== undefined && matchedMachineId !== null) {
    const machineIdNum = Number(matchedMachineId);
    if (isNaN(machineIdNum)) throw AppError.badRequest("matchedMachineId non valido");
    const machineConditions: ReturnType<typeof eq>[] = [eq(machines.id, machineIdNum)];
    if (req.companyId) machineConditions.push(eq(machines.companyId, req.companyId));
    const [targetMachine] = await db.select({ id: machines.id }).from(machines).where(and(...machineConditions));
    if (!targetMachine) throw AppError.badRequest("Macchina non trovata o non appartenente alla stessa azienda");
  }

  const updates: Partial<{
    matchedMachineId: number | null;
    verified: boolean;
    notInCatalog: boolean;
    confidence: string | null;
    updatedAt: Date;
  }> = { updatedAt: new Date() };
  if (typeof notInCatalog === "boolean") {
    updates.notInCatalog = notInCatalog;
    if (notInCatalog) {
      updates.matchedMachineId = null;
      updates.confidence = null;
      updates.verified = false;
    }
  }
  if (matchedMachineId !== undefined && !(updates.notInCatalog === true)) {
    updates.matchedMachineId = matchedMachineId === null ? null : Number(matchedMachineId);
    if (matchedMachineId !== null) updates.notInCatalog = false;
    updates.verified = false;
    updates.confidence = null;
  }
  if (typeof verified === "boolean" && !(updates.notInCatalog === true)) updates.verified = verified;

  const [updated] = await db
    .update(drawingMachines)
    .set(updates)
    .where(eq(drawingMachines.id, id))
    .returning();

  res.json(updated);
}));

router.get("/api/drawing-machines/statistics", requireSalesmanOrMaster, asyncHandler(async (req, res) => {
  const yearFrom = req.query.yearFrom ? Number(req.query.yearFrom) : null;
  const yearTo = req.query.yearTo ? Number(req.query.yearTo) : null;
  const customerId = req.query.customerId ? Number(req.query.customerId) : null;

  const conditions: ReturnType<typeof sql>[] = [];
  if (req.companyId) conditions.push(sql`d.company_id = ${req.companyId}`);
  if (customerId) conditions.push(sql`d.customer_id = ${customerId}`);
  if (yearFrom) conditions.push(sql`EXTRACT(YEAR FROM d.created_at) >= ${yearFrom}`);
  if (yearTo) conditions.push(sql`EXTRACT(YEAR FROM d.created_at) <= ${yearTo}`);

  const whereClause = conditions.length > 0
    ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
    : sql``;

  const byYear = await db.execute(sql`
    SELECT EXTRACT(YEAR FROM d.created_at)::int AS year, COUNT(DISTINCT dm.id)::int AS count
    FROM drawing_machines dm
    JOIN drawings d ON d.id = dm.drawing_id
    JOIN machines m ON m.id = dm.matched_machine_id
    ${whereClause}
    GROUP BY year
    ORDER BY year DESC
  `);

  const topMachines = await db.execute(sql`
    SELECT m.id, m.name, m.machine_code, m.macro_type, COUNT(dm.id)::int AS count
    FROM drawing_machines dm
    JOIN drawings d ON d.id = dm.drawing_id
    JOIN machines m ON m.id = dm.matched_machine_id
    ${whereClause}
    GROUP BY m.id, m.name, m.machine_code, m.macro_type
    ORDER BY count DESC
    LIMIT 20
  `);

  const byFamily = await db.execute(sql`
    SELECT COALESCE(m.macro_type, 'Altro') AS family, COUNT(dm.id)::int AS count
    FROM drawing_machines dm
    JOIN drawings d ON d.id = dm.drawing_id
    JOIN machines m ON m.id = dm.matched_machine_id
    ${whereClause}
    GROUP BY family
    ORDER BY count DESC
  `);

  const customersList = await db.execute(sql`
    SELECT DISTINCT c.id, COALESCE(c.company_name, c.name) AS name
    FROM drawings d
    JOIN customers c ON c.id = d.customer_id
    JOIN drawing_machines dm ON dm.drawing_id = d.id
    ${req.companyId ? sql`WHERE d.company_id = ${req.companyId}` : sql``}
    ORDER BY name
  `);

  res.json({
    byYear: byYear.rows,
    topMachines: topMachines.rows,
    byFamily: byFamily.rows,
    customers: customersList.rows,
  });
}));

export default router;
