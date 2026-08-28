import { AdminError } from "./errors.js";

interface CursorPayload {
  offset: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function parseLimit(value: unknown, fallback = 25): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new AdminError("INVALID_ARGUMENT", "limit은 1에서 100 사이의 정수여야 합니다.", 400);
  }
  return Number(value);
}

export function decodeCursor(cursor: unknown): number {
  if (cursor === undefined) return 0;
  if (typeof cursor !== "string" || cursor.length > 500) {
    throw new AdminError("INVALID_ARGUMENT", "cursor 형식이 올바르지 않습니다.", 400);
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as CursorPayload;
    if (!Number.isInteger(parsed.offset) || parsed.offset < 0) throw new Error("invalid offset");
    return parsed.offset;
  } catch {
    throw new AdminError("INVALID_ARGUMENT", "cursor 형식이 올바르지 않습니다.", 400);
  }
}

export function paginate<T>(items: T[], limitValue?: unknown, cursor?: unknown): Page<T> {
  const limit = parseLimit(limitValue);
  const offset = decodeCursor(cursor);
  const pageItems = items.slice(offset, offset + limit);
  const hasMore = offset + pageItems.length < items.length;
  return {
    items: pageItems,
    hasMore,
    nextCursor: hasMore
      ? Buffer.from(JSON.stringify({ offset: offset + pageItems.length })).toString("base64url")
      : null,
  };
}
