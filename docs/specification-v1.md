# 경충FC 관리자 MCP v1 명세

- 상태: Draft
- 범위: 조회 전용
- 대상 클라이언트: ChatGPT, Codex, Claude
- 전송 방식: MCP Streamable HTTP
- 인증 제공자: Supabase Auth OAuth 2.1

## 0. 확정된 제품 결정

| 항목 | 결정 |
|---|---|
| 소스 저장소 | `https://github.com/jaywapp/gyungchung-mcp` |
| MCP 실행 주소 | 배포 후 생성되는 HTTPS 주소의 `/mcp`. GitHub 저장소 URL은 실행 주소로 사용하지 않음 |
| OAuth 동의 화면 | 기존 경충FC 앱의 `/oauth/consent` |
| 연락처 상세 조회 | v1에서 허용. `member_get(includeContact: true)`로만 제공하고 감사 로그 필수 |
| OAuth client 등록 | ChatGPT, Codex, Claude 공용 Dynamic Client Registration 사용 |
| JWT 서명 | OIDC `openid` 사용을 위해 Supabase 비대칭 서명 키 사용 |
| 감사 로그 | Supabase 비공개 스키마에 저장하고 기본 90일 보존 |
| 변경 작업 | v1에서 제외하고 v2로 분리 |

## 1. 목적

경충FC 운영진이 자연어로 회원, 회비, 일정, 출석, 공지, 의견, 투표·설문·선거 데이터를 조회할 수 있게 한다. 사용자가 현재 경충FC 웹 앱에서 가진 권한과 동일한 범위만 조회할 수 있어야 하며, 시스템 관리자는 전체 관리자 조회 도구를 사용할 수 있어야 한다.

v1은 읽기 전용 기반과 보안 경계를 검증하는 단계다. 데이터 생성, 수정, 삭제, 계정 프로비저닝, 비밀번호 초기화, 권한 변경은 제공하지 않는다.

## 2. 목표와 비목표

### 2.1 목표

- ChatGPT, Codex, Claude에서 동일한 원격 MCP 서버를 연결한다.
- 기존 Supabase 회원 계정으로 OAuth 인증한다.
- 현재 데이터베이스의 운영 권한을 매 요청마다 평가한다.
- 권한이 없는 도구는 도구 검색 결과에서 숨기고 직접 호출도 차단한다.
- MCP와 일반 Admin API가 하나의 도메인 서비스 및 응답 계약을 공유한다.
- 개인정보 노출과 운영자 조회를 감사할 수 있다.
- 목록 조회는 필터, 정렬, 페이지네이션을 일관되게 지원한다.

### 2.2 비목표

- 공개 사용자용 MCP
- 익명 조회
- 자연어를 SQL로 변환하여 임의 쿼리를 실행하는 기능
- Supabase `service_role` 또는 데이터베이스 접속 정보의 클라이언트 제공
- 기존 경충FC 웹 관리자 화면 대체
- v1에서의 데이터 변경 및 외부 시스템 변경
- MCP UI 또는 ChatGPT 전용 위젯

## 3. 시스템 구조

```text
ChatGPT / Codex / Claude
          |
          | MCP Streamable HTTP + OAuth access token
          v
POST /mcp ----------------------+
                                |
Admin API /api/v1/admin/* ------+--> Authentication
                                     Authorization
                                     AdminQueryService
                                     AuditLogger
                                          |
                                          v
                                      Supabase
```

MCP 어댑터가 Admin API를 네트워크로 다시 호출하지 않는다. 두 어댑터는 같은 프로세스 안에서 `AdminQueryService`를 직접 호출한다. 이 구조는 인증 토큰 전달을 최소화하고 API와 MCP의 권한 판단 및 응답 형식이 달라지는 것을 방지한다.

### 3.1 권장 기술 기준

- TypeScript
- Node.js 22 이상
- 공식 MCP TypeScript SDK
- JSON Schema 기반 MCP 입력 및 구조화 출력
- Supabase JavaScript SDK
- 단위 테스트와 HTTP/MCP 계약 테스트
- 상태를 서버 메모리에 보관하지 않는 stateless 요청 처리

