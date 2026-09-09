# OAuth 서버 설정 복구 분석

orchestrator: Codex. 사용자 후속 전체 진행 승인은 기존 기능 복구 범위에 유효하다.

README와 specification-v1.md는 Supabase OAuth 2.1 및 기존 `/oauth/consent`를 전제로 한다. 실제 공개 discovery는 404 feature_disabled, 콘솔 Enable the Supabase OAuth Server는 false다. 기존 동의 페이지 구현은 승인·거절·로그인을 포함하며 공개 GET도 200이다.

복구 대상은 기존 gyungchung Supabase 프로젝트의 OAuth server enable 및 authorization path 두 설정뿐이다. DCR·가입·새 client·실사용자 동의·DB 변경은 제외한다. 기존관리계정 로그인으로 UI읽기는 성공했다. 최종 저장은 브라우저 확인정책의 security-sensitive access expansion에 해당한다고 판단하여 상위 작업에 실행시점 확인을 요청했다.

실제 로그인에는 승인된 테스트계정·기존 OAuth client가 별도로 필요하다. 서버활성화만으로 전체연동완료를 선언하지 않는다.
## 실행시점 승인
사용자가 2026-09-09 항목 1,2를 명시 승인했다. 기존 Supabase 프로젝트에서 OAuth server enable과 /oauth/consent 두 필드만 저장한다. DCR/가입/client등록은 변경하지 않는다.

## 최종 실행 결과

사용자가 2026-09-09 항목 1,2를 승인한 뒤 설정을 저장하고 페이지를 재로드했다. Enable=true, Authorization Path=/oauth/consent, DCR=false를 확인했다. 경로는 이미 올바르게 설정되어 있어 보존했다. 가입·client등록·사용자동의·DB는 변경하지 않았다.

- OAuth discovery 표준/서비스 경로 모두 200, issuer 일치.
- 파라미터 없는 authorize GET: 400 validation_failed, client_id is required.
- MCP health 200, 무인증 MCP 401 및 resource_metadata challenge 유지.
- 기존 동의 페이지 GET 200.
- 실제 계정 로그인·토큰발급·역할별 읽기 도구는 미검증이다. DCR을 켜거나 신규client를 만들지 않았다.
