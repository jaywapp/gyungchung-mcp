import { randomUUID } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import type { AdminSupabaseClient } from "../data/supabase.js";
import { AdminError } from "./errors.js";
import { paginate } from "./pagination.js";

type Row = Record<string, any>;
type ToolArguments = Record<string, unknown>;

export const ADMIN_PERMISSIONS = [
  "roles.manage",
  "officers.manage",
  "members.manage",
  "fees.manage",
  "notices.manage",
  "events.manage",
  "feedback.manage",
  "elections.manage",
  "polls.manage",
  "surveys.manage",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const PARTICIPATION_PERMISSION: Record<string, AdminPermission> = {
  election: "elections.manage",
  poll: "polls.manage",
  survey: "surveys.manage",
};

export interface OperatorContext {
  profileId: string;
  userId: string;
  name: string;
  role: string;
  officerTitle: string | null;
  isSystemAdmin: boolean;
  permissions: AdminPermission[];
  availableDomains: string[];
}

export interface ServiceEnvelope<T = unknown> {
  data: T;
  meta: {
    requestId: string;
    generatedAt: string;
    page?: {
      limit: number;
      nextCursor: string | null;
      hasMore: boolean;
    };
  };
}

function assertNoError(error: PostgrestError | null, notFound = false): void {
  if (!error) return;
  if (notFound && error.code === "PGRST116") {
    throw new AdminError("NOT_FOUND", "조회 권한 범위에서 대상을 찾을 수 없습니다.", 404);
  }
  if (error.code === "42501") {
    throw new AdminError("FORBIDDEN", "이 작업에 필요한 운영 권한이 없습니다.", 403);
  }
  throw new AdminError("INTERNAL_ERROR", "관리자 데이터를 조회하지 못했습니다.", 500);
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function boolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function pageEnvelope<T>(requestId: string, items: T[], args: ToolArguments): ServiceEnvelope<T[]> {
  const page = paginate(items, args.limit, args.cursor);
  return {
    data: page.items,
    meta: {
      requestId,
      generatedAt: new Date().toISOString(),
      page: {
        limit: page.items.length,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
      },
    },
  };
}

function envelope<T>(requestId: string, data: T): ServiceEnvelope<T> {
  return { data, meta: { requestId, generatedAt: new Date().toISOString() } };
}

function matchesQuery(values: unknown[], query?: string): boolean {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("ko");
  return values.some((value) => String(value ?? "").toLocaleLowerCase("ko").includes(needle));
}

function monthInRange(month: string, from?: string, to?: string): boolean {
  const value = month.slice(0, 7);
  return (!from || value >= from) && (!to || value <= to);
}

function permissionDomains(permissions: readonly string[]): string[] {
  const domains = new Set<string>();
  for (const permission of permissions) {
    if (permission === "members.manage") domains.add("members");
    if (permission === "fees.manage") domains.add("fees");
    if (permission === "notices.manage") domains.add("notices");
    if (permission === "events.manage") domains.add("events");
    if (permission === "feedback.manage") domains.add("feedback");
    if (["elections.manage", "polls.manage", "surveys.manage"].includes(permission)) domains.add("participation");
  }
  return [...domains];
}

export class AdminQueryService {
  private constructor(
    private readonly supabase: AdminSupabaseClient,
    readonly operator: OperatorContext,
  ) {}

  static async create(supabase: AdminSupabaseClient, userId: string): Promise<AdminQueryService | null> {
    const profileResult = await supabase
      .from("profiles")
      .select("id, auth_user_id, name, role, officer_title, is_system_admin, status")
      .eq("auth_user_id", userId)
      .maybeSingle();
    assertNoError(profileResult.error);
    const profile = profileResult.data as Row | null;
    if (!profile || profile.status !== "active") return null;

    let permissions: AdminPermission[] = [];
    if (profile.is_system_admin === true) {
      permissions = [...ADMIN_PERMISSIONS];
    } else if (profile.role === "manager" && typeof profile.officer_title === "string") {
      const permissionResult = await supabase
        .from("officer_permissions")
        .select("permission")
        .eq("officer_title", profile.officer_title);
      assertNoError(permissionResult.error);
      const allowed = new Set<string>(ADMIN_PERMISSIONS);
      permissions = ((permissionResult.data ?? []) as Row[])
        .map((item) => item.permission)
        .filter((permission): permission is AdminPermission => typeof permission === "string" && allowed.has(permission));
    }

    if (permissions.length === 0) return null;
    return new AdminQueryService(supabase, {
      profileId: String(profile.id),
      userId,
      name: String(profile.name),
      role: String(profile.role),
      officerTitle: typeof profile.officer_title === "string" ? profile.officer_title : null,
      isSystemAdmin: profile.is_system_admin === true,
      permissions,
      availableDomains: permissionDomains(permissions),
    });
  }

  hasPermission(permission: AdminPermission): boolean {
    return this.operator.permissions.includes(permission);
  }

  requirePermission(permission: AdminPermission): void {
    if (!this.hasPermission(permission)) {
      throw new AdminError("FORBIDDEN", "이 작업에 필요한 운영 권한이 없습니다.", 403);
    }
  }

  async getContext(requestId = randomUUID()): Promise<ServiceEnvelope> {
    return envelope(requestId, {
      operator: {
        profileId: this.operator.profileId,
        name: this.operator.name,
        role: this.operator.role,
        officerTitle: this.operator.officerTitle,
        isSystemAdmin: this.operator.isSystemAdmin,
      },
      permissions: this.operator.permissions,
      availableDomains: this.operator.availableDomains,
    });
  }

  async searchMembers(args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    this.requirePermission("members.manage");
    const includeTestAccounts = boolean(args.includeTestAccounts, false);
    if (includeTestAccounts && !this.operator.isSystemAdmin) {
      throw new AdminError("FORBIDDEN", "테스트 계정은 시스템 관리자만 조회할 수 있습니다.", 403);
    }

    const result = await this.supabase.rpc("mcp_admin_list_profiles", {
      include_test_accounts: includeTestAccounts,
    });
    assertNoError(result.error);
    const query = text(args.query);
    const rows = ((result.data ?? []) as Row[])
      .filter((row) => !args.status || row.status === args.status)
      .filter((row) => !args.role || row.role === args.role)
      .filter((row) => matchesQuery([row.name, row.phone], query))
      .sort((left, right) => String(left.name).localeCompare(String(right.name), "ko"))
      .map((row) => ({
        id: row.id,
        name: row.name,
        phoneLast4: typeof row.phone === "string" ? row.phone.replace(/\D/g, "").slice(-4) || null : null,
        role: row.role,
        officerTitle: row.officer_title,
        isSystemAdmin: row.is_system_admin === true,
        feePlan: row.fee_plan,
        position: row.position,
        jerseyNumber: row.jersey_number,
        joinedAt: row.joined_at,
        status: row.status,
        hasLoginAccount: Boolean(row.auth_user_id),
      }));
    return pageEnvelope(requestId, rows, args);
  }

  async getMember(args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    this.requirePermission("members.manage");
    const memberId = text(args.memberId);
    if (!memberId) throw new AdminError("INVALID_ARGUMENT", "memberId가 필요합니다.", 400);
    const result = await this.supabase.rpc("mcp_admin_list_profiles", { include_test_accounts: this.operator.isSystemAdmin });
    assertNoError(result.error);
    const row = ((result.data ?? []) as Row[]).find((item) => item.id === memberId);
    if (!row) throw new AdminError("NOT_FOUND", "조회 권한 범위에서 회원을 찾을 수 없습니다.", 404);
    const includeContact = boolean(args.includeContact, false);
    const data: Row = {
      id: row.id,
      name: row.name,
      role: row.role,
      officerTitle: row.officer_title,
      isSystemAdmin: row.is_system_admin === true,
      isTestAccount: row.is_test_account === true,
      feePlan: row.fee_plan,
      position: row.position,
      jerseyNumber: row.jersey_number,
      joinedAt: row.joined_at,
      status: row.status,
      hasLoginAccount: Boolean(row.auth_user_id),
    };
    if (includeContact) {
      data.phone = row.phone ?? null;
      data.email = row.email ?? null;
    }
    return envelope(requestId, data);
  }

  async getFeeOverview(args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    this.requirePermission("fees.manage");
    const fromMonth = text(args.fromMonth);
    const toMonth = text(args.toMonth);
    const feeType = text(args.feeType) ?? "all";
    const includeGuests = boolean(args.includeGuests, true);
    const [memberResult, guestResult] = await Promise.all([
      this.supabase.from("fees").select("id, member_id, month, amount, status, fee_type"),
      includeGuests
        ? this.supabase.from("event_guest_fees").select("event_id, guest_player_id, amount, status, events(starts_at)")
        : Promise.resolve({ data: [], error: null }),
    ]);
    assertNoError(memberResult.error);
    assertNoError(guestResult.error as PostgrestError | null);
    const members = ((memberResult.data ?? []) as Row[]).filter((row) =>
      monthInRange(String(row.month), fromMonth, toMonth) && (feeType === "all" || row.fee_type === feeType),
    );
    const guests = ((guestResult.data ?? []) as Row[]).filter((row) => {
      const startsAt = Array.isArray(row.events) ? row.events[0]?.starts_at : row.events?.starts_at;
      return monthInRange(String(startsAt ?? ""), fromMonth, toMonth);
    });
    const summarize = (rows: Row[]) => ({
      count: rows.length,
      amount: rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    });
    const combined = [...members, ...guests];
    return envelope(requestId, {
      range: { fromMonth: fromMonth ?? null, toMonth: toMonth ?? null },
      memberFees: summarize(members),
      guestFees: summarize(guests),
      byStatus: {
        paid: summarize(combined.filter((row) => row.status === "paid")),
        unpaid: summarize(combined.filter((row) => row.status === "unpaid")),
        exempt: summarize(combined.filter((row) => row.status === "exempt")),
      },
      unpaidMemberCount: new Set(members.filter((row) => row.status === "unpaid").map((row) => row.member_id)).size,
    });
  }

  async listFees(args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    this.requirePermission("fees.manage");
    const [memberResult, guestResult] = await Promise.all([
      this.supabase.from("fees").select("id, member_id, month, amount, status, fee_type, event_id, paid_at, profiles(name)"),
      this.supabase.from("event_guest_fees").select("event_id, guest_player_id, amount, status, paid_at, guest_players(name), events(title, starts_at)"),
    ]);
    assertNoError(memberResult.error);
    assertNoError(guestResult.error);
    const query = text(args.query);
    const fromMonth = text(args.fromMonth);
    const toMonth = text(args.toMonth);
    const feeType = text(args.feeType) ?? "all";
    const status = text(args.status);
    const memberRows = ((memberResult.data ?? []) as Row[]).map((row) => ({
      id: row.id,
      scope: "member",
      memberId: row.member_id,
      name: Array.isArray(row.profiles) ? row.profiles[0]?.name : row.profiles?.name,
      month: String(row.month).slice(0, 7),
      amount: row.amount,
      status: row.status,
      feeType: row.fee_type,
      eventId: row.event_id,
      paidAt: row.paid_at,
    }));
    const guestRows = ((guestResult.data ?? []) as Row[]).map((row) => ({
      id: `${row.event_id}:${row.guest_player_id}`,
      scope: "guest",
      guestPlayerId: row.guest_player_id,
      eventId: row.event_id,
      name: Array.isArray(row.guest_players) ? row.guest_players[0]?.name : row.guest_players?.name,
      eventTitle: Array.isArray(row.events) ? row.events[0]?.title : row.events?.title,
      month: String(Array.isArray(row.events) ? row.events[0]?.starts_at : row.events?.starts_at).slice(0, 7),
      amount: row.amount,
      status: row.status,
      feeType: "guest",
      paidAt: row.paid_at,
    }));
    const rows = ([...memberRows, ...guestRows] as Row[])
      .filter((row) => !status || row.status === status)
      .filter((row) => feeType === "all" || row.feeType === feeType)
      .filter((row) => monthInRange(row.month, fromMonth, toMonth))
      .filter((row) => matchesQuery([row.name, row.eventTitle, row.month], query))
      .sort((left, right) => right.month.localeCompare(left.month) || String(left.name).localeCompare(String(right.name), "ko"));
    return pageEnvelope(requestId, rows, args);
  }

  async listNotices(args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    this.requirePermission("notices.manage");
    const result = await this.supabase.from("notices").select("id, title, body, is_pinned, author_id, created_at, updated_at");
    assertNoError(result.error);
    const query = text(args.query);
    const pinnedOnly = boolean(args.pinnedOnly, false);
    const rows = ((result.data ?? []) as Row[])
      .filter((row) => !pinnedOnly || row.is_pinned === true)
      .filter((row) => matchesQuery([row.title, row.body], query))
      .sort((left, right) => Number(right.is_pinned) - Number(left.is_pinned) || String(right.created_at).localeCompare(String(left.created_at)))
      .map((row) => ({ id: row.id, title: row.title, body: row.body, isPinned: row.is_pinned, authorId: row.author_id, createdAt: row.created_at, updatedAt: row.updated_at }));
    return pageEnvelope(requestId, rows, args);
  }

  async listEvents(args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    this.requirePermission("events.manage");
    const result = await this.supabase
      .from("events")
      .select("id, title, starts_at, venue_id, venue, address, note, capacity, is_competitive, team_mode, attendance(status, check_in_status), event_guest_players(guest_player_id), event_teams(id), event_matches(id)");
    assertNoError(result.error);
    const from = text(args.from);
    const to = text(args.to);
    const query = text(args.query);
    const competitiveOnly = boolean(args.competitiveOnly, false);
    const rows = ((result.data ?? []) as Row[])
      .filter((row) => !from || row.starts_at >= from)
      .filter((row) => !to || row.starts_at <= to)
      .filter((row) => !competitiveOnly || row.is_competitive === true)
      .filter((row) => matchesQuery([row.title, row.venue, row.address, row.note], query))
      .sort((left, right) => String(left.starts_at).localeCompare(String(right.starts_at)))
      .map((row) => {
        const attendance = (row.attendance ?? []) as Row[];
        return {
          id: row.id,
          title: row.title,
          startsAt: row.starts_at,
          venueId: row.venue_id,
          venue: row.venue,
          address: row.address,
          note: row.note,
          capacity: row.capacity,
          isCompetitive: row.is_competitive,
          attendance: {
            going: attendance.filter((item) => item.status === "going").length,
            notGoing: attendance.filter((item) => item.status === "not_going").length,
            undecided: attendance.filter((item) => item.status === "undecided").length,
            checkedIn: attendance.filter((item) => ["present", "late"].includes(item.check_in_status)).length,
          },
          guestCount: (row.event_guest_players ?? []).length,
          hasTeams: (row.event_teams ?? []).length > 0,
          hasMatches: (row.event_matches ?? []).length > 0,
        };
      });
    return pageEnvelope(requestId, rows, args);
  }

  async getEventOperations(args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    this.requirePermission("events.manage");
    const eventId = text(args.eventId);
    if (!eventId) throw new AdminError("INVALID_ARGUMENT", "eventId가 필요합니다.", 400);
    const result = await this.supabase
      .from("events")
      .select("id, title, starts_at, venue_id, venue, address, note, capacity, is_competitive, team_mode, attendance(event_id, member_id, status, check_in_status, checked_in_at, profiles(name, position, jersey_number)), event_guest_players(event_id, guest_player_id, guest_name, guest_position, created_at), event_teams(id, event_id, team_number, team_name, score, generation_mode, event_team_members(id, profile_id, guest_player_id, participant_name, participant_position, goals, rating)), event_matches(id, match_number, team_a_id, team_b_id, team_a_score, team_b_score, event_match_players(id, team_id, profile_id, guest_player_id, player_name), event_match_scorers(id, team_id, profile_id, guest_player_id, scorer_name, goals))")
      .eq("id", eventId)
      .single();
    assertNoError(result.error, true);
    const row = result.data as unknown as Row;
    return envelope(requestId, {
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      venueId: row.venue_id,
      venue: row.venue,
      address: row.address,
      note: row.note,
      capacity: row.capacity,
      isCompetitive: row.is_competitive,
      teamMode: row.team_mode,
      attendance: boolean(args.includeAttendance, true) ? row.attendance ?? [] : undefined,
      guests: boolean(args.includeGuests, true) ? row.event_guest_players ?? [] : undefined,
      teams: boolean(args.includeTeams, true) ? row.event_teams ?? [] : undefined,
      matches: boolean(args.includeMatches, true) ? row.event_matches ?? [] : undefined,
    });
  }

  async listFeedback(args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    this.requirePermission("feedback.manage");
    const result = await this.supabase
      .from("feedback")
      .select("id, author_id, category, title, body, is_anonymous, status, officer_response, publish_to_github, github_publication_status, github_issue_url, github_issue_state, created_at, updated_at, profiles(name)");
    assertNoError(result.error);
    const query = text(args.query);
    const rows = ((result.data ?? []) as Row[])
      .filter((row) => !args.category || row.category === args.category)
      .filter((row) => !args.status || row.status === args.status)
      .filter((row) => !args.githubPublicationStatus || row.github_publication_status === args.githubPublicationStatus)
      .filter((row) => matchesQuery([row.title, row.body, row.officer_response], query))
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
      .map((row) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        body: row.body,
        isAnonymous: row.is_anonymous,
        authorDisplayName: row.is_anonymous ? "익명" : (Array.isArray(row.profiles) ? row.profiles[0]?.name : row.profiles?.name) ?? "알 수 없음",
        status: row.status,
        officerResponse: row.officer_response,
        githubPublicationStatus: row.github_publication_status,
        githubIssueUrl: row.github_issue_url,
        githubIssueState: row.github_issue_state,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    return pageEnvelope(requestId, rows, args);
  }

  async listParticipationForms(args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    const requestedKind = text(args.kind);
    const allowedKinds = Object.entries(PARTICIPATION_PERMISSION)
      .filter(([, permission]) => this.hasPermission(permission))
      .map(([kind]) => kind);
    if (requestedKind && !allowedKinds.includes(requestedKind)) {
      throw new AdminError("FORBIDDEN", "이 참여 항목 종류를 관리할 권한이 없습니다.", 403);
    }
    if (allowedKinds.length === 0) throw new AdminError("FORBIDDEN", "참여 항목 관리 권한이 없습니다.", 403);

    const result = await this.supabase
      .from("participation_forms")
      .select("id, kind, title, description, status, starts_at, ends_at, secret_ballot, show_results, created_at, updated_at, participation_questions(id)")
      .in("kind", requestedKind ? [requestedKind] : allowedKinds);
    assertNoError(result.error);
    const query = text(args.query);
    const rows = ((result.data ?? []) as Row[])
      .filter((row) => !args.status || row.status === args.status)
      .filter((row) => matchesQuery([row.title, row.description], query))
      .sort((left, right) => String(right.created_at).localeCompare(String(left.created_at)))
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        description: row.description,
        status: row.status,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        secretBallot: row.secret_ballot,
        showResults: row.show_results,
        questionCount: (row.participation_questions ?? []).length,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    return pageEnvelope(requestId, rows, args);
  }

  async getParticipationResults(args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    const formId = text(args.formId);
    if (!formId) throw new AdminError("INVALID_ARGUMENT", "formId가 필요합니다.", 400);
    const formResult = await this.supabase.from("participation_forms").select("id, kind, title, secret_ballot, status").eq("id", formId).single();
    assertNoError(formResult.error, true);
    const form = formResult.data as unknown as Row;
    const permission = PARTICIPATION_PERMISSION[String(form.kind)];
    if (!permission) throw new AdminError("INVALID_ARGUMENT", "지원하지 않는 참여 항목 종류입니다.", 400);
    this.requirePermission(permission);
    const result = await this.supabase.rpc("mcp_admin_participation_results", { target_form_id: formId });
    assertNoError(result.error);
    return envelope(requestId, {
      form: { id: form.id, kind: form.kind, title: form.title, secretBallot: form.secret_ballot, status: form.status },
      results: result.data,
    });
  }

  async execute(operation: string, args: ToolArguments, requestId = randomUUID()): Promise<ServiceEnvelope> {
    switch (operation) {
      case "admin_get_context": return this.getContext(requestId);
      case "members_search": return this.searchMembers(args, requestId);
      case "member_get": return this.getMember(args, requestId);
      case "fees_get_overview": return this.getFeeOverview(args, requestId);
      case "fees_list": return this.listFees(args, requestId);
      case "notices_list": return this.listNotices(args, requestId);
      case "events_list": return this.listEvents(args, requestId);
      case "event_get_operations": return this.getEventOperations(args, requestId);
      case "feedback_list": return this.listFeedback(args, requestId);
      case "participation_forms_list": return this.listParticipationForms(args, requestId);
      case "participation_results_get": return this.getParticipationResults(args, requestId);
      default: throw new AdminError("NOT_FOUND", "지원하지 않는 관리자 작업입니다.", 404);
    }
  }

  async audit(input: {
    requestId: string;
    operation: string;
    entrypoint: "mcp" | "api";
    outcome: "success" | "denied" | "error";
    durationMs: number;
    returnedCount: number;
    sensitiveFieldsAccessed: boolean;
  }): Promise<void> {
    const result = await this.supabase.rpc("mcp_write_audit", {
      audit_request_id: input.requestId,
      audit_operation: input.operation,
      audit_entrypoint: input.entrypoint,
      audit_outcome: input.outcome,
      audit_duration_ms: input.durationMs,
      audit_returned_count: input.returnedCount,
      audit_sensitive_fields_accessed: input.sensitiveFieldsAccessed,
    });
    if (result.error && input.sensitiveFieldsAccessed) {
      throw new AdminError("INTERNAL_ERROR", "민감 정보 조회 감사 기록을 저장하지 못했습니다.", 500);
    }
    if (result.error) console.error("Audit write failed", { requestId: input.requestId, operation: input.operation });
  }
}

export function resultCount(result: ServiceEnvelope): number {
  return Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0;
}
