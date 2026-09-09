# OAuth 최소 복구 설계

대상: Supabase 프로젝트 pamvwzgqkzgsygslmfqo, Authentication > OAuth Server.

저장할 필드: oauth_server_enabled=true, oauth_server_authorization_path=/oauth/consent. Dynamic client registration과 가입/기존권한은 보존한다. 현재 비활성 폼에는 enable만 보여서 나머지 필드는 활성화 편집 단계에서 확인해야 한다. 예상과 다른 필수설정이 나오면 무단확장하지 않는다.

공개 discovery와 토큰없는 authorize 경계를 검증하고, 기존 MCP 무인증401이 유지되는지 확인한다. 신규client등록·실사용자 동의·토큰발급은 하지 않는다. 같은원격설정을 다루므로 순차진행한다.