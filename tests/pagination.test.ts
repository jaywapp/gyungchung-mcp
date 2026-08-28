import { describe, expect, it } from "vitest";
import { AdminError } from "../src/domain/errors.js";
import { paginate } from "../src/domain/pagination.js";

describe("cursor pagination", () => {
  it("returns an opaque cursor and continues without duplicates", () => {
    const first = paginate(["a", "b", "c"], 2);
    expect(first.items).toEqual(["a", "b"]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTypeOf("string");

    const second = paginate(["a", "b", "c"], 2, first.nextCursor!);
    expect(second.items).toEqual(["c"]);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
  });

  it("rejects malformed cursors and out-of-range limits", () => {
    expect(() => paginate([], 0)).toThrow(AdminError);
    expect(() => paginate([], 101)).toThrow(AdminError);
    expect(() => paginate([], 25, "not-a-cursor")).toThrow(AdminError);
  });
});
