# OAuth 복구 작업

orchestrator: Codex

| 작업 | owner | model | effort | depends_on | parallel_group | files | verification | status |
|---|---|---|---|---|---|---|---|---|
| 기존설계·UI·동의구현 확인 | Codex | gpt-6-astra | high | 없음 | sequential | docs/public-oauth-boundary-20260909.md | 기존 discovery404/UI off/동의페이지200 | 완료 |
| 승인된 OAuth 설정 복구 | Codex | gpt-6-astra | high | 사용자 1,2 승인 | sequential | 원격Auth config | 재로드 enabled=true,path=/oauth/consent,DCR=false | 완료 |
| 인증 없는 경계 검증 | Codex | gpt-6-astra | high | 복구 | sequential | docs/oauth-recovery-* | discovery200/authorize400/health200/MCP401/consent200 | 완료 |

같은 원격설정을 다루므로 순차 진행했다. 실제 계정 로그인·토큰발급·역할별 MCP 도구 호출은 미검증이며 신규client등록·동의는 수행하지 않았다. 제품소스·DB 변경 없이 문서만 게시한다.