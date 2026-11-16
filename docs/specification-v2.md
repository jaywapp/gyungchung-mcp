# 관리자 MCP v2 — 쓰기 도구 명세

- 상태: 구현 완료, 운영 미적용 (2026-11-16)
- 설계: [admin-write-v2-design.md](admin-write-v2-design.md), 작업 기록: [admin-write-v2-tasks.md](admin-write-v2-tasks.md)
- 도구 정의 원본: `spec/mcp-tools-v2.json`
- DB 함수 원본: `gyungchung` 레포 `apps/web/supabase/migrations/20261116090000` ~ `20261116090400`

v1의 조회 도구 11개는 그대로다. v2는 도구 14개를 더한다. MCP 서버는 도구 인자를 고치지 않고 `supabase.rpc("mcp_admin_<도구 이름>", { p_input: 인자 })`로 넘긴다. 권한 확인, 중복 요청 확인, 미리보기 토큰 확인, 저장, 변경 기록은 DB 함수가 한 트랜잭션에서 한다.

## 도구

| 도구 | 권한 | 종류 | 확인 절차 |
|---|---|---|---|
| `tables_list` | 활성 회원 (웹과 같은 행 규칙) | 조회 | — |
| `table_describe` | 활성 회원 (웹과 같은 행 규칙) | 조회 | — |
| `rows_query` | 활성 회원 (웹과 같은 행 규칙) | 조회 | — |
| `rows_insert` | 활성 회원 (웹과 같은 행 규칙) | 쓰기 | 항상 미리보기 |
| `rows_update` | 활성 회원 (웹과 같은 행 규칙) | 쓰기 | 항상 미리보기 |
| `rows_delete` | 활성 회원 (웹과 같은 행 규칙) | 쓰기 | 항상 미리보기 |
| `changes_list` | 시스템 관리자 | 조회 | — |
| `attendance_save` | `events.manage` | 쓰기 | 항상 미리보기 |
| `event_teams_save` | `events.manage` | 쓰기 | 항상 미리보기 |
| `event_game_state` | `events.manage` | 조회 | — |
| `event_game_save` | `events.manage` | 쓰기 | 항상 미리보기 |
| `event_game_finalize` | `events.manage` | 쓰기 | 항상 미리보기 |
| `event_winners_save` | `events.manage` | 쓰기 | 항상 미리보기 |
| `fees_charge_monthly` | `fees.manage` | 쓰기 | 항상 미리보기 |

권한이 없는 도구는 `tools/list`에 보이지 않는다. 직접 호출해도 DB 함수가 거부한다. 웹 세션 토큰(OAuth `client_id`가 없는 토큰)으로는 어떤 `mcp_admin_*` 함수도 쓸 수 없다.

## 반환

```jsonc
{ "status": "ok", "rows": [...], "page": { "limit": 25, "offset": 0, "hasMore": false } }          // 조회
{ "status": "applied", "replayed": false, "changeId": 12, "affectedCount": 1, "rows": [...] }      // 저장됨
{ "status": "preview", "confirmToken": "<uuid>", "expiresAt": "...", "preview": { "affectedCount": 3, ... } }  // 저장 안 함
```

## 권한

권한은 경충FC 웹과 늘 같다(2026-11-16 사용자 결정, 마이그레이션 `20261116110000_mcp_admin_web_permissions`). 따로 관리하는 MCP 권한 표는 없고, 호출할 때마다 DB가 판단한다. 웹이나 앱에서 역할을 바꾸면 다음 호출부터 적용된다.

- **웹이 직접 읽고 쓰는 표**(`authenticated`에 권한이 있고 RLS로 지키는 표): 범용 표 도구가 호출한 사람의 자격으로 실행한다. 웹과 같은 RLS 정책이 보이는 행과 바꿀 수 있는 행을 정한다. 예: 일정·장소는 `events.manage`, 회비는 `fees.manage`, 공지는 `notices.manage`, 회원은 `members.manage`, 참석 응답은 본인 것 또는 `events.manage`.
- **웹이 전용 함수로만 다루는 표**(직접 권한이 없는 표): 범용 표 도구로는 시스템 관리자만 다룬다.
- **시스템 관리자**: 허용 목록의 모든 표를 다룬다(웹에서도 모든 권한을 가진다).
- **전용 도구**(출석 일괄 저장, 팀, 경기, 우승, 회비 일괄 부과): 웹이 쓰는 함수의 권한 검사를 그대로 따른다.
- `changes_list`는 MCP 전용 기능이라 시스템 관리자만 쓴다.
- 서버는 도구 목록을 권한에 맞춰 보여 주지만, 실제 판단은 항상 DB가 한다.
- 추가(`rows_insert`)는 미리보기 때 실제로 넣어 보고 되돌리므로, 권한이 없거나 제약에 어긋나면 미리보기에서 오류가 난다.

