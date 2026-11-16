import { randomUUID } from "node:crypto";
import type { AdminSupabaseClient } from "../data/supabase.js";
import type { AdminPermission, ServiceEnvelope } from "./admin-query-service.js";
import { fromRpcError } from "./errors.js";

type ToolArguments = Record<string, unknown>;
type Row = Record<string, any>;

export interface CommandTool {
  name: string;
  rpc: string;
  kind: "read" | "write";
  requiredPermission: string;
}

const GENERIC_TOOLS = new Set(["table_describe", "rows_query", "rows_insert", "rows_update", "rows_delete"]);
const SAFE_TABLE_NAME = /^[a-z_]{1,60}$/;

export class AdminCommandService {
  constructor(private readonly supabase: AdminSupabaseClient) {}

  async execute(tool: CommandTool, args: ToolArguments, requestId: string = randomUUID()): Promise<ServiceEnvelope> {
    const result = await this.supabase.rpc(tool.rpc, { p_input: args });
    if (result.error) throw fromRpcError(result.error);
    return { data: result.data, meta: { requestId, generatedAt: new Date().toISOString() } };
  }
}

export function summarizeCommand(_tool: CommandTool, _args: ToolArguments, data: unknown): string {
  const body = (data ?? {}) as Row;
  if (body.status === "preview") {
    const count = Number(body.preview?.affectedCount ?? 0);
    return `아직 저장하지 않았습니다. ${count}건이 바뀝니다. 내용을 확인하고 승인하면 저장합니다.`;
  }
  if (body.status === "applied") {
    if (body.replayed === true) return "이미 처리된 요청입니다. 다시 저장하지 않았습니다.";
    return `${Number(body.affectedCount ?? 0)}건을 저장했습니다.`;
  }
  if (body.status === "ok") {
    return Array.isArray(body.rows) ? `${body.rows.length}건을 조회했습니다.` : "현재 상태를 조회했습니다.";
  }
  return "요청을 처리했습니다.";
}

export function commandResultCount(data: unknown): number {
  const body = (data ?? {}) as Row;
  if (body.status === "ok" && Array.isArray(body.rows)) return body.rows.length;
  if (body.status === "applied") return Number(body.affectedCount ?? 0);
  return 0;
}

export function auditOperation(tool: CommandTool, args: ToolArguments): string {
  if (GENERIC_TOOLS.has(tool.name) && typeof args.table === "string" && SAFE_TABLE_NAME.test(args.table)) {
    return `${tool.name}:${args.table}`.slice(0, 100);
  }
  return tool.name.slice(0, 100);
}

interface ExposureContext {
  operator: { isSystemAdmin: boolean };
  hasPermission(permission: AdminPermission): boolean;
}

export function shouldExposeCommandTool(service: ExposureContext, tool: CommandTool): boolean {
  // "member": any active member. The database applies the same row rules as the web.
  if (tool.requiredPermission === "member") return true;
  if (tool.requiredPermission === "system-admin") return service.operator.isSystemAdmin;
  return service.hasPermission(tool.requiredPermission as AdminPermission);
}
