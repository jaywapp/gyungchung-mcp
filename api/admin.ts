import { randomUUID } from "node:crypto";
import { createMcpExpressApp, requireBearerAuth } from "@modelcontextprotocol/express";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { Request, Response } from "express";
import { SupabaseOAuthTokenVerifier } from "../src/auth/verifier.js";
import { getConfig } from "../src/config.js";
import { createUserSupabaseClient } from "../src/data/supabase.js";
import { AdminQueryService, resultCount } from "../src/domain/admin-query-service.js";
import { AdminError, toAdminError } from "../src/domain/errors.js";

interface Operation {
  name: string;
  args: Record<string, unknown>;
}

function stringQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function queryArguments(request: Request): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(request.query)) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (typeof value !== "string") continue;
    if (["includeTestAccounts", "includeGuests", "pinnedOnly", "competitiveOnly", "includeAttendance", "includeTeams", "includeMatches", "includeContact"].includes(key)) {
      result[key] = value === "true";
    } else if (key === "limit") {
      result[key] = Number(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function resolveOperation(request: Request): Operation {
  const path = stringQuery(request.query.path)?.replace(/^\/+|\/+$/g, "") ?? "";
  const args = queryArguments(request);
  if (path === "context") return { name: "admin_get_context", args };
  if (path === "members") return { name: "members_search", args };
  if (/^members\/[^/]+$/.test(path)) return { name: "member_get", args: { ...args, memberId: path.split("/")[1] } };
  if (path === "fees/overview") return { name: "fees_get_overview", args };
  if (path === "fees") return { name: "fees_list", args };
  if (path === "notices") return { name: "notices_list", args };
  if (path === "events") return { name: "events_list", args };
  if (/^events\/[^/]+\/operations$/.test(path)) return { name: "event_get_operations", args: { ...args, eventId: path.split("/")[1] } };
  if (path === "feedback") return { name: "feedback_list", args };
  if (path === "participation/forms") return { name: "participation_forms_list", args };
  if (/^participation\/forms\/[^/]+\/results$/.test(path)) {
    return { name: "participation_results_get", args: { ...args, formId: path.split("/")[2] } };
  }
  throw new AdminError("NOT_FOUND", "지원하지 않는 관리자 API 경로입니다.", 404);
}

function userId(authInfo: AuthInfo | undefined): string {
  const value = authInfo?.extra?.userId;
  if (typeof value !== "string") throw new AdminError("UNAUTHENTICATED", "인증된 사용자 정보를 확인할 수 없습니다.", 401);
  return value;
}

const config = getConfig();
const allowedHosts = new Set([config.mcpServerUrl.hostname, "localhost", "127.0.0.1"]);
if (process.env.VERCEL_URL) allowedHosts.add(process.env.VERCEL_URL);
const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts: [...allowedHosts] });
const auth = requireBearerAuth({
  verifier: new SupabaseOAuthTokenVerifier(),
  resourceMetadataUrl: config.resourceMetadataUrl.toString(),
});

app.use(auth, async (request: Request, response: Response) => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  response.setHeader("Cache-Control", "private, no-store");
  if (request.method !== "GET") {
    response.status(405).json({ error: { code: "INVALID_ARGUMENT", message: "조회 전용 API는 GET만 지원합니다.", requestId } });
    return;
  }

  try {
    const operation = resolveOperation(request);
    const authInfo = request.auth;
    const service = await AdminQueryService.create(createUserSupabaseClient(authInfo!.token), userId(authInfo));
    if (!service) throw new AdminError("FORBIDDEN", "활성 운영자 권한이 필요합니다.", 403);
    const result = await service.execute(operation.name, operation.args, requestId);
    await service.audit({
      requestId,
      operation: operation.name,
      entrypoint: "api",
      outcome: "success",
      durationMs: Date.now() - startedAt,
      returnedCount: resultCount(result),
      sensitiveFieldsAccessed: operation.name === "member_get" && operation.args.includeContact === true,
    });
    response.status(200).json(result);
  } catch (error) {
    const adminError = toAdminError(error);
    response.status(adminError.status).json({ error: { code: adminError.code, message: adminError.message, requestId } });
  }
});

export default app;
