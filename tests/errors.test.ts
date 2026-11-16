import { describe, expect, it } from "vitest";
import { AdminError, fromRpcError } from "../src/domain/errors.js";

describe("fromRpcError", () => {
  it("decodes an MCP-prefixed database error", () => {
    const error = fromRpcError({ message: "MCP:CONFLICT:값이 바뀌었습니다" });
    expect(error).toBeInstanceOf(AdminError);
    expect(error.code).toBe("CONFLICT");
    expect(error.status).toBe(409);
    expect(error.message).toBe("값이 바뀌었습니다");
  });

  it("keeps multi-line messages", () => {
    const error = fromRpcError({ message: "MCP:INVALID_ARGUMENT:첫 줄\n둘째 줄" });
    expect(error.code).toBe("INVALID_ARGUMENT");
    expect(error.message).toBe("첫 줄\n둘째 줄");
  });

  it.each([
    ["CONFLICT", 409],
    ["STALE_PREVIEW", 409],
    ["PREVIEW_REQUIRED", 428],
    ["CONSTRAINT_VIOLATION", 422],
    ["TABLE_NOT_ALLOWED", 403],
    ["INVALID_ARGUMENT", 400],
    ["UNAUTHENTICATED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
  ])("maps %s to HTTP %i", (code, status) => {
    const error = fromRpcError({ message: `MCP:${code}:메시지` });
    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
  });

  it("hides unknown database errors", () => {
    const error = fromRpcError({ message: 'relation "x" does not exist' });
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.status).toBe(500);
    expect(error.message).toBe("요청을 처리하지 못했습니다.");
    expect(error.message).not.toContain("relation");
  });

  it("treats unknown MCP codes and missing errors as internal errors", () => {
    expect(fromRpcError({ message: "MCP:SOMETHING_ELSE:x" }).code).toBe("INTERNAL_ERROR");
    expect(fromRpcError(null).code).toBe("INTERNAL_ERROR");
    expect(fromRpcError({}).code).toBe("INTERNAL_ERROR");
  });
});
