import bcrypt from "bcryptjs";
import { db } from "./db";
import { salesmanUsers, DEFAULT_SALESMAN_FEATURES } from "@shared/schema";
import { eq } from "drizzle-orm";

// Temporary admin used while OAuth is disabled.
// TODO: rimuovere una volta riattivato il login Google.
const TEMP_ADMIN_EMAIL = "gtmpilot7@gmail.com";
const TEMP_ADMIN_PASSWORD = "Pass1";

export async function ensureDefaultMaster() {
  const passwordHash = await bcrypt.hash(TEMP_ADMIN_PASSWORD, 12);

  const [existing] = await db
    .select()
    .from(salesmanUsers)
    .where(eq(salesmanUsers.email, TEMP_ADMIN_EMAIL))
    .limit(1);

  if (existing) {
    // Re-allinea l'utente esistente in modo che la password e i flag di
    // master coincidano sempre con quanto previsto in fase di sviluppo.
    await db
      .update(salesmanUsers)
      .set({
        passwordHash,
        isActive: true,
        isMasterSalesman: true,
        role: "master",
      })
      .where(eq(salesmanUsers.id, existing.id));
    console.log(`[auth] Temporary master account synced: ${TEMP_ADMIN_EMAIL}`);
    return;
  }

  await db.insert(salesmanUsers).values({
    companyId: 1,
    email: TEMP_ADMIN_EMAIL,
    passwordHash,
    name: "Admin",
    surname: "",
    mobileNumber: "",
    isActive: true,
    isMasterSalesman: true,
    role: "master",
    features: DEFAULT_SALESMAN_FEATURES,
  });

  console.log(`[auth] Temporary master account created: ${TEMP_ADMIN_EMAIL}`);
}