라이브러리 버전과 배포 런타임은 구현 시작 시 최신 공식 문서와 호환성을 확인한 뒤 고정한다.

### 3.2 제안 디렉터리 구조

```text
src/
  auth/
  authorization/
  contracts/
  data/
  domain/
  http/
  mcp/
  observability/
  server.ts
tests/
  contract/
  integration/
  unit/
docs/
```

## 4. 인증

### 4.1 OAuth 흐름

1. 클라이언트가 MCP 서버의 보호 리소스 메타데이터를 조회한다.
2. 클라이언트가 Supabase Auth의 OAuth 2.1 메타데이터를 발견한다.
3. 필요하면 Dynamic Client Registration으로 OAuth 클라이언트를 등록한다.
4. 사용자가 경충FC 로그인 화면과 OAuth 동의 화면을 거친다.
5. Supabase Auth가 Authorization Code with PKCE 흐름으로 토큰을 발급한다.
6. 클라이언트가 매 MCP 요청에 `Authorization: Bearer <token>`을 포함한다.
7. 서버가 JWT를 검증하고 사용자와 현재 관리자 권한을 해석한다.

v1은 ChatGPT, Codex, Claude를 같은 방식으로 연결하기 위해 Dynamic Client Registration을 사용한다. 등록된 client ID, 이름, redirect URI, 최초·최근 사용 시각을 감사 대상으로 관리하고, 사용자가 동의 화면에서 요청 클라이언트를 확인할 수 있어야 한다.

### 4.2 필수 엔드포인트

| 메서드 | 경로 | 목적 |
|---|---|---|
| `POST` | `/mcp` | MCP Streamable HTTP 엔드포인트 |
| `GET` | `/.well-known/oauth-protected-resource` | MCP 보호 리소스 메타데이터 |
| `GET` | `/health` | 비인증 상태 확인. 민감 정보 반환 금지 |

Supabase Auth는 OAuth authorization server와 JWKS를 제공한다. 경충FC 웹 앱에는 OAuth 요청의 클라이언트, 리디렉션 주소, 요청 범위를 표시하고 사용자가 승인 또는 거부할 수 있는 동의 화면이 필요하다.

동의 화면의 최종 경로는 기존 경충FC 앱의 `/oauth/consent`로 확정한다. OAuth 요청의 `authorization_id`를 로그인 전후에 보존하고, 승인 및 거부 결과는 Supabase Auth가 반환한 정확한 redirect URL로만 이동시킨다.

### 4.3 토큰 검증

모든 인증 요청에서 다음을 검증한다.

- JWT 서명과 현재 Supabase JWKS 키
- `iss` 발급자
- MCP 서버를 위한 `aud` 또는 `resource`
- `exp`, `nbf`
- OAuth `client_id`
- 요청에 필요한 OAuth scope

토큰의 `user_metadata`는 권한 판단에 사용하지 않는다. JWT의 사용자 식별자를 `profiles.auth_user_id`와 연결한 뒤 데이터베이스에서 현재 상태를 조회한다.

### 4.4 OAuth scope와 업무 권한

OAuth scope는 사용자 식별과 연결 동의를 위한 상위 경계다. 실제 업무 권한은 경충FC 데이터베이스에서 계산한다.

- 초기 OAuth scope: `openid email profile`
- 업무 권한: `profiles`, `officer_permissions`, `role_permissions`에서 매 요청 계산
- 동의 화면은 OAuth scope 외에 “현재 운영 권한 범위에서 경충FC 관리자 데이터를 조회함”을 명시한다.

커스텀 OAuth scope 지원 여부가 구현 시점의 Supabase Auth와 ChatGPT 요구사항에 맞는지 확인한 뒤, 지원되는 경우 `admin:read`를 추가 검토한다.

`openid` scope의 ID token 발급과 공개 JWKS 검증을 위해 운영 Supabase 프로젝트는 비대칭 JWT 서명 키를 사용한다. 구형 대칭 키를 MCP 서버에 공유하지 않는다.