## 미리보기 절차

모든 쓰기 도구는 1건이어도 미리보기를 거친다(2026-11-16 사용자 결정, 마이그레이션 `20261116100000_mcp_admin_always_preview`). `rows_update`의 `expected`는 없어졌고, 미리보기 때 대상 행 전체의 해시가 그 역할을 한다.

1. `confirmToken` 없이 호출하면 저장하지 않고 미리보기와 토큰을 돌려준다. 토큰은 10분 뒤 만료되고 한 번만 쓸 수 있다.
2. AI가 미리보기를 운영자에게 보여 주고 승인을 받는다.
3. **같은 인자(같은 `requestId` 포함)**에 `confirmToken`을 더해 다시 호출한다.
4. 대상이 미리보기 이후 바뀌었으면 `STALE_PREVIEW`로 거부한다. 미리보기를 다시 받는다.

## 중복 실행 방지

쓰기 도구는 `requestId`(UUID)가 필수다. 같은 운영자가 같은 `requestId`와 같은 인자로 다시 호출하면 저장하지 않고 첫 결과에 `replayed: true`를 붙여 돌려준다. 같은 `requestId`에 다른 인자를 보내면 `INVALID_ARGUMENT`다.

## 오류 코드

DB 함수는 `MCP:<코드>:<한국어 메시지>` 형태로 오류를 던지고 MCP 서버가 풀어서 전달한다. 형식이 다른 DB 오류는 내용을 숨기고 `INTERNAL_ERROR`로 바꾼다.

| 코드 | 뜻 | AI가 할 일 |
|---|---|---|
| `INVALID_ARGUMENT` | 인자 형식이 틀렸다 | `table_describe`나 `event_game_state`로 형식을 확인한다 |
| `UNAUTHENTICATED` | OAuth 토큰이 아니다 | 다시 연결한다 |
| `FORBIDDEN` | 권한이 없다 | 운영자에게 알린다 |
| `NOT_FOUND` | 대상이 없다 | 다시 조회한다 |
| `TABLE_NOT_ALLOWED` | 허용 목록에 없는 표·열이거나 조회 전용 표다 | `tables_list`, `table_describe`를 본다 |
| `CONFLICT` | 조회한 뒤 값이 바뀌었다 | 다시 조회한다 |
| `PREVIEW_REQUIRED` | 유효한 미리보기 승인이 없다 | `confirmToken` 없이 다시 호출한다 |
| `STALE_PREVIEW` | 미리보기 이후 대상이 바뀌었다 | 미리보기를 다시 받는다 |
| `CONSTRAINT_VIOLATION` | DB 제약이나 트리거 규칙에 막혔다 | 메시지를 운영자에게 전한다 |

## 범용 표 도구

- 표 이름은 `tables_list`가 돌려주는 이름이다. 목록에 없는 표는 없는 것처럼 동작한다.
- 조건(`filters`)의 연산: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `is_null`. 여러 조건은 모두 만족해야 한다. 범위는 `gte`와 `lte`를 함께 쓴다.
- 조회는 한 번에 최대 100행, 쓰기는 최대 200행이다. 수정과 삭제는 조건이 하나 이상 있어야 한다.
- 민감 열(회원·용병 전화번호, 회원 이메일 등)은 `columns`에 이름을 적어야 조회된다. 호출 기록에 민감 조회로 남는다. 변경 기록에는 값 대신 `[changed]` 또는 `[redacted]`만 남는다.
- 연결된 표의 이름을 함께 보려면 `include`에 `table_describe`의 `relations` 키를 적는다. 예: 회비 조회에 `include: ["member"]`.
- 범용 쓰기는 RLS를 거치지 않는다. DB의 제약 조건과 트리거는 그대로 적용된다. 예를 들어 회비 금액은 트리거가 회원 유형에 맞는 표준 금액으로 고정한다.

