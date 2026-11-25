# Pathfinder · 부스패스

공식 전시장 배치도에서 방문할 부스를 고르고, 통로를 따라 이동하는 순서를 계획하는 React 웹입니다.

## 실행

Node.js 20 LTS의 20.19 이상 또는 Node.js 22.12 이상에서 프로젝트 루트를 엽니다.

```sh
npm ci
npm run dev
```

터미널에 표시된 주소로 접속합니다. `npm run build`로 만든 정적 웹은 `dist/`에 저장되고, `npm run preview`로 확인할 수 있습니다.

## 구성

- `src/home`에서 동선을 만들 수 있는 행사 목록을 표시합니다.
- `src/planner`에서 부스 선택, 관람 순서, 통로 지도와 동선 계산을 처리합니다.
- `src/data/exhibitions`에 두는 행사별 JSON은 자동으로 찾아 별도 자산으로 배포합니다. 표시 순서는 각 JSON의 `order` 값으로 정합니다. 이전 행사 링크의 별칭은 `src/data/config.json`에 있습니다.
- `src/assets`에는 로고와 아이콘이 있습니다. Vite가 빌드에서 사용할 자산 경로를 생성합니다.

## 수록 행사

| 행사 | 동선에 추가할 수 있는 범위 | 출처 |
|---|---|---|
| 코믹월드 WINTER 2026 · 340회 (2026.12.12–13) | 공식 0.7 배치도 2–5홀. 청년·전문 부스 토 2,245자리, 일 2,253자리 | [배치도와 요일별 명단](https://comicw.net/map/340/), [관람 안내](https://m.comicw.net/b/) |
| 코믹월드 339 일산 (2026.11.7–8) | 1·2홀 중 창작·전문·밀리터리 부스 토 564자리, 일 560자리 | [배치도와 요일별 명단](https://comicw.net/map/339/), [기업·밀덕 테마존 명단](https://m.comicw.net/free/9486?ft=all) |
| 일러스타 페스 14 (2026.10.10–11) | 킨텍스 4·5홀 서클·기업·인디게임 토 781자리, 일 775자리 | [배치 안내](https://illustar.net/notice/qvnq9Gn7), [부스 목록](https://docs.google.com/spreadsheets/d/1pGgLmH-AYn6rwHtW-GUtykbjV7OF37eoSTLlRpkPzos/edit?usp=sharing) |
| 서울카페쇼 2026 (2026.11.11–14) | 코엑스 A–D홀, 1·3층 로비와 A–B·C–D 연결 구역 612곳. 무대 3곳은 지도에 표시 | [공식 평면도](https://floorplan.exporum.com/embed/cafeshow/), [참가업체](https://kor.cafeshow.com/kor/cafeshow/exhibitor_list.asp), [참관 안내](https://kor.cafeshow.com/kor/visitor/visitor_see.asp) |

코믹월드·일러스타 페스 지도는 공식 도면에서 부스와 통로를 재구성했습니다. 개별 위치가 공개되지 않은 참가팀과 일페 디저트 판매점은 검색 가능한 명단으로 표시합니다. 서울카페쇼는 공식 지도에 연결이 있는 같은 층 구역 안에서 경로를 계산합니다. 물리 거리 배율을 확인할 수 없는 지도는 도면 좌표 단위로 방문 순서를 비교합니다.
