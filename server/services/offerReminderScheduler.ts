import { db } from "../db";
import { offerReminders, notifications, offers, salesmanUsers } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

let started = false;

type DueRow = {
  id: number;
  company_id: number | null;
  offer_id: number;
  user_id: number;
  note: string;
  created_by_user_id: number;
};

async function processDueReminders(): Promise<void> {
  // First, peek at candidate IDs without locking. We then process each one inside its
  // own transaction with SELECT ... FOR UPDATE SKIP LOCKED, so notification insert and
  // the sent_at update are atomic: if the insert fails or the process crashes, the
  // transaction rolls back and the reminder remains unclaimed for the next tick.
  const peek = (await db.execute(sql`
    SELECT id FROM offer_reminders
    WHERE sent_at IS NULL
      AND is_dismissed = FALSE
      AND remind_at <= NOW()
    ORDER BY remind_at ASC
    LIMIT 50
  `)) as unknown as { rows?: Array<{ id: number }> } | Array<{ id: number }>;

  const candidates: Array<{ id: number }> = Array.isArray(peek)
    ? peek
    : (peek.rows ?? []);

  if (candidates.length === 0) return;

  let dispatched = 0;

  for (const { id: reminderId } of candidates) {
    try {
      const ok = await db.transaction(async (tx) => {
        const lockRes = (await tx.execute(sql`
          SELECT id, company_id, offer_id, user_id, note, created_by_user_id
          FROM offer_reminders
          WHERE id = ${reminderId}
            AND sent_at IS NULL
            AND is_dismissed = FALSE
            AND remind_at <= NOW()
          FOR UPDATE SKIP LOCKED
        `)) as unknown as { rows?: DueRow[] } | DueRow[];

        const rows: DueRow[] = Array.isArray(lockRes)
          ? (lockRes as DueRow[])
          : (lockRes.rows ?? []);
        const row = rows[0];
        if (!row) return false;

        const r = {
          id: row.id,
          companyId: row.company_id,
          offerId: row.offer_id,
          userId: row.user_id,
          note: row.note,
          createdByUserId: row.created_by_user_id,
        };

        const [offer] = await tx.select({
          id: offers.id,
          referenceNumber: offers.referenceNumber,
          subject: offers.subject,
        }).from(offers).where(eq(offers.id, r.offerId));

        let creatorName = "Sistema";
        if (r.createdByUserId) {
          const [u] = await tx.select({ name: salesmanUsers.name, surname: salesmanUsers.surname })
            .from(salesmanUsers).where(eq(salesmanUsers.id, r.createdByUserId));
          if (u) creatorName = `${u.name ?? ""} ${u.surname ?? ""}`.trim() || creatorName;
        }

        const ref = offer?.referenceNumber ?? `#${r.offerId}`;
        const subject = offer?.subject ?? "";
        const title = `Promemoria offerta ${ref}`;
        const message = r.note
          ? `${r.note}${subject ? ` — ${subject}` : ""}`
          : `Promemoria impostato da ${creatorName}${subject ? ` per ${subject}` : ""}.`;

        await tx.insert(notifications).values({
          companyId: r.companyId ?? null,
          recipientUserId: r.userId,
          senderUserId: r.createdByUserId ?? null,
          type: "offer_reminder",
          title,
          message,
          offerId: r.offerId,
          isRead: false,
        });

        await tx.update(offerReminders)
          .set({ sentAt: new Date() })
          .where(eq(offerReminders.id, r.id));

        return true;
      });

      if (ok) dispatched++;
    } catch (e: any) {
      console.error(`[offer-reminders] Failed to dispatch reminder ${reminderId}:`, e?.message ?? e);
    }
  }

  if (dispatched > 0) {
    console.log(`[offer-reminders] Dispatched ${dispatched} reminder notification(s)`);
  }
}

export function startOfferReminderScheduler(): void {
  if (started) return;
  started = true;
  // First run shortly after boot, then every 60s
  setTimeout(() => {
    processDueReminders().catch(e => console.error("[offer-reminders] tick failed:", e));
  }, 5_000);
  setInterval(() => {
    processDueReminders().catch(e => console.error("[offer-reminders] tick failed:", e));
  }, 60_000);
  console.log("[offer-reminders] scheduler started (60s interval)");
}
