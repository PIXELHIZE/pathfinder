/** Walkway-aware route and recommendation engine. No network or DOM dependencies. */
const EPSILON = 0.000001;
const DEFAULT_AISLES_X = [66, 288, 500, 712, 934];
const DEFAULT_AISLES_Y = [76, 264, 456, 648];
const graphCache = new WeakMap();
const MAX_CACHED_SOURCES = 64;

const pointKey = (point) => `${point.x},${point.y}`;
const equal = (a, b) => Math.abs(a - b) < EPSILON;
const samePoint = (a, b) => equal(a.x, b.x) && equal(a.y, b.y);
const validPoint = (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const between = (value, a, b) => value >= Math.min(a, b) - EPSILON && value <= Math.max(a, b) + EPSILON;

function pointOnSegment(point, a, b) {
  return (equal(a.x, b.x) && equal(point.x, a.x) && between(point.y, a.y, b.y)) ||
    (equal(a.y, b.y) && equal(point.y, a.y) && between(point.x, a.x, b.x));
}

function materializeGraph(segments, basePoints) {
  const points = [...new Map(basePoints.map((point) => [pointKey(point), point])).values()];
  const indices = new Map(points.map((point, index) => [pointKey(point), index]));
  const adjacency = points.map(() => new Map());
  for (const [a, b] of segments) {
    const onSegment = points.filter((point) => pointOnSegment(point, a, b))
      .sort((first, second) => equal(a.x, b.x) ? first.y - second.y : first.x - second.x);
    for (let index = 1; index < onSegment.length; index++) {
      const first = onSegment[index - 1];
      const second = onSegment[index];
      const i = indices.get(pointKey(first));
      const j = indices.get(pointKey(second));
      const distance = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
      adjacency[i].set(j, distance);
      adjacency[j].set(i, distance);
    }
  }
  return { segments, points, indices, adjacency, sources: new Map() };
}

function pathsFrom(graph, start) {
  const cached = graph.sources.get(start);
  if (cached) {
    graph.sources.delete(start);
    graph.sources.set(start, cached);
    return cached;
  }
  const distances = new Float64Array(graph.points.length).fill(Infinity);
  const previous = new Int32Array(graph.points.length).fill(-1);
  const heap = [];
  const push = (node, distance) => {
    const entry = { node, distance };
    let index = heap.length;
    heap.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (heap[parent].distance <= distance) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = entry;
  };
  const pop = () => {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].distance < heap[child].distance) child++;
        if (heap[child].distance >= last.distance) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return first;
  };
  distances[start] = 0;
  push(start, 0);
  while (heap.length) {
    const { node, distance } = pop();
    if (distance > distances[node] + EPSILON) continue;
    for (const [next, length] of graph.adjacency[node]) {
      const candidate = distance + length;
      if (candidate < distances[next] - EPSILON) {
        distances[next] = candidate;
        previous[next] = node;
        push(next, candidate);
      }
    }
  }
  const result = { distances, previous };
  graph.sources.set(start, result);
  if (graph.sources.size > MAX_CACHED_SOURCES) graph.sources.delete(graph.sources.keys().next().value);
  return result;
}

function distanceScale(event) {
  const scale = event.map?.metresPerUnit;
  return Number.isFinite(scale) && scale > 0 ? scale : Array.isArray(event.map?.walkways) ? 1 : 0.5;
}

function isCalibrated(event) {
  return !Array.isArray(event.map?.walkways) || (Number.isFinite(event.map?.metresPerUnit) && event.map.metresPerUnit > 0);
}

