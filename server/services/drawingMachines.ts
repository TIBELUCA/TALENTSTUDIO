import { db, eq } from "../repositories/base";
import { drawingMachines, drawings, machines } from "@shared/schema";
import type { Machine } from "@shared/schema";
import { drawingsFileStorage } from "./fileStorage";
import fs from "fs";

function diceCoefficient(a: string, b: string): number {
  const sa = a.toLowerCase().trim();
  const sb = b.toLowerCase().trim();
  if (sa === sb) return 1;
  if (sa.length < 2 || sb.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < sa.length - 1; i++) {
    const bi = sa.substring(i, i + 2);
    bigramsA.set(bi, (bigramsA.get(bi) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < sb.length - 1; i++) {
    const bi = sb.substring(i, i + 2);
    const count = bigramsA.get(bi) || 0;
    if (count > 0) {
      bigramsA.set(bi, count - 1);
      intersection++;
    }
  }

  return (2 * intersection) / (sa.length - 1 + sb.length - 1);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9àèéìòùäöüñç\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ParsedEntry {
  position: string | null;
  text: string;
}

export function parseLegendEntries(pdfText: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const lines = pdfText.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  const positionPattern = /^(?:pos\.?\s*)?(\d{1,3})\s*[:\-–—\.]\s*(.+)/i;
  const numberedPattern = /^(\d{1,3})\s+([A-Z].{2,})/;

  for (const line of lines) {
    let match = line.match(positionPattern);
    if (match) {
      const text = match[2].trim();
      if (text.length >= 3) {
        entries.push({ position: match[1], text });
      }
      continue;
    }

    match = line.match(numberedPattern);
    if (match) {
      const text = match[2].trim();
      if (text.length >= 3) {
        entries.push({ position: match[1], text });
      }
    }
  }

  if (entries.length === 0) {
    for (const line of lines) {
      const cleaned = line.trim();
      if (cleaned.length >= 5 && cleaned.length <= 120 && /[A-Za-z]/.test(cleaned)) {
        const hasUpperStart = /^[A-Z]/.test(cleaned);
        const notJustNumbers = !/^\d+$/.test(cleaned);
        if (hasUpperStart && notJustNumbers) {
          entries.push({ position: null, text: cleaned });
        }
      }
    }
  }

  return entries;
}

function getAllMachineTexts(machine: Machine): string[] {
  const texts: string[] = [];
  if (machine.name) texts.push(machine.name);
  if (machine.machineCode) texts.push(machine.machineCode);
  if (machine.titles) {
    const t = machine.titles as Record<string, string>;
    for (const lang of ["it", "en", "de", "fr", "es", "pt"]) {
      if (t[lang]) texts.push(t[lang]);
    }
  }
  return texts;
}

interface MatchResult {
  machineId: number;
  confidence: number;
  matchedField: string;
}

function findBestMatch(extractedText: string, catalogMachines: Machine[]): MatchResult | null {
  const normalizedExtracted = normalize(extractedText);
  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  for (const machine of catalogMachines) {
    const candidates = getAllMachineTexts(machine);
    for (const candidate of candidates) {
      const normalizedCandidate = normalize(candidate);

      if (normalizedExtracted === normalizedCandidate) {
        return { machineId: machine.id, confidence: 1.0, matchedField: candidate };
      }

      if (normalizedExtracted.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedExtracted)) {
        const containScore = 0.85 + 0.1 * (Math.min(normalizedExtracted.length, normalizedCandidate.length) / Math.max(normalizedExtracted.length, normalizedCandidate.length));
        if (containScore > bestScore) {
          bestScore = containScore;
          bestMatch = { machineId: machine.id, confidence: containScore, matchedField: candidate };
        }
        continue;
      }

      const score = diceCoefficient(normalizedExtracted, normalizedCandidate);
      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestMatch = { machineId: machine.id, confidence: score, matchedField: candidate };
      }
    }
  }

  return bestMatch;
}

export async function extractAndMatchMachines(drawingId: number): Promise<{ extracted: number; matched: number }> {
  const [drawing] = await db.select().from(drawings).where(eq(drawings.id, drawingId));
  if (!drawing) throw new Error("Drawing not found");
  if (!drawing.pdfFilename) throw new Error("Drawing has no PDF file");

  const fullPath = drawingsFileStorage.getFullPath(drawing.pdfFilename);
  if (!fs.existsSync(fullPath)) throw new Error("PDF file not found on disk");

  const pdfBuffer = fs.readFileSync(fullPath);
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: pdfBuffer });
  const textResult = await parser.getText();
  const pdfText = textResult.pages.map((p: { text: string }) => p.text).join("\n");
  parser.destroy();

  await db.delete(drawingMachines).where(eq(drawingMachines.drawingId, drawingId));

  const entries = parseLegendEntries(pdfText);
  if (entries.length === 0) {
    return { extracted: 0, matched: 0 };
  }

  const companyId = drawing.companyId;
  let catalogMachines: Machine[] = [];
  if (companyId) {
    catalogMachines = await db.select().from(machines).where(eq(machines.companyId, companyId));
  } else {
    catalogMachines = await db.select().from(machines);
  }

  let matched = 0;
  for (const entry of entries) {
    const match = findBestMatch(entry.text, catalogMachines);
    await db.insert(drawingMachines).values({
      drawingId,
      positionLabel: entry.position,
      extractedText: entry.text,
      matchedMachineId: match?.machineId ?? null,
      confidence: match ? match.confidence.toFixed(4) : null,
      verified: false,
      notInCatalog: false,
    });
    if (match) matched++;
  }

  return { extracted: entries.length, matched };
}
