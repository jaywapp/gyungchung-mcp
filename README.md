# gyungchung-mcp

경충FC 운영진이 ChatGPT, Codex, Claude에서 클럽 운영 데이터를 안전하게 조회할 수 있도록 제공하는 관리자 API 및 MCP 서버입니다.

## 현재 단계

조회 전용 v1 서버가 구현되어 있습니다. 데이터 변경 도구는 v2에서 별도로 설계합니다.

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

GitHub 저장소 URL은 소스 배포 원본이며 MCP 실행 주소가 아닙니다. ChatGPT, Codex, Claude에는 배포 후 생성되는 HTTPS `/api/mcp` URL을 연결합니다.

## 로컬 검증

Node.js 22 이상 24 이하를 사용합니다. Vercel 운영 런타임은 프로젝트 설정에서 Node.js 24로 고정합니다.

```powershell
npm install
npm run check
```

필수 환경변수는 `.env.example`을 참고합니다. 실제 값은 `.env.local` 또는 배포 환경변수에만 저장하고 커밋하지 않습니다.

## 공개 엔드포인트

- `GET /api/health`: 서버 상태 확인
- `/api/mcp`: Streamable HTTP MCP 엔드포인트
- `GET /api/oauth-protected-resource`: OAuth 보호 리소스 메타데이터
- `GET /api/v1/admin/*`: 동일한 조회 서비스 계층을 사용하는 관리자 API

`/api/mcp`와 관리자 API는 Supabase OAuth 2.1 액세스 토큰을 요구합니다. 로그인한 사용자의 현재 프로필과 운영 권한을 데이터베이스에서 매 요청마다 확인하며, 권한이 없는 도구는 도구 목록에 노출하지 않습니다. Vercel rewrite 별칭(`/mcp`, `/health`)도 제공하지만 OAuth 클라이언트 등록에는 직접 함수 URL을 사용합니다.

## 배포

Vercel 프로젝트에 다음 환경변수를 등록합니다.

- `MCP_SERVER_URL`: 배포된 HTTPS `/api/mcp` URL
- `SUPABASE_URL`: 경충FC Supabase 프로젝트 URL
- `SUPABASE_PUBLISHABLE_KEY`: 공개 클라이언트용 publishable key

운영 배포 전 경충FC 앱 저장소의 MCP 조회 API 마이그레이션과 Supabase OAuth 서버 설정을 먼저 적용해야 합니다.
