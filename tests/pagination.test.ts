import { describe, expect, it } from "vitest";
import { AdminError } from "../src/domain/errors.js";
import { paginate } from "../src/domain/pagination.js";

describe("pagination input boundaries", () => {
  it.each([null, [], {}, -1, 1.5, "25", NaN, Infinity])("rejects invalid limit %s", value => {
    expect(() => paginate([], value)).toThrow(AdminError);
  });
  it.each([null, [], {}, 123, "", "a".repeat(501)])("rejects invalid cursor %s", value => {
    expect(() => paginate([], 25, value)).toThrow(AdminError);
  });
  it("returns no cursor for empty input or offsets beyond the final item", () => {
    expect(paginate([])).toEqual({ items: [], hasMore: false, nextCursor: null });
    const cursor = Buffer.from(JSON.stringify({ offset: 100 })).toString("base64url");
    expect(paginate([1], 1, cursor)).toEqual({ items: [], hasMore: false, nextCursor: null });
  });
  it.each([null, [], {}, { offset: -1 }, { offset: 0.5 }, { offset: "1" }])("rejects malformed cursor payload %s", payload => {
    const cursor = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(() => paginate([], 25, cursor)).toThrow(AdminError);
  });
});

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
