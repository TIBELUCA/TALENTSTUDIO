import type { Express } from "express";
import type { Server } from "http";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import express from "express";
import { machineImageStorage } from "./services";
import { attachCompanyId } from "./middlewares/company";

import {
  authRouter,
  googleAuthRouter,
  accountRouter,
  usersRouter,
  customersRouter,
  machinesRouter,
  mediaRouter,
  presetsRouter,
  settingsRouter,
  offersRouter,
  offerCrmRouter,
  dealersRouter,
  enquiriesRouter,
  assistantRouter,
  salesBrainRouter,
  shareHubRouter,
  travelPackRouter,
  interactionsRouter,
  ordersRouter,
  customMachinesRouter,
  notificationsRouter,
  emailRouter,
  emailAttachmentLinksRouter,
  financeRouter,
  crmStatsRouter,
  crmMapDataRouter,
  drawingsRouter,
  googleDriveRouter,
  recapRouter,
  recapAiRouter,
  youtubeRouter,
  talentsRouter,
  talentQuotesRouter,
  campaignsRouter,
  talentSettingsRouter,
} from "./routes/index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  app.use(attachCompanyId);
  app.use("/machine-images", express.static(machineImageStorage.getFullPath("")));

  app.use(authRouter);
  app.use(googleAuthRouter);
  app.use(accountRouter);
  app.use(usersRouter);
  app.use(customersRouter);
  app.use(mediaRouter);
  app.use(settingsRouter);
  app.use(offersRouter);
  app.use(offerCrmRouter);
  app.use(assistantRouter);
  app.use(salesBrainRouter);
  app.use(interactionsRouter);
  app.use(ordersRouter);
  app.use(notificationsRouter);
  app.use(emailRouter);
  app.use(emailAttachmentLinksRouter);
  app.use(financeRouter);
  app.use(crmStatsRouter);
  app.use(crmMapDataRouter);
  app.use(googleDriveRouter);
  app.use(recapRouter);
  app.use(recapAiRouter);
  app.use(talentsRouter);
  app.use(talentQuotesRouter);
  app.use(campaignsRouter);
  app.use(talentSettingsRouter);

  // Legacy routers — kept mounted as a safety net while /offers and /orders
  // are still served by the transitional UI. They are not surfaced anywhere
  // in the new navigation but historical data flows still depend on them.
  app.use(machinesRouter);
  app.use(customMachinesRouter);
  app.use(presetsRouter);
  app.use(dealersRouter);
  app.use(enquiriesRouter);
  app.use(shareHubRouter);
  app.use(travelPackRouter);
  app.use(drawingsRouter);
  app.use(youtubeRouter);

  return httpServer;
}