## 5. 권한 모델

### 5.1 운영자 자격

다음 조건을 모두 만족해야 관리자 MCP를 사용할 수 있다.

- 유효한 Supabase Auth 사용자다.
- `profiles.auth_user_id`에 연결된 프로필이 존재한다.
- 프로필 상태가 `active`다.
- 시스템 관리자이거나 하나 이상의 운영 권한을 가진 관리자다.

`pending`, `inactive`, 연결되지 않은 사용자에게는 관리자 도구를 노출하지 않는다.

### 5.2 유효 권한 계산

1. `is_system_admin = true`이면 모든 기본 관리자 권한과 `role_permissions.role = 'admin'` 추가 권한을 부여한다.
2. 그 외 사용자가 `role = 'manager'`이고 `officer_title`이 있으면 해당 직책의 `officer_permissions`를 부여한다.
3. 그 외에는 관리자 권한이 없다.

기본 권한 키는 다음과 같다.

- `roles.manage`
- `officers.manage`
- `members.manage`
- `fees.manage`
- `notices.manage`
- `events.manage`
- `feedback.manage`
- `elections.manage`
- `polls.manage`
- `surveys.manage`

### 5.3 이중 권한 검사

- `tools/list`: 호출자의 유효 권한에 맞는 도구만 반환한다.
- `tools/call`: 도구 실행 직전에 사용자 상태와 권한을 다시 조회한다.

도구가 숨겨져 있다는 사실은 보안 통제가 아니다. 직접 작성한 MCP 요청, 오래된 도구 목록, 캐시된 세션으로 호출하더라도 서버가 거부해야 한다.

### 5.4 참여 항목의 동적 권한

참여 폼의 `kind`에 따라 다음 권한을 적용한다.

| `kind` | 필요 권한 |
|---|---|
| `election` | `elections.manage` |
| `poll` | `polls.manage` |
| `survey` | `surveys.manage` |

폼 ID만 입력받은 경우 서버가 폼 종류를 먼저 조회한 뒤 필요한 권한을 판정한다.

## 6. 공통 API 계약

### 6.1 응답 봉투

성공 응답은 다음 구조를 사용한다.

```json
{
  "data": {},
  "meta": {
    "requestId": "req_01...",
    "generatedAt": "2026-08-28T12:00:00.000Z"
  }
}
```

목록 응답의 `meta`에는 페이지네이션 정보를 추가한다.

```json
{
  "data": [],
  "meta": {
    "requestId": "req_01...",
    "generatedAt": "2026-08-28T12:00:00.000Z",
    "page": {
      "limit": 50,
      "nextCursor": null,
      "hasMore": false
    }
  }
}
```

### 6.2 페이지네이션

- cursor 기반 페이지네이션을 사용한다.
- 기본 `limit`은 25, 최대 `limit`은 100이다.
- cursor는 불투명 문자열이며 클라이언트가 내용을 해석하지 않는다.
- 안정적인 정렬을 위해 각 도메인의 정렬 키와 `id`를 함께 사용한다.

### 6.3 날짜와 시간

- 모든 timestamp는 UTC ISO 8601 문자열로 반환한다.
- 날짜만 의미하는 값은 `YYYY-MM-DD`를 사용한다.
- 사용자의 자연어 날짜는 MCP 도구 설명에서 `Asia/Seoul` 기준으로 해석하되 API 입력은 명시적인 날짜 또는 timestamp만 받는다.

