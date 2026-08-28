# gyungchung-mcp

경충FC 운영진이 ChatGPT, Codex, Claude에서 클럽 운영 데이터를 안전하게 조회할 수 있도록 제공하는 관리자 API 및 MCP 서버입니다.

## 현재 단계

현재는 조회 전용 v1 명세를 설계하는 단계입니다. 데이터 변경 도구는 v2에서 별도로 설계합니다.

## 기본 원칙

- 기존 경충FC Supabase 계정으로 사용자를 인증합니다.
- 시스템 관리자와 운영진의 기존 권한 체계를 그대로 적용합니다.
- MCP와 Admin API는 동일한 인증, 권한, 조회 서비스 계층을 공유합니다.
- 권한은 토큰의 사용자 제공 메타데이터가 아니라 데이터베이스의 현재 상태로 매 요청마다 계산합니다.
- v1의 모든 MCP 도구는 읽기 전용입니다.
- 개인정보와 인증정보는 로그에 기록하지 않습니다.

## 명세 산출물

- [제품 및 기술 명세](docs/specification-v1.md)
- [Admin API OpenAPI 3.1 계약](openapi/admin-api-v1.yaml)
- [MCP 도구 JSON Schema](spec/mcp-tools-v1.json)

GitHub 저장소 URL은 소스 배포 원본이며 MCP 실행 주소가 아닙니다. ChatGPT, Codex, Claude에는 배포 후 생성되는 HTTPS `/mcp` URL을 연결합니다.
