declare global {
  namespace Express {
    interface Request {
      companyId: number;
    }
  }
}

export {};