function createGraph(event) {
  if (graphCache.has(event)) return graphCache.get(event);
  const segments = [];
  const explicitWalkways = event.map?.walkways;
  if (explicitWalkways !== undefined) {
    if (!Array.isArray(explicitWalkways)) throw new TypeError('전시장 통로는 선분 배열이어야 합니다.');
    segments.push(...explicitWalkways);
  } else {
    const xs = event.map?.verticalAisles || DEFAULT_AISLES_X;
    const ys = event.map?.horizontalAisles || DEFAULT_AISLES_Y;
    ys.forEach((y) => segments.push([{ x: xs[0], y }, { x: xs.at(-1), y }]));
    xs.forEach((x) => segments.push([{ x, y: ys[0] }, { x, y: ys.at(-1) }]));
  }
  for (const entrance of event.entrances || []) {
    if (validPoint(entrance.point) && validPoint(entrance.access)) {
      segments.push([entrance.point, entrance.access]);
    }
  }
  for (const segment of segments) {
    if (!Array.isArray(segment) || segment.length !== 2 || !segment.every(validPoint)) {
      throw new TypeError('통로 선분에는 올바른 두 좌표가 필요합니다.');
    }
    if (segment[0].x !== segment[1].x && segment[0].y !== segment[1].y) {
      throw new RangeError('통로 선분은 수평 또는 수직이어야 합니다.');
    }
  }
  const basePoints = [
    ...segments.flat(),
    ...(event.booths || []).map((booth) => booth.access),
    ...(event.entrances || []).flatMap((entrance) => [entrance.point, entrance.access]),
  ].filter(validPoint);
  // Endpoints already split shared and collinear overlapping segments. Add
  // perpendicular crossings as well, even when neither segment ends there.
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const [c, d] = segments[j];
      const firstVertical = a.x === b.x;
      const secondVertical = c.x === d.x;
      if (firstVertical === secondVertical) continue;
      const crossing = firstVertical ? { x: a.x, y: c.y } : { x: c.x, y: a.y };
      if (pointOnSegment(crossing, a, b) && pointOnSegment(crossing, c, d)) basePoints.push(crossing);
    }
  }
  const graph = materializeGraph(segments, basePoints);
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
 * event.map.walkways may supply explicit axis-aligned [point, point] segments;
 * crossings, T-junctions, shared endpoints and partial overlaps are connected.
 * When omitted, the horizontalAisles/verticalAisles grid remains the fallback.
 * Returns { points: {x,y}[], distance: number }. Distance is in metres when
 * metresPerUnit is known; uncalibrated explicit maps retain coordinate units.
 * Off-walkway or non-finite points throw instead of drawing through booths.
 */
export function shortestPath(event, fromPoint, toPoint) {
  if (!event || !validPoint(fromPoint) || !validPoint(toPoint)) {
    throw new TypeError('경로의 시작점과 도착점이 올바르지 않습니다.');
  }
  let graph = createGraph(event);
  const { segments } = graph;
  if (![fromPoint, toPoint].every((point) => segments.some(([a, b]) => pointOnSegment(point, a, b)))) {
    throw new RangeError('시작점과 도착점은 전시장 통로 위에 있어야 합니다.');
  }
  if (samePoint(fromPoint, toPoint)) return { points: [{ ...fromPoint }], distance: 0 };
  // Booth accesses and entrance points are already materialized and share the
  // cached graph/searches. Arbitrary points split a temporary graph only.
  if (![fromPoint, toPoint].every((point) => graph.indices.has(pointKey(point)))) {
    graph = materializeGraph(segments, [...graph.points, fromPoint, toPoint]);
  }
  const { points, indices } = graph;
  const start = indices.get(pointKey(fromPoint));
  const end = indices.get(pointKey(toPoint));
  const { distances, previous } = pathsFrom(graph, start);
  if (!Number.isFinite(distances[end])) throw new RangeError('두 지점을 연결하는 통로가 없습니다.');
  const routePoints = [];
  for (let index = end; index !== -1; index = previous[index]) routePoints.unshift(points[index]);
  return { points: simplifyPoints(routePoints), distance: distances[end] * distanceScale(event) };
}

