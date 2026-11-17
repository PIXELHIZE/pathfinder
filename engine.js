/** Walkway-aware route and recommendation engine. No network or DOM dependencies. */
const EPSILON = 0.000001;
const DEFAULT_AISLES_X = [66, 288, 500, 712, 934];
const DEFAULT_AISLES_Y = [76, 264, 456, 648];
const graphCache = new WeakMap();

const pointKey = (point) => `${point.x},${point.y}`;
const equal = (a, b) => Math.abs(a - b) < EPSILON;
const samePoint = (a, b) => equal(a.x, b.x) && equal(a.y, b.y);
const validPoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const between = (value, a, b) => value >= Math.min(a, b) - EPSILON && value <= Math.max(a, b) + EPSILON;

function pointOnSegment(point, a, b) {
  return (equal(a.x, b.x) && equal(point.x, a.x) && between(point.y, a.y, b.y)) ||
    (equal(a.y, b.y) && equal(point.y, a.y) && between(point.x, a.x, b.x));
}

function createGraph(event) {
  if (graphCache.has(event)) return graphCache.get(event);
  const xs = event.map?.verticalAisles || DEFAULT_AISLES_X;
  const ys = event.map?.horizontalAisles || DEFAULT_AISLES_Y;
  const segments = [];
  ys.forEach((y) => segments.push([{ x: xs[0], y }, { x: xs.at(-1), y }]));
  xs.forEach((x) => segments.push([{ x, y: ys[0] }, { x, y: ys.at(-1) }]));
  for (const entrance of event.entrances || []) {
    if (validPoint(entrance.point) && validPoint(entrance.access)) {
      segments.push([entrance.point, entrance.access]);
    }
  }
  const basePoints = [
    ...ys.flatMap((y) => xs.map((x) => ({ x, y }))),
    ...(event.booths || []).map((booth) => booth.access),
    ...(event.entrances || []).flatMap((entrance) => [entrance.point, entrance.access]),
  ].filter(validPoint);
  const graph = { segments, basePoints };
  graphCache.set(event, graph);
  return graph;
}

function simplifyPoints(points) {
  const result = [];
  for (const point of points) {
    if (result.length && samePoint(result.at(-1), point)) continue;
    while (result.length > 1) {
      const a = result.at(-2);
      const b = result.at(-1);
      if ((equal(a.x, b.x) && equal(b.x, point.x)) || (equal(a.y, b.y) && equal(b.y, point.y))) {
        result.pop();
      } else break;
    }
    result.push({ ...point });
  }
  return result;
}

/**
 * Find a shortest accessible path between two points on the aisle graph.
 * Returns { points: {x,y}[], distance: number } with distance in metres.
 * Off-walkway or non-finite points throw instead of drawing through booths.
 */
export function shortestPath(event, fromPoint, toPoint) {
  if (!event || !validPoint(fromPoint) || !validPoint(toPoint)) {
    throw new TypeError('경로의 시작점과 도착점이 올바르지 않습니다.');
  }
  const { segments, basePoints } = createGraph(event);
  if (![fromPoint, toPoint].every((point) => segments.some(([a, b]) => pointOnSegment(point, a, b)))) {
    throw new RangeError('시작점과 도착점은 전시장 통로 위에 있어야 합니다.');
  }
  if (samePoint(fromPoint, toPoint)) return { points: [{ ...fromPoint }], distance: 0 };
  const points = [...new Map([...basePoints, fromPoint, toPoint].map((point) => [pointKey(point), point])).values()];
  const indices = new Map(points.map((point, index) => [pointKey(point), index]));
  const graph = points.map(() => new Map());
  for (const [a, b] of segments) {
    const onSegment = points.filter((point) => pointOnSegment(point, a, b))
      .sort((first, second) => equal(a.x, b.x) ? first.y - second.y : first.x - second.x);
    for (let index = 1; index < onSegment.length; index++) {
      const first = onSegment[index - 1];
      const second = onSegment[index];
      const i = indices.get(pointKey(first));
      const j = indices.get(pointKey(second));
      const distance = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
      graph[i].set(j, distance);
      graph[j].set(i, distance);
    }
  }
  const start = indices.get(pointKey(fromPoint));
  const end = indices.get(pointKey(toPoint));
  const distances = points.map(() => Infinity);
  const previous = points.map(() => -1);
  const visited = new Set();
  distances[start] = 0;
  while (visited.size < points.length) {
    let current = -1;
    for (let index = 0; index < points.length; index++) {
      if (!visited.has(index) && (current === -1 || distances[index] < distances[current])) current = index;
    }
    if (current === -1 || !Number.isFinite(distances[current])) break;
    if (current === end) break;
    visited.add(current);
    for (const [next, distance] of graph[current]) {
      const candidate = distances[current] + distance;
      if (candidate < distances[next] - EPSILON) {
        distances[next] = candidate;
        previous[next] = current;
      }
    }
  }
  if (!Number.isFinite(distances[end])) throw new RangeError('두 지점을 연결하는 통로가 없습니다.');
  const routePoints = [];
  for (let index = end; index !== -1; index = previous[index]) routePoints.unshift(points[index]);
  return { points: simplifyPoints(routePoints), distance: distances[end] * (event.map?.metresPerUnit || 0.5) };
}

