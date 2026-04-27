export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.status = status;
    this.code = code ?? "ERROR";
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError(400, message, "BAD_REQUEST", details);
  }

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError(401, message, "UNAUTHORIZED");
  }

  static forbidden(message = "Access denied"): AppError {
    return new AppError(403, message, "FORBIDDEN");
  }

  static notFound(entity = "Resource"): AppError {
    return new AppError(404, `${entity} not found`, "NOT_FOUND");
  }

  static conflict(message: string): AppError {
    return new AppError(409, message, "CONFLICT");
  }

  static internal(message = "Internal server error"): AppError {
    return new AppError(500, message, "INTERNAL_ERROR");
  }
}
