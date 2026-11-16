import { describe, expect, it } from "vitest";
import v1 from "../spec/mcp-tools-v1.json" with { type: "json" };
import v2 from "../spec/mcp-tools-v2.json" with { type: "json" };

interface Tool {
  name: string;
  title: string;
  description: string;
  requiredPermission: string;
  rpc: string;
  kind: "read" | "write";
  annotations: Record<string, boolean>;
  inputSchema: { required?: string[]; properties: Record<string, any>; additionalProperties: boolean };
}

const tools = v2.tools as unknown as Tool[];
const byName = (name: string) => tools.find((tool) => tool.name === name)!;

describe("MCP tool manifest v2", () => {
  it("publishes fourteen uniquely named tools", () => {
    expect(v2.version).toBe("2.0.0");
    expect(tools).toHaveLength(14);
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(14);
  });

  it("maps every tool to its mcp_admin_ rpc", () => {
    for (const tool of tools) expect(tool.rpc).toBe(`mcp_admin_${tool.name}`);
  });

  it("shares the v1 security scheme and does not overlap v1 names", () => {
    expect(v2.defaults.securitySchemes).toEqual(v1.defaults.securitySchemes);
    const v1Names = new Set(v1.tools.map((tool) => tool.name));
    for (const tool of tools) expect(v1Names.has(tool.name)).toBe(false);
  });

  it("assigns permissions", () => {
    for (const name of ["tables_list", "table_describe", "rows_query", "rows_insert", "rows_update", "rows_delete", "changes_list"]) {
      expect(byName(name).requiredPermission).toBe("system-admin");
    }
    for (const name of ["attendance_save", "event_teams_save", "event_game_state", "event_game_save", "event_game_finalize", "event_winners_save"]) {
      expect(byName(name).requiredPermission).toBe("events.manage");
    }
    expect(byName("fees_charge_monthly").requiredPermission).toBe("fees.manage");
  });

  it("classifies kinds and annotations", () => {
    const reads = ["tables_list", "table_describe", "rows_query", "changes_list", "event_game_state"];
    for (const tool of tools) {
      expect(tool.kind).toBe(reads.includes(tool.name) ? "read" : "write");
      if (tool.kind === "read") {
        expect(tool.annotations).toEqual({
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        });
      } else {
        expect(tool.annotations.readOnlyHint).toBe(false);
        expect(tool.annotations.idempotentHint).toBe(true);
        expect(tool.annotations.openWorldHint).toBe(false);
      }
    }
    expect(tools.filter((tool) => tool.annotations.destructiveHint === true).map((tool) => tool.name)).toEqual(["rows_delete"]);
  });

  it("requires requestId on every write tool", () => {
    for (const tool of tools.filter((item) => item.kind === "write")) {
      expect(tool.inputSchema.required).toContain("requestId");
      expect(tool.inputSchema.properties.requestId).toMatchObject({ type: "string", format: "uuid" });
    }
  });

  it("offers confirmToken only on the five preview tools", () => {
    const withToken = tools.filter((tool) => "confirmToken" in tool.inputSchema.properties).map((tool) => tool.name).sort();
    expect(withToken).toEqual(["event_game_finalize", "fees_charge_monthly", "rows_delete", "rows_insert", "rows_update"]);
  });

  it("closes every input schema", () => {
    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(tool.title.length).toBeGreaterThan(0);
    }
  });

  it("limits filter operators to the nine allowed ones", () => {
    for (const name of ["rows_query", "rows_update", "rows_delete"]) {
      const op = byName(name).inputSchema.properties.filters.items.properties.op;
      expect(op.enum).toEqual(["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "is_null"]);
    }
  });

  it("states the preview, requestId and timezone rules in descriptions", () => {
    for (const name of ["rows_insert", "rows_update", "rows_delete", "event_game_finalize", "fees_charge_monthly"]) {
      expect(byName(name).description).toContain("confirmToken 없이 호출하면 저장하지 않고 미리보기를 돌려준다");
    }
    for (const tool of tools.filter((item) => item.kind === "write")) {
      expect(tool.description).toContain("requestId는 작업마다 새 UUID를 만든다");
    }
    for (const name of ["rows_query", "rows_insert", "rows_update", "rows_delete", "changes_list"]) {
      expect(byName(name).description).toContain("한국 시간");
    }
  });
  it("tells the model how to confirm and retry", () => {
    for (const name of ["rows_insert", "rows_update", "rows_delete", "event_game_finalize", "fees_charge_monthly"]) {
      expect(byName(name).description).toContain("미리보기 때의 requestId와 인자를 그대로 두고 confirmToken만 더한다");
    }
    for (const tool of tools.filter((item) => item.kind === "write")) {
      expect(tool.description).toContain("같은 requestId를 쓴다");
    }
    expect(byName("rows_update").description).toContain("expected에는 바꾸려는 열의 현재 값");
  });

  it("keeps schema limits within what the database accepts", () => {
    const properties = (name: string) => (byName(name).inputSchema as { properties: Record<string, { maxItems?: number }> }).properties;
    expect(properties("event_winners_save").memberIds.maxItems).toBe(6);
    expect(properties("rows_query").include.maxItems).toBe(5);
  });
});
