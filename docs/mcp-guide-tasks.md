# MCP 연결 가이드 작업

orchestrator: Claude

| 작업 | owner | model | effort | depends_on | parallel_group | files | verification | status |
|---|---|---|---|---|---|---|---|---|
| 가이드 문서 | Claude | fable | medium | - | - | `public/mcp-guide/index.html` | 390, 1280 너비와 밝은·어두운 화면 캡처, 탭과 복사 동작 | done |
| 설명 영상 | Claude | fable | medium | 가이드 문서 | - | `public/mcp-guide/guide.mp4`, `docs/mcp-guide-video/` | 장면별 프레임 확인, 영상·음성 길이 일치 | done |
| 경로와 테스트 | Claude | fable | low | 가이드 문서 | - | `vercel.json`, `tests/vercel-config.test.ts` | `npm run check` | done |
| 배포와 확인 | Claude | fable | low | 전부 | - | - | 운영 주소 응답과 영상 재생 | pending (사용자 승인 대기) |

순차로 진행했다. 영상이 문서의 내용과 캡처를 쓰기 때문이다.
