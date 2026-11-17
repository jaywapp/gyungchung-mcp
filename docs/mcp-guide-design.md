# MCP 연결 가이드 설계

- 위치: `public/mcp-guide/`의 정적 파일. `vercel.json`이 `/mcp-guide`를 `index.html`로 연결한다. 빌드 단계와 의존성이 없다.
- 구성: 영상, 준비물, 연결 주소 복사, ChatGPT와 Claude 단계(탭), 경충 로그인 화면(실제 화면 캡처), 말로 시키는 예시와 미리보기 흐름, 권한 표, 문제 해결, 지킬 것.
- 연결 절차의 출처: OpenAI 개발자 문서(Connect from ChatGPT)와 Claude 지원 문서(custom connectors). ChatGPT 메뉴는 자주 바뀌므로 문서에 그 사실을 적었다.
- 디자인: 경충 웹의 토큰(navy, pitch, lime, 배경)과 Pretendard를 쓴다. 시스템 설정에 따라 밝은 화면과 어두운 화면을 전환한다. ChatGPT와 Claude 화면을 흉내 낸 그림은 넣지 않는다.
- 영상: `docs/mcp-guide-video/`의 장면 페이지를 브라우저로 녹화하고 Windows 한국어 음성(Heami)으로 내레이션을 붙였다. 자막은 영상에 들어 있고, 같은 내용을 문서에 글로도 둔다.
- 개인 정보: 예시 문장과 영상에 실제 회원의 연락처나 계좌를 넣지 않는다.