### 6.4 오류 응답

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "이 작업에 필요한 운영 권한이 없습니다.",
    "requestId": "req_01..."
  }
}
```

| HTTP | 코드 | 의미 |
|---|---|---|
| `400` | `INVALID_ARGUMENT` | 입력값 또는 필터 오류 |
| `401` | `UNAUTHENTICATED` | 누락, 만료 또는 유효하지 않은 토큰 |
| `403` | `FORBIDDEN` | 운영자 자격 또는 업무 권한 부족 |
| `404` | `NOT_FOUND` | 조회 권한 범위에서 대상을 찾을 수 없음 |
| `409` | `STALE_CONTEXT` | 실행 중 권한 또는 계정 상태가 변경됨 |
| `429` | `RATE_LIMITED` | 호출 한도 초과 |
| `500` | `INTERNAL_ERROR` | 내부 오류. 상세 정보 비공개 |

MCP 오류는 `isError: true`로 반환하고 구조화 출력에 같은 `code`, `message`, `requestId`를 포함한다.

### 6.5 캐시

- 인증된 응답에 `Cache-Control: private, no-store`를 사용한다.
- 사용자별 관리자 응답을 CDN 또는 공유 캐시에 저장하지 않는다.
- MCP 서버 프로세스는 사용자 데이터나 권한을 장기 메모리 캐시하지 않는다.

## 7. Admin API v1

모든 엔드포인트는 `Authorization: Bearer <token>`을 요구한다.

| 메서드 | 경로 | 필요 권한 | 설명 |
|---|---|---|---|
| `GET` | `/api/v1/admin/context` | 운영자 자격 | 내 프로필, 유효 권한, 사용 가능한 기능 |
| `GET` | `/api/v1/admin/members` | `members.manage` | 회원 검색과 목록 |
| `GET` | `/api/v1/admin/members/{memberId}` | `members.manage` | 회원 상세 |
| `GET` | `/api/v1/admin/fees/overview` | `fees.manage` | 회비 요약 |
| `GET` | `/api/v1/admin/fees` | `fees.manage` | 회원 및 용병 회비 목록 |
| `GET` | `/api/v1/admin/notices` | `notices.manage` | 공지 목록 |
| `GET` | `/api/v1/admin/events` | `events.manage` | 일정 검색과 목록 |
| `GET` | `/api/v1/admin/events/{eventId}/operations` | `events.manage` | 일정·참석·용병·팀·경기 정보 |
| `GET` | `/api/v1/admin/feedback` | `feedback.manage` | 운영 의견 목록 |
| `GET` | `/api/v1/admin/participation/forms` | 종류별 권한 | 선거·투표·설문 목록 |
| `GET` | `/api/v1/admin/participation/forms/{formId}/results` | 종류별 권한 | 참여 결과 |

### 7.1 목록 필터 공통 규칙

- 빈 문자열은 필터 미지정으로 처리한다.
- 검색어는 앞뒤 공백을 제거한다.
- enum이 아닌 값은 무시하지 않고 `INVALID_ARGUMENT`로 거부한다.
- 권한으로 볼 수 없는 행은 존재 여부를 드러내지 않고 결과에서 제외하거나 `NOT_FOUND`로 처리한다.
- 응답 필드는 allowlist로 명시하며 `select *`를 사용하지 않는다.

## 8. MCP 도구 v1

모든 v1 도구에 다음 MCP annotation을 적용한다.

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

도구는 `structuredContent`에 API의 `data`와 필요한 `meta`를 반환한다. 텍스트 content는 사람이 바로 이해할 수 있는 짧은 요약만 포함하며 전체 JSON을 중복 출력하지 않는다.

`spec/mcp-tools-v1.json`은 구현 소스 manifest다. 각 도구의 `outputSchemaRef`는 `openapi/admin-api-v1.yaml`의 응답 스키마를 가리킨다. 서버를 빌드할 때 외부 참조를 해석해 MCP 도구의 실제 `outputSchema`로 포함해야 하며 런타임에 파일 경로 참조를 그대로 노출하지 않는다.

### 8.1 `admin_get_context`

현재 사용자의 운영자 정보와 유효 권한을 반환한다. 연결 확인과 권한 설명에 사용한다.

필요 권한: 운영자 자격

입력:

```json
{}
```

출력 핵심 필드:

```json
{
  "operator": {
    "profileId": "uuid",
    "name": "홍길동",
    "role": "manager",
    "officerTitle": "treasurer",
    "isSystemAdmin": false
  },
  "permissions": ["fees.manage"],
  "availableDomains": ["fees"]
}
```

### 8.2 `members_search`

이름, 전화번호 일부, 상태, 역할로 회원을 검색한다. 목록에서는 전화번호 전체를 반환하지 않는다.

필요 권한: `members.manage`

입력:

```json
{
  "query": "string, optional",
  "status": "active | inactive | pending, optional",
  "role": "member | manager, optional",
  "includeTestAccounts": false,
  "limit": 25,
  "cursor": "string, optional"
}
```

`includeTestAccounts = true`는 시스템 관리자만 사용할 수 있다.

출력 항목:

- `id`
- `name`
- `phoneLast4`
- `role`
- `officerTitle`
- `isSystemAdmin`
- `feePlan`
- `position`
- `jerseyNumber`
- `joinedAt`
- `status`
- `hasLoginAccount`

### 8.3 `member_get`

회원 한 명의 상세 정보를 조회한다. 연락처가 필요한 경우에만 명시적으로 요청한다.

필요 권한: `members.manage`

입력:

```json
{
  "memberId": "uuid",
  "includeContact": false
}
```

`includeContact = true`이면 응답에 `phone`, `email`이 포함될 수 있으며 감사 로그에 민감 필드 조회 사실을 남긴다. 실제 연락처 값은 로그에 남기지 않는다.

전체 연락처 조회는 v1에서 허용한다. MCP 응답의 사람용 요약에는 사용자가 연락처를 직접 요청한 경우에만 전체 값을 포함하고, 그 외에는 구조화 출력에도 연락처 필드를 넣지 않는다.

### 8.4 `fees_get_overview`

기간별 회비 현황을 집계한다.

필요 권한: `fees.manage`

입력:

```json
{
  "fromMonth": "YYYY-MM, optional",
  "toMonth": "YYYY-MM, optional",
  "feeType": "monthly | participation | all",
  "includeGuests": true
}
```

출력 핵심 필드:

- 상태별 건수와 금액
- 회원 회비와 용병 회비 구분
- 해당 기간의 미납 인원 수
- 집계 기준과 기간

### 8.5 `fees_list`

회원 또는 용병 회비 항목을 검색한다.

필요 권한: `fees.manage`

입력:

```json
{
  "query": "string, optional",
  "status": "paid | unpaid | exempt, optional",
  "feeType": "monthly | participation | guest | all",
  "fromMonth": "YYYY-MM, optional",
  "toMonth": "YYYY-MM, optional",
  "limit": 25,
  "cursor": "string, optional"
}
```

### 8.6 `notices_list`

공지 목록을 조회한다.

필요 권한: `notices.manage`

입력:

```json
{
  "query": "string, optional",
  "pinnedOnly": false,
  "limit": 25,
  "cursor": "string, optional"
}
```

### 8.7 `events_list`

기간, 검색어, 경기 모드로 일정을 조회한다.

필요 권한: `events.manage`

입력:

```json
{
  "from": "ISO 8601 timestamp, optional",
  "to": "ISO 8601 timestamp, optional",
  "query": "string, optional",
  "competitiveOnly": false,
  "limit": 25,
  "cursor": "string, optional"
}
```

목록 응답에는 참석 상태별 집계, 용병 수, 팀 편성 여부, 경기 기록 여부를 포함하고 상세 로스터는 포함하지 않는다.

### 8.8 `event_get_operations`

한 일정의 운영 상세를 조회한다.

필요 권한: `events.manage`

입력:

```json
{
  "eventId": "uuid",
  "includeAttendance": true,
  "includeGuests": true,
  "includeTeams": true,
  "includeMatches": true
}
```

출력은 일정, 장소, RSVP, 실제 출석, 용병, 팀 편성, 경기 스코어와 득점 기록을 섹션별로 구분한다.

### 8.9 `feedback_list`

운영 의견을 검색한다.

필요 권한: `feedback.manage`

입력:

```json
{
  "query": "string, optional",
  "category": "operation | system | facility | finance | safety | other, optional",
  "status": "received | reviewing | resolved | closed, optional",
  "githubPublicationStatus": "not_requested | pending | published | failed, optional",
  "limit": 25,
  "cursor": "string, optional"
}
```

익명 의견은 운영자가 작성자를 식별할 수 있는 내부 데이터가 있더라도 MCP 응답에서 익명성을 유지한다. 시스템 관리 목적의 별도 식별 기능은 v1 범위에 포함하지 않는다.

### 8.10 `participation_forms_list`

관리 권한이 있는 종류의 참여 폼만 조회한다.

필요 권한: 폼 종류별 관리 권한

입력:

```json
{
  "kind": "election | poll | survey, optional",
  "status": "draft | open | closed | archived, optional",
  "query": "string, optional",
  "limit": 25,
  "cursor": "string, optional"
}
```

`kind`를 생략하면 사용자가 관리할 수 있는 종류만 합쳐서 반환한다.

### 8.11 `participation_results_get`

참여 폼의 집계 결과를 조회한다.

필요 권한: 대상 폼 종류의 관리 권한

입력:

```json
{
  "formId": "uuid"
}
```

비밀 투표는 개인별 응답이나 재식별 가능한 데이터를 반환하지 않고 기존 집계 함수의 결과만 사용한다.

## 9. 개인정보와 보안

### 9.1 최소 공개

- 회원 목록은 전화번호 끝 네 자리만 반환한다.
- 전체 연락처는 `member_get`의 명시적 옵션으로만 반환한다.
- 인증 사용자 ID와 내부 인증 정보를 응답하지 않는다.
- 익명 의견 작성자를 MCP를 통해 재식별하지 않는다.
- 비밀 투표의 원본 응답을 반환하지 않는다.
- 모든 데이터 조회는 명시적인 필드 allowlist를 사용한다.

### 9.2 서버 자격 증명

- Supabase secret key 또는 `service_role`은 서버 환경에서만 사용한다.
- 해당 키를 MCP 응답, 오류, 로그, 소스 저장소에 포함하지 않는다.
- 서버의 privileged client를 사용하는 조회는 인증과 업무 권한 검사를 통과한 전용 도메인 함수에서만 수행한다.
- 임의 테이블명, 컬럼명, 정렬 SQL을 사용자 입력으로 받지 않는다.

### 9.3 프롬프트 인젝션과 비신뢰 데이터

공지, 의견, 회원 메모 등 데이터베이스의 텍스트는 비신뢰 데이터로 취급한다. 저장된 텍스트에 포함된 명령을 MCP 서버가 실행하거나 다른 도구 호출 지시로 해석하지 않는다. 도구 응답은 데이터와 설명을 구분하는 구조화 형식으로 반환한다.

### 9.4 호출 제한

초기 권장값:

- 운영자별 분당 60회
- 운영자별 동시 실행 5개
- 목록 최대 100건
- 조회 기간 기본 최대 1년, 명시적으로 요청하면 더 넓은 기간 허용

실제 한도는 운영 테스트 후 조정한다.

## 10. 감사와 관측성

모든 인증된 Admin API와 MCP 호출에 다음을 기록한다.

- `request_id`
- 실행 시각
- 운영자 profile ID
- OAuth client ID
- 진입점: `api` 또는 `mcp`
- 도구 또는 API 작업명
- 결과: 성공, 거부, 오류
- 소요 시간
- 반환 건수
- 민감 필드 조회 여부

다음은 기록하지 않는다.

- access token, refresh token, authorization code
- 전화번호, 이메일, 의견 본문
- 전체 MCP 요청 또는 전체 응답 본문
- Supabase secret key

권한 거부와 비정상적인 반복 조회는 별도 보안 이벤트로 집계한다.

감사 로그는 Supabase의 Data API 비노출 스키마에 저장한다. 기본 보존 기간은 90일이며, 만료된 로그는 예약 작업으로 삭제한다. 감사 쓰기는 서버 전용 자격 증명으로만 허용하고 일반 사용자와 MCP OAuth 토큰에는 테이블 접근 권한을 부여하지 않는다.

## 11. 테스트 요구사항

### 11.1 인증 테스트

- 토큰 없음, 만료, 잘못된 서명, 잘못된 발급자와 audience를 거부한다.
- 활성 사용자만 통과한다.
- 연결되지 않은 Auth 사용자를 거부한다.
- OAuth client와 consent 흐름을 ChatGPT, Codex, Claude에서 각각 검증한다.

### 11.2 권한 테스트

- 시스템 관리자는 모든 v1 도구를 볼 수 있다.
- 직책별 운영진은 부여된 권한 도구만 볼 수 있다.
- 권한이 제거되면 기존 세션에서도 다음 호출부터 즉시 거부된다.
- 다른 종류의 참여 폼 ID를 사용해 권한을 우회할 수 없다.
- `includeTestAccounts`는 시스템 관리자만 사용할 수 있다.

### 11.3 데이터 계약 테스트

- 모든 목록에 cursor 페이지네이션이 일관되게 동작한다.
- 연락처 기본 마스킹과 명시적 상세 조회가 구분된다.
- 익명 의견과 비밀 투표 데이터가 재식별되지 않는다.
- API와 MCP의 구조화 결과가 같은 도메인 결과를 사용한다.

### 11.4 장애 테스트

- Supabase 연결 실패 시 내부 상세를 숨긴 오류를 반환한다.
- 감사 로그 실패 정책을 검증한다. 보안 감사 로그를 기록할 수 없으면 민감 조회는 실패 폐쇄를 기본값으로 한다.
- rate limit과 timeout이 클라이언트에 식별 가능한 오류로 전달된다.

## 12. v1 완료 조건

- Supabase OAuth 2.1 로그인과 동의가 동작한다.
- ChatGPT, Codex, Claude가 동일한 `/mcp`에 연결된다.
- 권한별 `tools/list` 결과가 자동으로 달라진다.
- 11개 조회 도구가 정의된 계약과 개인정보 규칙을 지킨다.
- 대응하는 Admin API 엔드포인트가 동일한 서비스 계층을 사용한다.
- 인증, 권한, 개인정보, 페이지네이션, 오류 계약 테스트가 통과한다.
- 감사 로그에서 운영자와 작업을 추적할 수 있다.
- 프로덕션 빌드와 배포 후 `/health`, OAuth discovery, MCP 연결을 확인한다.

## 13. v2 변경 도구 후보

v2는 v1 운영 결과와 감사 로그를 검토한 뒤 별도 명세로 작성한다.

- 회원 등록과 정보 수정
- 계정 프로비저닝과 비밀번호 초기화
- 회비 부과와 납부 상태 변경
- 공지, 장소, 일정 생성·수정
- 출석 일괄 저장
- 용병, 팀 편성, 경기 기록 저장
- 의견 상태와 운영진 답변 변경
- 투표·설문·선거 생성과 상태 변경
- 직책 권한 변경
- 회원 역할과 시스템 관리자 권한 변경

모든 변경 도구는 변경 미리보기, 명시적 승인, 멱등성 키, 변경 전후 감사 로그, 고위험 작업의 추가 인증을 기본 요구사항으로 한다.

## 14. 구현 전 확인할 결정

1. 배포 플랫폼과 Node.js 런타임 형태
2. 배포 플랫폼이 발급한 HTTPS 주소와 MCP canonical resource URI
3. 배포 리전과 timeout 한도
4. 운영 Supabase 프로젝트의 OAuth 2.1 기능 활성화 일정

GitHub 저장소 주소, OAuth 동의 화면 위치, 연락처 전체 조회, 비대칭 JWT 서명, DCR, 감사 로그 위치와 보존 기간은 0장의 결정으로 확정되었다.

## 15. 공식 참고 문서

- MCP 2026-07-28 Transports: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
- MCP 2026-07-28 Authorization: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- MCP 2026-07-28 Tools: https://modelcontextprotocol.io/specification/2026-07-28/server/tools
- OpenAI plugin MCP authentication: https://developers.openai.com/plugins/build/auth
- Supabase OAuth 2.1 Server: https://supabase.com/docs/guides/auth/oauth-server
- Supabase MCP authentication: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
