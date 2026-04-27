import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initIntegrations, initAi } from "./services";
import { startOfferReminderScheduler } from "./services/offerReminderScheduler";
import { startGmailIndexScheduler } from "./services/gmailIndexScheduler";
import { runDealerCompanyMigration, runAuditLogMigration, runOfferLanguageMigration, runInvoicingMigration, runEmailConnectionsMigration, runBankingMigration } from "./migrate";
import { runSchemaSync } from "./schemaSync";
import { ensureDefaultMaster } from "./ensureMaster";
import { errorHandler } from "./middlewares/errorHandler";
import { requestLogger } from "./middlewares/requestLogger";
import { globalApiRateLimiter } from "./middlewares/rateLimiter";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(requestLogger);

app.use(globalApiRateLimiter);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

(async () => {
  await runSchemaSync();
  initIntegrations();
  initAi();
  await runAuditLogMigration();
  await runOfferLanguageMigration();
  await runInvoicingMigration();
  await runEmailConnectionsMigration();
  await runBankingMigration();
  await runDealerCompanyMigration();
  await ensureDefaultMaster();
  await registerRoutes(httpServer, app);
  startOfferReminderScheduler();
  startGmailIndexScheduler();

  app.use(errorHandler);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