function realMapRecommendations(event, { count, categories, priority, excludeIds, startEntranceId, startBoothId }) {
  const graph = createGraph(event);
  const startBooth = event.booths.find((booth) => booth.id === startBoothId);
  const startPoint = startBooth?.access || event.entrances?.find((entrance) => entrance.id === startEntranceId)?.point || event.entrances?.[0]?.point;
  if (!validPoint(startPoint) || !graph.segments.some(([a, b]) => pointOnSegment(startPoint, a, b))) {
    throw new RangeError('추천 경로의 시작점은 전시장 통로 위에 있어야 합니다.');
  }
  // One single-source search ranks every booth, even in a large real hall.
  const { distances } = pathsFrom(graph, graph.indices.get(pointKey(startPoint)));
  const categorySet = new Set(Array.isArray(categories) ? categories : []);
  const excludeSet = new Set(Array.isArray(excludeIds) ? excludeIds : []);
  const highlighted = (booth) => booth.featured === true || [booth.popularity, booth.novelty]
    .some((score) => typeof score === 'number' && Number.isFinite(score) && score > 0);
  const candidates = event.booths
    .filter((booth) => validPoint(booth.access) && booth.id !== startBooth?.id && !excludeSet.has(booth.id) && (!categorySet.size || categorySet.has(booth.category)))
    .map((booth) => ({
      booth,
      distance: distances[graph.indices.get(pointKey(booth.access))],
      area: booth.area ?? booth.zone ?? booth.category ?? '',
      featured: highlighted(booth),
    }))
    .filter((candidate) => Number.isFinite(candidate.distance));
  const maxDistance = Math.max(1, ...candidates.map((candidate) => candidate.distance));
  const areaCounts = new Map();
  const selected = [];
  const chosenGroups = new Set();
  const groupKey = (booth) => booth.originalBoothNumbers || booth.id;
  for (const booth of event.booths) {
    if (excludeSet.has(booth.id) || booth.id === startBooth?.id) chosenGroups.add(groupKey(booth));
  }
  const target = Math.min(candidates.length, Math.max(0, Math.floor(Number(count) || 0)));
  const score = (candidate) => {
    if (priority === 'nearby') return candidate.distance / maxDistance;
    if (priority === 'featured') return (candidate.featured ? 0 : 2) + candidate.distance / maxDistance;
    return candidate.distance / maxDistance + (areaCounts.get(candidate.area) || 0) * 0.65;
  };
  while (selected.length < target && candidates.length) {
    let best = 0;
    for (let index = 1; index < candidates.length; index++) {
      const difference = score(candidates[index]) - score(candidates[best]);
      if (difference < -EPSILON || (Math.abs(difference) < EPSILON && (
        (candidates[index].featured && !candidates[best].featured) ||
        (candidates[index].featured === candidates[best].featured && (
          candidates[index].distance < candidates[best].distance ||
          (candidates[index].distance === candidates[best].distance && String(candidates[index].booth.code ?? candidates[index].booth.id).localeCompare(String(candidates[best].booth.code ?? candidates[best].booth.id)) < 0)
        ))
      ))) best = index;
    }
    const [candidate] = candidates.splice(best, 1);
    const group = groupKey(candidate.booth);
    if (chosenGroups.has(group)) continue;
    chosenGroups.add(group);
    selected.push(candidate.booth);
    areaCounts.set(candidate.area, (areaCounts.get(candidate.area) || 0) + 1);
  }
  return selected;
}

/**
 * Select unique sample booths by popularity / novelty, respecting categories and
 * exclusions. A small diversity bonus spreads balanced picks across categories.
 * Missing category choices means all categories. The sample scores are editorial.
 * Explicit real maps use aisle proximity and area diversity, never fake scores:
 * nearby ranks from the chosen start; featured prioritizes supplied highlights.
 * Real booth.area (then zone/category) supplies the balanced diversity grouping.
 */
export function recommendBooths(event, { count = 6, categories = [], priority = 'balanced', excludeIds = [], startEntranceId = 'south', startBoothId = null } = {}) {
  if (Array.isArray(event.map?.walkways)) {
    return realMapRecommendations(event, {count, categories, priority, excludeIds, startEntranceId, startBoothId});
  }
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
          const left = i ? order[i - 1] + 1 : 0;
          const first = order[i] + 1;
          const last = order[j] + 1;
          const right = j + 1 < count ? order[j + 1] + 1 : returnToEntrance ? 0 : null;
          const delta = matrix[left][last] - matrix[left][first] +
            (right === null ? 0 : matrix[first][right] - matrix[last][right]);
          if (delta < -EPSILON) {
            order = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)];
            cost += delta;
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
 * Uncalibrated explicit maps use coordinate distances and return null for both
 * time estimates because those distances cannot be converted to metres.
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
  const walkingMinutes = isCalibrated(event) ? (totalDistance ? Math.max(1, Math.ceil(totalDistance / 70)) : 0) : null;
  return {
    stops,
    segments,
    points: routePoints.length ? routePoints : [{ ...startEntrance.point }],
    totalDistance,
    walkingMinutes,
    totalMinutes: walkingMinutes === null ? null : walkingMinutes + stops.reduce((sum, booth) => sum + (booth.dwellMinutes || 5), 0),
    baselineDistance,
    savedPercent: baselineDistance ? Math.max(0, Math.round((1 - totalDistance / baselineDistance) * 100)) : 0,
    startEntrance,
    returnToEntrance: Boolean(returnToEntrance),
  };
}
