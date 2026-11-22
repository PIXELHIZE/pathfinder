# 부스패스

공식 전시장 자료를 바탕으로 부스 검색, 추천, 방문 순서 계산을 제공하는 정적 웹입니다.

```sh
npm run dev   # http://127.0.0.1:4173
npm test
npm run build
```

| 행사 | 지원 범위 | 자료 |
|---|---|---|
| 코믹월드 339 일산 (2026.11.7–8) | 공식 지도 좌측 창작·전문·밀리터리 구역. 토 564자리, 일 560자리 | [배치도와 날짜별 부스 목록](https://comicw.net/map/339/) |
| 일러스타 페스 14 (2026.10.10–11) | 킨텍스 4·5홀 인디게임 구역 20곳 | [배치 안내](https://illustar.net/notice/qvnq9Gn7), [부스 목록](https://docs.google.com/spreadsheets/d/1pGgLmH-AYn6rwHtW-GUtykbjV7OF37eoSTLlRpkPzos/edit?usp=sharing) |
| 서울카페쇼 2026 (2026.11.11–14) | 코엑스 A–D홀 내부 552곳. 로비, 무대, 홀 간 이동 제외 | [배치도](https://floorplan.exporum.com/embed/cafeshow/), [참가업체](https://kor.cafeshow.com/kor/cafeshow/exhibitor_list.asp), [체리스초이스](https://kor.cafeshow.com/kor/mypage/my_notice_list.asp?page=1) |

지도는 부스 좌표로 재구성했습니다. 코믹월드와 일러스타 페스 통로는 공식 배치도에서 수동으로 옮겼고, 카페쇼는 공식 지도에서 공개하는 통로 좌표를 사용합니다. 물리 거리 배율이 확인되지 않은 지도에서는 도면상의 거리로 방문 순서를 비교합니다.

`engine.js`는 다익스트라로 각 출발점과 방문지 간 통로 최단 거리를 계산합니다. 방문지가 10개 이하면 부분집합 동적 계획법으로 최소 이동 순서를 구합니다. 11개부터 40개까지는 첫 방문지를 바꿔가며 가까운 부스를 잇고 2-opt로 순서를 개선합니다. 추천은 가까운 부스, 분야 다양성, 확인된 주최 측 선정 정보에 근거합니다.

행사별 날짜·부스·통로 스냅샷은 `comicworld.js`, `illustar.js`, `cafe2026.js`에 있습니다. `exhibitions.js`에서 출시할 회차와 홀을 선택합니다. 카페쇼 데이터 수집은 `scripts/import-cafe2026.py`로 재현할 수 있습니다. 예제 데이터 `data.js`는 엔진 테스트에서만 사용합니다.