/**
 * Select unique sample booths by popularity / novelty, respecting categories and
 * exclusions. A small diversity bonus spreads balanced picks across categories.
 * Missing category choices means all categories. The sample scores are editorial.
 */
export function recommendBooths(event, { count = 6, categories = [], priority = 'balanced', excludeIds = [] } = {}) {
  const target = Math.min(event.booths.length, Math.max(0, Math.floor(Number(count) || 0)));
  const categorySet = new Set(Array.isArray(categories) ? categories : []);
  const excludeSet = new Set(Array.isArray(excludeIds) ? excludeIds : []);
  const remaining = event.booths.filter((booth) => !excludeSet.has(booth.id) && (!categorySet.size || categorySet.has(booth.category)));
  const selected = [];
  const categoryCounts = new Map();
  const score = (booth) => {
    if (priority === 'popular') return booth.popularity;
    if (priority === 'unique') return booth.novelty;
    return booth.popularity * 0.55 + booth.novelty * 0.45 - (categoryCounts.get(booth.category) || 0) * 7;
  };
  while (selected.length < target && remaining.length) {
    remaining.sort((a, b) => score(b) - score(a) || a.code.localeCompare(b.code));
    const booth = remaining.shift();
    selected.push(booth);
    categoryCounts.set(booth.category, (categoryCounts.get(booth.category) || 0) + 1);
  }
  return selected;
}

const routeCost = (order, matrix, returnToEntrance) => {
  if (!order.length) return 0;
  let total = matrix[0][order[0] + 1];
  for (let index = 1; index < order.length; index++) total += matrix[order[index - 1] + 1][order[index] + 1];
  if (returnToEntrance) total += matrix[order.at(-1) + 1][0];
  return total;
};

function exactOrder(count, matrix, returnToEntrance) {
  const size = 1 << count;
  const costs = Array.from({ length: size }, () => new Float64Array(count).fill(Infinity));
  const previous = Array.from({ length: size }, () => new Int16Array(count).fill(-1));
  for (let index = 0; index < count; index++) costs[1 << index][index] = matrix[0][index + 1];
  for (let mask = 1; mask < size; mask++) {
    for (let last = 0; last < count; last++) {
      if (!(mask & (1 << last))) continue;
      const previousMask = mask ^ (1 << last);
      if (!previousMask) continue;
      for (let earlier = 0; earlier < count; earlier++) {
        if (!(previousMask & (1 << earlier))) continue;
        const candidate = costs[previousMask][earlier] + matrix[earlier + 1][last + 1];
        if (candidate < costs[mask][last] - EPSILON) {
          costs[mask][last] = candidate;
          previous[mask][last] = earlier;
        }
      }
    }
  }
  let last = 0;
  const fullMask = size - 1;
  for (let index = 1; index < count; index++) {
    if (costs[fullMask][index] + (returnToEntrance ? matrix[index + 1][0] : 0) <
        costs[fullMask][last] + (returnToEntrance ? matrix[last + 1][0] : 0) - EPSILON) last = index;
  }
  const order = [];
  let mask = fullMask;
  while (last !== -1) {
    order.unshift(last);
    const next = previous[mask][last];
    mask ^= 1 << last;
    last = next;
  }
  return order;
}

