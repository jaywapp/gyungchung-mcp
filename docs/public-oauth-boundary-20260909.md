# 공개 OAuth·MCP 인증 경계 검증 — 2026-09-09

orchestrator: Codex. GET 요청만 수행했으며 신규 OAuth client 등록, 로그인·동의, 실제 회원 정보 조회, 원격 설정 및 DB 변경은 하지 않았다.

공개 배포 대상은 Vercel 프로젝트 조회로 확인한 https://gyungchung-mcp.vercel.app 이다. 로컬 코드 변경과 별개로 현재 배포의 응답을 검사했다.

| URL / 조건 | 실제 결과 |
|---|---|
| https://gyungchung-mcp.vercel.app/api/health | 200, status=ok, service=gyungchung-admin-mcp, Cache-Control=no-store |
| https://gyungchung-mcp.vercel.app/api/oauth-protected-resource | 200, resource=https://gyungchung-mcp.vercel.app/api/mcp, bearer header 지원 |
| https://gyungchung-mcp.vercel.app/.well-known/oauth-protected-resource | 200, 직접 함수 메타데이터와 동일 |
| https://gyungchung-mcp.vercel.app/api/mcp / 토큰 없음 | 401 invalid_token, Missing Authorization header |
| https://gyungchung-mcp.vercel.app/api/mcp / 고정된 비밀 아닌 잘못된 토큰 | 401 invalid_token, invalid or expired |
| https://gyungchung-mcp.vercel.app/api/v1/admin/context / 토큰 없음 | 401 invalid_token |
| https://gyungchung-mcp.vercel.app/api/v1/admin/context / 잘못된 토큰 | 401 invalid_token |
| https://pamvwzgqkzgsygslmfqo.supabase.co/.well-known/oauth-authorization-server/auth/v1 | 404 |
| https://pamvwzgqkzgsygslmfqo.supabase.co/auth/v1/.well-known/oauth-authorization-server | 404 feature_disabled, OAuth server is disabled |
| https://pamvwzgqkzgsygslmfqo.supabase.co/auth/v1/.well-known/openid-configuration | 200, issuer/authorize/token endpoint 메타데이터 반환 |
| https://pamvwzgqkzgsygslmfqo.supabase.co/auth/v1/.well-known/jwks.json | 200, 공개 서명키 1개 |

401 WWW-Authenticate는 보호 리소스의 직접 메타데이터 URL을 가리킨다. 오류 본문에 회원·개인정보나 실제 인증 값은 없었다. 401의 Cache-Control은 public,max-age=0,must-revalidate였으며 private,no-store는 인증 성공 뒤에 설정되는 현재 소스 흐름과 일치한다. 오류 본문은 비민감하지만 일관된 no-store가 필요한지는 별도 개선 판단 대상이다. 제품 코드는 수정하지 않았다.

## 정확한 미완료 사유

Supabase OAuth server가 비활성 상태이므로 OAuth 2.1 discovery부터 막힌다. OIDC/JWKS 성공을 OAuth authorization-code/PKCE 성공으로 간주하지 않는다. 활성화 승인·설정과 승인된 테스트 계정/기존 OAuth client가 필요하며, 현재 작업에서는 실제 로그인·동의·access token 발급·역할별 MCP tools/list 및 읽기 도구 실행을 하지 않았다. DB 정책은 다른 담당자가 작업 중이라 이 조사에서 변경하지 않았다.

공식 discovery 경로 근거: [Supabase OAuth 시작 가이드](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [OAuth 흐름](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows).
## 기존 설계와 최소 설정 복구안

README 배포 절과 specification-v1.md의 OAuth 흐름(104~128행)은 Supabase OAuth 2.1 활성화를 전제로 한다. 동의 경로는 `/oauth/consent`로 이미 확정되어 있다.

공식 관리 경로: Supabase 프로젝트 대시보드 → Authentication → OAuth Server → Enable OAuth 2.1 server capabilities, Authorization Path. 기존 Site URL과 결합해 동의 화면으로 이동하므로 Site URL은 별도 확인하고 임의 변경하지 않는다.

공식 Management API의 `PATCH /v1/projects/{ref}/config/auth`에서 최소 대상 필드는 `oauth_server_enabled: true`, `oauth_server_authorization_path: /oauth/consent`다. 공개 등록을 허용하는 `oauth_server_allow_dynamic_registration`, 가입 허용, 기존 OAuth client·동의·토큰은 변경하지 않는다. 이 작업의 Supabase connector에는 auth config 조회/수정 도구가 없어 기존 관리 인증을 가진 담당자에게 설정안을 전달했다. 토큰을 검색·추출하거나 새로 발급하지 않았다.

설정 복구 뒤 위 OAuth discovery 200 및 issuer/endpoint 일치를 재검증한다. 테스트 계정·기존 client가 없으므로 실제 로그인·권한별 MCP 검증은 여전히 별도 조건이다.

공식 필드 근거: [Auth config 수정 API](https://supabase.com/docs/reference/api/v1-update-auth-service-config).

## 최종 실행 결과

사용자가 2026-09-09 항목 1,2를 승인한 뒤 설정을 저장하고 페이지를 재로드했다. Enable=true, Authorization Path=/oauth/consent, DCR=false를 확인했다. 경로는 이미 올바르게 설정되어 있어 보존했다. 가입·client등록·사용자동의·DB는 변경하지 않았다.

- OAuth discovery 표준/서비스 경로 모두 200, issuer 일치.
- 파라미터 없는 authorize GET: 400 validation_failed, client_id is required.
- MCP health 200, 무인증 MCP 401 및 resource_metadata challenge 유지.
- 기존 동의 페이지 GET 200.
- 실제 계정 로그인·토큰발급·역할별 읽기 도구는 미검증이다. DCR을 켜거나 신규client를 만들지 않았다.
