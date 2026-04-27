import "express-session";

declare module "express-session" {
  interface SessionData {
    salesmanId?: number;
    salesmanIsMaster?: boolean;
    salesmanRole?: string;
    parentSalesmanId?: number | null;
    parentSalesmanIds?: number[];
    dealerId?: number;
  }
}
