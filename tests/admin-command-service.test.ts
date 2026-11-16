import { describe, expect, it, vi } from "vitest";
import {
  AdminCommandService,
  auditOperation,
  commandResultCount,
  shouldExposeCommandTool,
  summarizeCommand,
  type CommandTool,
} from "../src/domain/admin-command-service.js";
import { ADMIN_PERMISSIONS, type AdminPermission } from "../src/domain/admin-query-service.js";
import { AdminError } from "../src/domain/errors.js";
import v1 from "../spec/mcp-tools-v1.json" with { type: "json" };
import v2 from "../spec/mcp-tools-v2.json" with { type: "json" };

const update: CommandTool = { name: "rows_update", rpc: "mcp_admin_rows_update", kind: "write", requiredPermission: "system-admin" };
const query: CommandTool = { name: "rows_query", rpc: "mcp_admin_rows_query", kind: "read", requiredPermission: "system-admin" };
const attendance: CommandTool = { name: "attendance_save", rpc: "mcp_admin_attendance_save", kind: "write", requiredPermission: "events.manage" };

function fakeSupabase(result: { data?: unknown; error?: { message?: string; code?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { client: { rpc } as never, rpc };
}

describe("AdminCommandService.execute", () => {
  it("passes the rpc name and the arguments untouched", async () => {
    const { client, rpc } = fakeSupabase({ data: { status: "applied", affectedCount: 1 } });
    const args = { requestId: "4f2b1c6e-0000-4000-8000-000000000001", table: "venues", rows: [{ name: "A" }] };
    const result = await new AdminCommandService(client).execute(update, args, "req-1");
    expect(rpc).toHaveBeenCalledWith("mcp_admin_rows_update", { p_input: args });
    expect(result.data).toEqual({ status: "applied", affectedCount: 1 });
    expect(result.meta.requestId).toBe("req-1");
    expect(Number.isNaN(Date.parse(result.meta.generatedAt))).toBe(false);
  });

  it("converts database errors into AdminError", async () => {
    const { client } = fakeSupabase({ error: { message: "MCP:PREVIEW_REQUIRED:미리보기가 필요합니다" } });
    const failure = await new AdminCommandService(client).execute(update, {}, "req-2").catch((error) => error);
    expect(failure).toBeInstanceOf(AdminError);
    expect(failure.code).toBe("PREVIEW_REQUIRED");
    expect(failure.status).toBe(428);
  });

  it("hides raw database errors", async () => {
    const { client } = fakeSupabase({ error: { message: 'relation "x" does not exist' } });
    const failure = await new AdminCommandService(client).execute(query, {}, "req-3").catch((error) => error);
    expect(failure.code).toBe("INTERNAL_ERROR");
    expect(failure.message).not.toContain("relation");
  });
});

describe("summarizeCommand", () => {
  it("describes a preview", () => {
    expect(summarizeCommand(update, {}, { status: "preview", preview: { affectedCount: 12 } })).toBe(
      "아직 저장하지 않았습니다. 12건이 바뀝니다. 내용을 확인하고 승인하면 저장합니다.",
    );
  });

  it("describes an applied change and a replay", () => {
    expect(summarizeCommand(update, {}, { status: "applied", replayed: false, affectedCount: 3 })).toBe("3건을 저장했습니다.");
    expect(summarizeCommand(update, {}, { status: "applied", replayed: true, affectedCount: 3 })).toBe(
      "이미 처리된 요청입니다. 다시 저장하지 않았습니다.",
    );
  });

  it("describes a read", () => {
    expect(summarizeCommand(query, {}, { status: "ok", rows: [{}, {}] })).toBe("2건을 조회했습니다.");
  });
});

describe("commandResultCount", () => {
  it("counts rows, affected rows, and nothing for previews", () => {
    expect(commandResultCount({ status: "ok", rows: [1, 2, 3] })).toBe(3);
    expect(commandResultCount({ status: "applied", affectedCount: 4 })).toBe(4);
    expect(commandResultCount({ status: "preview", preview: { affectedCount: 9 } })).toBe(0);
    expect(commandResultCount(null)).toBe(0);
  });
});

describe("auditOperation", () => {
  it("appends a safe table name for generic tools", () => {
    expect(auditOperation(update, { table: "fees" })).toBe("rows_update:fees");
  });

  it("drops an unsafe table name", () => {
    expect(auditOperation(update, { table: "fees; drop" })).toBe("rows_update");
    expect(auditOperation(update, { table: "x".repeat(61) })).toBe("rows_update");
    expect(auditOperation(update, {})).toBe("rows_update");
  });

  it("keeps dedicated tool names", () => {
    expect(auditOperation(attendance, { table: "fees" })).toBe("attendance_save");
  });

  it("never exceeds 100 characters", () => {
    expect(auditOperation(update, { table: "a".repeat(60) }).length).toBeLessThanOrEqual(100);
  });
});

function operator(isSystemAdmin: boolean, permissions: AdminPermission[]) {
  return {
    operator: { isSystemAdmin },
    hasPermission: (permission: AdminPermission) => permissions.includes(permission),
  };
}

const v2Tools = v2.tools as unknown as CommandTool[];
const exposed = (service: ReturnType<typeof operator>) =>
  v2Tools.filter((tool) => shouldExposeCommandTool(service, tool)).map((tool) => tool.name);

// The database applies the web's own row rules to these, so every active member may call them.
const TABLE_TOOLS = ["function_call", "function_describe", "functions_list", "rows_delete", "rows_insert", "rows_query", "rows_update", "table_describe", "tables_list"];

describe("shouldExposeCommandTool", () => {
  it("shows every v2 tool to a system admin next to the eleven v1 tools", () => {
    expect(v1.tools).toHaveLength(11);
    expect(exposed(operator(true, [...ADMIN_PERMISSIONS]))).toHaveLength(17);
  });

  it("shows only event tools to an events.manage officer", () => {
    expect(exposed(operator(false, ["events.manage"])).sort()).toEqual([
      "attendance_save",
      "event_game_finalize",
      "event_game_save",
      "event_game_state",
      "event_teams_save",
      "event_winners_save",
      ...TABLE_TOOLS,
    ]);
  });

  it("adds only the fee charge tool for a fees.manage officer", () => {
    expect(exposed(operator(false, ["fees.manage"])).sort()).toEqual(["fees_charge_monthly", ...TABLE_TOOLS]);
  });

  it("shows the table tools, and nothing else, to a member without officer permissions", () => {
    expect(exposed(operator(false, [])).sort()).toEqual(TABLE_TOOLS);
  });

  it("keeps the change history with system administrators whatever permissions are held", () => {
    expect(exposed(operator(false, [...ADMIN_PERMISSIONS])).some((name) => name === "changes_list")).toBe(false);
    expect(exposed(operator(true, [])).some((name) => name === "changes_list")).toBe(true);
  });
});
