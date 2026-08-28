export type AdminErrorCode =
  | "INVALID_ARGUMENT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "STALE_CONTEXT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

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
