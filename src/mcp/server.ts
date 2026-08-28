import { randomUUID } from "node:crypto";
import {
  fromJsonSchema,
  McpServer,
  type AuthInfo,
  type JsonSchemaType,
} from "@modelcontextprotocol/server";
import manifest from "../../spec/mcp-tools-v1.json" with { type: "json" };
import { createUserSupabaseClient } from "../data/supabase.js";
import {
  AdminQueryService,
  resultCount,
  type AdminPermission,
  type ServiceEnvelope,
} from "../domain/admin-query-service.js";
import { AdminError, toAdminError } from "../domain/errors.js";

type ToolArguments = Record<string, unknown>;

interface ManifestTool {
  name: string;
  title: string;
  description: string;
  requiredPermission: string;
  inputSchema: JsonSchemaType;
}

function userIdFromAuth(authInfo: AuthInfo): string {
  const userId = authInfo.extra?.userId;
  if (typeof userId !== "string") {
    throw new AdminError("UNAUTHENTICATED", "인증된 사용자 정보를 확인할 수 없습니다.", 401);
  }
  return userId;
}

function shouldExposeTool(service: AdminQueryService, tool: ManifestTool): boolean {
  if (tool.requiredPermission === "operator") return true;
  if (tool.requiredPermission.startsWith("dynamic-")) {
    return ["elections.manage", "polls.manage", "surveys.manage"].some((permission) =>
      service.hasPermission(permission as AdminPermission),
    );
  }
  return service.hasPermission(tool.requiredPermission as AdminPermission);
}

function summarize(toolName: string, result: ServiceEnvelope, args: ToolArguments): string {
  if (toolName === "admin_get_context") {
    const data = result.data as { operator?: { name?: string }; permissions?: unknown[] };
    return `${data.operator?.name ?? "운영자"}님의 운영 권한 ${data.permissions?.length ?? 0}개를 확인했습니다.`;
  }
  if (toolName === "member_get") {
    const data = result.data as Record<string, unknown>;
    const contact = args.includeContact === true
      ? ` 연락처: ${String(data.phone ?? "없음")}, 이메일: ${String(data.email ?? "없음")}.`
      : "";
    return `${String(data.name ?? "회원")}님의 회원 정보를 조회했습니다.${contact}`;
  }
  if (toolName === "fees_get_overview") return "요청한 기간의 회비 현황을 집계했습니다.";
  if (toolName === "event_get_operations") return "일정 운영 상세 정보를 조회했습니다.";
  if (toolName === "participation_results_get") return "참여 결과를 개인 응답 없이 집계 형태로 조회했습니다.";
  const count = Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0;
  return `${count}건을 조회했습니다.`;
}

const outputSchema = fromJsonSchema({
  type: "object",
  required: ["data", "meta"],
  properties: {
    data: {},
    meta: {
      type: "object",
      required: ["requestId", "generatedAt"],
      properties: {
        requestId: { type: "string" },
        generatedAt: { type: "string", format: "date-time" },
        page: { type: "object" },
      },
      additionalProperties: true,
    },
  },
  additionalProperties: false,
});

export async function buildAdminMcpServer(authInfo?: AuthInfo): Promise<McpServer> {
  const server = new McpServer(
    { name: "gyungchung-admin", version: "0.1.0" },
    { capabilities: { tools: { listChanged: false } } },
  );
  if (!authInfo) return server;

  const supabase = createUserSupabaseClient(authInfo.token);
  const service = await AdminQueryService.create(supabase, userIdFromAuth(authInfo));
  if (!service) return server;

  for (const tool of manifest.tools as unknown as ManifestTool[]) {
    if (!shouldExposeTool(service, tool)) continue;
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: fromJsonSchema<ToolArguments>(tool.inputSchema),
        outputSchema,
        annotations: manifest.defaults.annotations,
        _meta: { securitySchemes: manifest.defaults.securitySchemes },
      },
      async (args) => {
        const requestId = randomUUID();
        const startedAt = Date.now();
        const sensitiveFieldsAccessed = tool.name === "member_get" && args.includeContact === true;
        try {
          const result = await service.execute(tool.name, args, requestId);
          await service.audit({
            requestId,
            operation: tool.name,
            entrypoint: "mcp",
            outcome: "success",
            durationMs: Date.now() - startedAt,
            returnedCount: resultCount(result),
            sensitiveFieldsAccessed,
          });
          return {
            content: [{ type: "text", text: summarize(tool.name, result, args) }],
            structuredContent: result as unknown as Record<string, unknown>,
          };
        } catch (error) {
          const adminError = toAdminError(error);
          try {
            await service.audit({
              requestId,
              operation: tool.name,
              entrypoint: "mcp",
              outcome: adminError.code === "FORBIDDEN" ? "denied" : "error",
              durationMs: Date.now() - startedAt,
              returnedCount: 0,
              sensitiveFieldsAccessed,
            });
          } catch {
            // The original safe error is returned; no query input or result is logged.
          }
          return {
            isError: true,
            content: [{ type: "text", text: adminError.message }],
            structuredContent: {
              error: { code: adminError.code, message: adminError.message, requestId },
            },
          };
        }
      },
    );
  }
  return server;
}
