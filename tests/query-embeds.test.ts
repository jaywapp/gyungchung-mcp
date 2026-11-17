import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/domain/admin-query-service.ts", import.meta.url), "utf8");

describe("embedded queries", () => {
  // attendance references profiles twice (member_id and checked_in_by), so an unnamed embed is
  // ambiguous and the whole event lookup fails.
  it("names the foreign key when attendance embeds the member profile", () => {
    const embeds = source.match(/attendance\([^)]*profiles[^(]*\(/g) ?? [];
    expect(embeds.length).toBeGreaterThan(0);
    for (const embed of embeds) expect(embed).toContain("profiles!attendance_member_id_fkey(");
  });
});