function heuristicOrder(count, matrix, returnToEntrance) {
  // Try every first stop, then improve each candidate with 2-opt.
  let best = Array.from({ length: count }, (_, index) => index);
  let bestCost = routeCost(best, matrix, returnToEntrance);
  for (let first = 0; first < count; first++) {
    let order = [first];
    const available = new Set(Array.from({ length: count }, (_, index) => index).filter((index) => index !== first));
    while (available.size) {
      let next = available.values().next().value;
      for (const index of available) if (matrix[order.at(-1) + 1][index + 1] < matrix[order.at(-1) + 1][next + 1]) next = index;
      order.push(next);
      available.delete(next);
    }
    let cost = routeCost(order, matrix, returnToEntrance);
    let improving = true;
    while (improving) {
      improving = false;
      for (let i = 0; i < count - 1; i++) {
        for (let j = i + 1; j < count; j++) {
          const candidate = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
          const candidateCost = routeCost(candidate, matrix, returnToEntrance);
          if (candidateCost < cost - EPSILON) {
            order = candidate;
            cost = candidateCost;
            improving = true;
          }
        }
      }
    }
    if (cost < bestCost - EPSILON) {
      best = order;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * Plan a walking itinerary. Up to 10 stops use exact dynamic programming;
 * larger selections use multi-start nearest-neighbour and 2-opt improvement.
 * completedIds are removed. Unknown booth IDs are ignored, duplicates removed.
 * A valid startBoothId starts at that booth's aisle access point and excludes
 * that booth from targets. returnToEntrance then returns to this starting booth.
 * Unknown startBoothId falls back to startEntranceId (or the default entrance).
 * totalMinutes includes booth dwell time; walkingMinutes is walking only at
 * 70 metres/minute. baselineDistance follows the original input selection order.
 */
export function planRoute(event, { boothIds = [], startEntranceId = 'south', startBoothId = null, returnToEntrance = false, completedIds = [] } = {}) {
  const boothsById = new Map(event.booths.map((booth) => [booth.id, booth]));
  const startBooth = boothsById.get(startBoothId);
  const startEntrance = startBooth ? {
    id: startBooth.id,
    name: `${startBooth.name} (${startBooth.code})`,
    point: { ...startBooth.access },
    access: { ...startBooth.access },
  } : event.entrances.find((entrance) => entrance.id === startEntranceId) || event.entrances[0];
  if (!startEntrance) throw new RangeError('전시장 입구가 설정되지 않았습니다.');
  const completedSet = new Set(Array.isArray(completedIds) ? completedIds : []);
  const requestedIds = [...new Set(Array.isArray(boothIds) ? boothIds : [])].filter((id) => !completedSet.has(id) && id !== startBooth?.id);
  const selected = requestedIds.map((id) => boothsById.get(id)).filter(Boolean);
  const points = [startEntrance.point, ...selected.map((booth) => booth.access)];
  const matrix = points.map(() => points.map(() => 0));
  const paths = new Map();
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const path = shortestPath(event, points[i], points[j]);
      matrix[i][j] = matrix[j][i] = path.distance;
      paths.set(`${i}-${j}`, path.points);
      paths.set(`${j}-${i}`, [...path.points].reverse());
    }
  }
  const count = selected.length;
  const inputOrder = selected.map((_, index) => index);
  const order = count <= 1 ? inputOrder : count <= 10 ? exactOrder(count, matrix, returnToEntrance) : heuristicOrder(count, matrix, returnToEntrance);
  const stops = order.map((index) => selected[index]);
  const indices = [0, ...order.map((index) => index + 1)];
  if (returnToEntrance && stops.length) indices.push(0);
  const segments = [];
  const routePoints = [];
  for (let index = 1; index < indices.length; index++) {
    const fromIndex = indices[index - 1];
    const toIndex = indices[index];
    const segmentPoints = paths.get(`${fromIndex}-${toIndex}`) || [{ ...points[fromIndex] }];
    segments.push({
      from: { ...points[fromIndex] },
      to: { ...points[toIndex] },
      fromId: fromIndex ? selected[fromIndex - 1].id : startEntrance.id,
      toId: toIndex ? selected[toIndex - 1].id : startEntrance.id,
      points: segmentPoints.map((point) => ({ ...point })),
      distance: matrix[fromIndex][toIndex],
    });
    for (const point of segmentPoints) {
      if (!routePoints.length || !samePoint(routePoints.at(-1), point)) routePoints.push({ ...point });
    }
  }
  const totalDistance = routeCost(order, matrix, returnToEntrance);
  const baselineDistance = routeCost(inputOrder, matrix, returnToEntrance);
  const walkingMinutes = totalDistance ? Math.max(1, Math.ceil(totalDistance / 70)) : 0;
  return {
    stops,
    segments,
    points: routePoints.length ? routePoints : [{ ...startEntrance.point }],
    totalDistance,
    walkingMinutes,
    totalMinutes: walkingMinutes + stops.reduce((sum, booth) => sum + (booth.dwellMinutes || 5), 0),
    baselineDistance,
    savedPercent: baselineDistance ? Math.max(0, Math.round((1 - totalDistance / baselineDistance) * 100)) : 0,
    startEntrance,
    returnToEntrance: Boolean(returnToEntrance),
  };
}
