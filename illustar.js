/**
 * ILLUSTAR FES 14: indie-games subsection only, 10–11 October 2026.
 * Names and game titles come from the public sheet linked by the same-edition
 * official notice. Rectangles, neighbouring fixtures, the public entrance and
 * empty-aisle centre lines were manually traced from its 1400×1900 map.
 * No original imagery is bundled. Coordinates are a schematic reconstruction,
 * not surveyed navigation data. No physical scale or popularity is asserted.
 */
const games = [
  ['Project MF', 'Blue Frontline'],
  ['네개의 빛', '네개의 빛'],
  ['Beltane Studio', 'Afterschool Brawol Club'],
  ['뉴비전', '폴 인 스위티 : 일상'],
  ['디지털 케이크샵', '절대사랑금지구역'],
  ['상철게임즈', 'Project: Odyssey'],
  ['타마유 게임노벨즈', '타유의 덮밥이야기'],
  ['MandU', '나비 효과'],
  ['위즈캣 게임즈', '라쿠카라차'],
  ['블루그라운드 스튜디오', 'LOADING DOCK SIMULATOR'],
  ['칼라게임즈', 'DEADSHIP'],
  ['스튜디오묘', '디패스트 임팩트'],
  ['YNOT', 'Spookitchen'],
  ['Urban Oasis', 'HellPunk: Purgatorium'],
  ['디멘션뷰', 'Dimension Ascent'],
  ['루나게임즈', '신도 야근을 하나요?'],
  ['Purple Beam', 'BLIND TOGETHER'],
  ['브루트포스', '글라이드'],
  ['네버더리스 스튜디오', '리로더: 서브젝트_알파'],
  ['Vittgen', 'ALL ADRIFT']
];

// Bounds in the published map's own coordinate space, reconstructed manually.
const bounds = {
  1: [227, 1494, 20, 44], 2: [202, 1519, 20, 20],
  3: [177, 1519, 20, 20], 4: [152, 1519, 20, 20],
  5: [152, 1494, 20, 20], 6: [177, 1494, 20, 20],
  7: [202, 1494, 20, 20], 20: [585, 1430, 20, 20]
};
for (let index = 0; index < 6; index++) {
  bounds[14 + index] = [129 + 24.5 * index, 1402, 19, 19];
  bounds[13 - index] = [129 + 24.5 * index, 1427, 19, 19];
}

// Non-target neighbouring booths remain obstacles, even though they cannot be
// selected in this deliberately bounded subsection.
const surroundingFixtures = [
  ['기업부스02', 93, 1577, 59, 178], ['기업부스03', 271, 1572, 58, 29],
  ['기업부스04', 336, 1572, 58, 29], ['기업부스05', 271, 1607, 124, 58],
  ['기업부스06', 459, 1586, 20, 20], ['기업부스07', 459, 1612, 20, 20],
  ['기업부스08', 486, 1587, 38, 44], ['기업부스09', 460, 1637, 64, 28],
  ['기업부스10', 525, 1727, 59, 28], ['기업부스11', 664, 1648, 29, 88],
  ['기업부스12', 699, 1648, 29, 88], ['기업부스13', 699, 1517, 29, 94],
  ['기업부스14', 664, 1552, 29, 59], ['기업부스15', 664, 1517, 29, 29],
  ['기업부스16', 525, 1517, 89, 29], ['기업부스17', 551, 1397, 29, 60],
  ['기업부스18', 585, 1397, 29, 29], ['기업부스19', 664, 1397, 29, 89],
  ['기업부스20', 699, 1397, 29, 89], ['기업부스23', 94, 1354, 31, 30],
  ['AMD RYZEN AI', 321, 1393, 187, 107]
];

const point = (x, y) => ({ x: x - 70, y: y - 1360 });
const walkways = [];
const line = (x, y, toX, toY) => walkways.push([point(x, y), point(toX, toY)]);
line(392, 1818, 392, 1690);
line(392, 1690, 210, 1690);
line(210, 1690, 210, 1555);
for (const y of [1387, 1460, 1480, 1550]) line(115, y, 288, y);
line(115, 1555, 645, 1555);
line(115, 1387, 115, 1555);
line(288, 1387, 288, 1555);
line(265, 1480, 265, 1550);
line(645, 1465, 645, 1555);
line(595, 1465, 645, 1465);

const booths = games.map(([name, game], index) => {
  const number = index + 1;
  const [x, y, width, height] = bounds[number];
  let access;
  if (number === 1) access = point(265, y + height / 2);
  else if (number === 20) access = point(x + width / 2, 1465);
  else if (number <= 4) access = point(x + width / 2, 1550);
  else if (number <= 7) access = point(x + width / 2, 1480);
  else if (number <= 13) access = point(x + width / 2, 1460);
  else access = point(x + width / 2, 1387);
  return {
    id: `if14-idg${String(number).padStart(2, '0')}`,
    code: `Idg ${String(number).padStart(2, '0')}`,
    name,
    category: number <= 7 || number === 20 ? '일러스타 플레이' : '인디 스테이지',
    x: x - 70, y: y - 1360, width, height, access,
    tags: [game], description: game
  };
});

export const realEvents = [{
  id: 'illustar-14-indie',
  name: '일러스타 페스 14 · 인디게임',
  venue: '일산 킨텍스 제1전시장 4·5홀',
  date: '2026년 10월 10일–11일',
  hall: '인디게임 쇼케이스 구역',
  coverage: '인디게임 구역',
  categories: ['일러스타 플레이', '인디 스테이지'],
  source: {
    map: 'https://illustar.net/notice/qvnq9Gn7',
    booths: 'https://docs.google.com/spreadsheets/d/1pGgLmH-AYn6rwHtW-GUtykbjV7OF37eoSTLlRpkPzos/edit?usp=sharing',
    retrievedAt: '2026-11-23',
    scope: '14회 인디게임 Idg01–20만 수록합니다. 요일별 운영 변동과 그 외 서클·기업·디저트 부스는 방문 대상에 반영하지 않습니다.',
    routing: '동일 회차 공식 1400×1900 배치도에서 부스 사각형·인접 시설·일반 출입구와 빈 통로를 수동으로 재구성했습니다. 공식 통행 안내·실측 축척은 아닙니다.',
    rights: '원본 지도·로고·부스컷 이미지를 포함하지 않습니다.'
  },
  map: {
    width: 665, height: 490, walkways,
    obstacles: [
      ...booths.map(({ code, x, y, width, height }) => ({ code, x, y, width, height })),
      ...surroundingFixtures.map(([code, x, y, width, height]) => ({ code, x: x - 70, y: y - 1360, width, height }))
    ]
  },
  entrances: [{ id: 'south', name: '좌측 일반 출입구', point: point(392, 1818), access: point(392, 1775) }],
  booths
}];
