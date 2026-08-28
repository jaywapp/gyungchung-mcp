import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Rewrite {
  source: string;
  destination: string;
}

const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
  rewrites: Rewrite[];
};

describe("Vercel routing", () => {
  it("publishes the MCP and OAuth metadata endpoints", () => {
    expect(config.rewrites).toEqual(expect.arrayContaining([
      { source: "/mcp", destination: "/api/mcp" },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth-protected-resource",
      },
    ]));
  });

  it("uses explicit admin routes instead of an invalid query catch-all", () => {
    expect(config.rewrites.some((rewrite) => rewrite.destination.includes(":path*"))).toBe(false);
    expect(config.rewrites.map((rewrite) => rewrite.source)).toEqual(expect.arrayContaining([
      "/api/v1/admin/context",
      "/api/v1/admin/members/:memberId",
      "/api/v1/admin/events/:eventId/operations",
      "/api/v1/admin/participation/forms/:formId/results",
    ]));
  });
});
