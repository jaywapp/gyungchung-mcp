export type AdminErrorCode =
  | "INVALID_ARGUMENT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STALE_CONTEXT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "CONFLICT"
  | "STALE_PREVIEW"
  | "PREVIEW_REQUIRED"
  | "CONSTRAINT_VIOLATION"
  | "TABLE_NOT_ALLOWED";

export class AdminError extends Error {
  constructor(
    public readonly code: AdminErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AdminError";
  }
}

export function toAdminError(error: unknown): AdminError {
  if (error instanceof AdminError) return error;
  return new AdminError("INTERNAL_ERROR", "관리자 데이터를 조회하지 못했습니다.", 500);
}

const RPC_ERROR_STATUS: Partial<Record<AdminErrorCode, number>> = {
  INVALID_ARGUMENT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_PREVIEW: 409,
  PREVIEW_REQUIRED: 428,
  CONSTRAINT_VIOLATION: 422,
  TABLE_NOT_ALLOWED: 403,
};

const RPC_ERROR_PATTERN = /^MCP:([A-Z_]+):(.*)$/s;

// Database functions raise "MCP:<CODE>:<Korean message>"; anything else must not leak to the client.
export function fromRpcError(error: { message?: string; code?: string } | null): AdminError {
  const match = typeof error?.message === "string" ? RPC_ERROR_PATTERN.exec(error.message) : null;
  if (match) {
    const code = match[1] as AdminErrorCode;
    const status = RPC_ERROR_STATUS[code];
    if (status !== undefined) return new AdminError(code, match[2] ?? "", status);
  }
  return new AdminError("INTERNAL_ERROR", "요청을 처리하지 못했습니다.", 500);
}