### 허용 목록에 표 더하기

`gyungchung` 레포에 마이그레이션을 추가해 `private.mcp_table_registry`에 행을 넣는다. 정할 것: 모드(`read`/`write`), 기본 키, 읽을 수 있는 열, 민감 열, 쓸 수 있는 열, 추가·삭제 허용 여부, 연결(`relations`), 한국어 설명. 적용 뒤 `select * from private.mcp_registry_problems()`가 빈 결과인지 확인한다. 리비전 열이 있거나 다른 표와 함께 움직이는 표는 `read`로 두고 전용 도구를 만든다.

## 일정 도구

기존 웹 저장 함수를 그대로 호출한다. 경기 로직은 한 벌이다.

- `attendance_save`. 항목마다 `responseStatus`(`going`, `not_going`, `undecided`)나 `checkInStatus`(`present`, `late`, `absent`, `null`) 중 하나 이상이 필요하다. 참석 여부는 MCP 함수가 `attendance` 표에 직접 저장한다(기존 `save_attendance_batch`는 당일 출석만 기록하고 참석 여부만 따로 저장하지 못한다). 당일 출석은 `save_attendance_batch`로 저장한다.
- `event_teams_save` → `save_event_teams`.
- `event_winners_save` → `save_event_winners`. 최대 6명.
- `event_game_state` → `get_event_team_mode`, `get_event_game_workspace`, `get_event_goals_only`, `get_event_goal_state`.
- `event_game_save` → `target`에 따라 `save_event_game_operation`, `save_event_goal_operation`, `save_event_goals_only_stat`, `save_event_team_mode`. `operation` 객체에 `eventId`와 `requestId`를 채워 넘긴다.
- `event_game_finalize` → `finalize_event_game`.

경기 저장의 전형적인 순서: `event_game_state`로 상태를 읽는다 → `team_mode`로 운영 방식을 정한다 → `game_operation`의 `save_roster`, `create_game`, `commit_game` → `goal_operation`의 `add_goal`(또는 `goals_only_stat`) → `event_game_state`로 `gameRevision`을 다시 읽는다 → `event_game_finalize`. 경기 기록의 변경 전·후는 기존 `private.event_game_changes`에 남고, MCP 변경 기록에는 호출 사실이 남는다.

## 회비 일괄 부과

`fees_charge_monthly`는 웹의 월회비 일괄 등록과 같은 규칙을 쓴다. 대상은 테스트 계정이 아닌 활동 회원 중 관리자이거나 참여비 회원이 아닌 사람이다. 그 달 월회비가 이미 있는 회원은 건너뛴다. 금액은 관리자 15,000원, 일반 회원 30,000원이다. `packages/core`의 `FEE_AMOUNTS`와 어긋나면 `apps/web/lib/mcp-fee-amounts.test.mjs`가 실패한다.

## 기록

- 호출 기록 `private.mcp_audit_logs`: 성공·거부·오류를 포함한 모든 호출. 범용 도구는 `rows_update:fees`처럼 표 이름이 붙는다. 90일 보존.
- 변경 기록 `private.mcp_change_log`: 성공한 변경마다 요청 ID, 시각, 운영자, OAuth 클라이언트, 도구, 표, 행 ID, 변경 전·후, 영향받은 행 수. 1년 보존. `changes_list`로 조회한다.

## 연결

MCP 주소는 `https://gyungchung-mcp.vercel.app/api/mcp`다. Claude와 ChatGPT의 커넥터 설정에 이 주소를 추가하고 경충FC 운영자 계정으로 로그인한다. Supabase의 OAuth 클라이언트 자동 등록이 켜져 있어야 한다.

## 검증

- MCP 서버: `npm run check`
- DB 함수: `gyungchung` 레포 `apps/web`에서 `node scripts/verify-mcp-admin-database.mjs` (PGlite 필요. 외부 모듈을 쓰려면 `MCP_PGLITE_MODULE`에 경로를 준다). 팀·경기·확정의 기존 함수는 이 검사에서 스텁이므로, 운영 적용 전에 운영 DB에서 되돌리는 시험 적용으로 실제 함수와의 결합을 확인한다.
