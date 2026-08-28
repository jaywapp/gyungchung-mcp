import { describe, expect, it } from "vitest";
import manifest from "../spec/mcp-tools-v1.json" with { type: "json" };

describe("MCP tool manifest", () => {
  it("publishes eleven uniquely named read-only tools", () => {
    expect(manifest.tools).toHaveLength(11);
    expect(new Set(manifest.tools.map((tool) => tool.name)).size).toBe(11);
    expect(manifest.defaults.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("requires OAuth for every tool", () => {
    expect(manifest.defaults.securitySchemes).toEqual([
      { type: "oauth2", scopes: ["openid", "email", "profile"] },
    ]);
  });
});
