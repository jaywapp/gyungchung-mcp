# 설명 영상 다시 만들기

1. `scenes.json`의 `caption`(자막)과 `speech`(읽는 문장)를 고친다.
2. Windows의 한국어 음성으로 장면마다 `audio/00.wav`부터 순서대로 만든다.
3. `video.html`에서 장면 화면을 고친다.
4. `playwright`와 `ffmpeg`가 있는 폴더에서 `node build.mjs`를 실행한다. 결과는 `public/mcp-guide/guide.mp4`와 `poster.jpg`다.

`build.mjs`의 출력 경로와 브라우저 경로는 만든 PC 기준이다. 다른 PC에서는 먼저 고친다.
