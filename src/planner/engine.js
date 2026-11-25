/** Walkway-aware route and recommendation engine. No network or DOM dependencies. */
const EPSILON = 0.000001;
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

function pushByDistance(queue, node, distance) {
  const entry = { node, distance };
  let index = queue.length;
  queue.push(entry);
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (queue[parent].distance <= distance) break;
    queue[index] = queue[parent];
    index = parent;
  }
  queue[index] = entry;
}

function takeClosest(queue) {
  const first = queue[0];
  const last = queue.pop();
  if (queue.length) {
    let index = 0;
    while (index * 2 + 1 < queue.length) {
      let child = index * 2 + 1;
      if (child + 1 < queue.length && queue[child + 1].distance < queue[child].distance) child++;
      if (queue[child].distance >= last.distance) break;
      queue[index] = queue[child];
      index = child;
    }
    queue[index] = last;
  }
  return first;
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
  const queue = [];
  distances[start] = 0;
  pushByDistance(queue, start, 0);
  while (queue.length) {
    const { node, distance } = takeClosest(queue);
    if (distance > distances[node] + EPSILON) continue;
    for (const [next, length] of graph.adjacency[node]) {
      const candidate = distance + length;
      if (candidate < distances[next] - EPSILON) {
        distances[next] = candidate;
        previous[next] = node;
        pushByDistance(queue, next, candidate);
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
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function isCalibrated(event) {
  return Number.isFinite(event.map?.metresPerUnit) && event.map.metresPerUnit > 0;
}

function createGraph(event) {
  if (graphCache.has(event)) return graphCache.get(event);
  if (!Array.isArray(event.map?.walkways)) throw new TypeError('전시장 통로는 선분 배열이어야 합니다.');
  const segments = [...event.map.walkways];
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
 * event.map.walkways supplies explicit axis-aligned [point, point] segments;
 * crossings, T-junctions, shared endpoints and partial overlaps are connected.
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

/**
 * Select reachable booths by aisle proximity, area diversity and supplied
 * highlights. Empty category choices mean all categories. Exclusions also
 * prevent recommending another slot occupied by the same exhibitor.
 */
export function recommendBooths(event, { count = 6, categories = [], priority = 'balanced', excludeIds = [], startEntranceId = 'south', startBoothId = null } = {}) {
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
  const highlighted = (booth) => {
    if (booth.featured === true) return true;
    return [booth.popularity, booth.novelty].some((score) =>
      typeof score === 'number' && Number.isFinite(score) && score > 0);
  };
  const candidates = event.booths
    .filter((booth) => {
      if (!validPoint(booth.access)) return false;
      if (booth.id === startBooth?.id || excludeSet.has(booth.id)) return false;
      return !categorySet.size || categorySet.has(booth.category);
    })
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
    const distanceScore = candidate.distance / maxDistance;
    if (priority === 'nearby') return distanceScore;
    if (priority === 'featured') {
      const highlightPenalty = candidate.featured ? 0 : 2;
      return highlightPenalty + distanceScore;
    }
    const areaPenalty = (areaCounts.get(candidate.area) || 0) * 0.65;
    return distanceScore + areaPenalty;
  };
  const isBetterCandidate = (candidate, current) => {
    const difference = score(candidate) - score(current);
    if (difference < -EPSILON) return true;
    if (!(Math.abs(difference) < EPSILON)) return false;

    // Close scores prefer a supplied highlight, then distance, then booth code.
    if (candidate.featured !== current.featured) return candidate.featured;
    if (candidate.distance !== current.distance) return candidate.distance < current.distance;
    const candidateCode = String(candidate.booth.code ?? candidate.booth.id);
    const currentCode = String(current.booth.code ?? current.booth.id);
    return candidateCode.localeCompare(currentCode) < 0;
  };
  while (selected.length < target && candidates.length) {
    let best = 0;
    for (let index = 1; index < candidates.length; index++) {
      if (isBetterCandidate(candidates[index], candidates[best])) best = index;
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

// The start is stop 0. Booths use the same numbers throughout planning.
const START = 0;

function routeCost(order, distance, returnToEntrance) {
  let cost = 0;
  let from = START;
  for (const to of order) {
    cost += distance(from, to);
    from = to;
  }
  if (returnToEntrance && order.length) cost += distance(from, START);
  return cost;
}

function nearestNeighborOrder(stops, first, distance) {
  const order = [first];
  const unvisited = stops.filter((stop) => stop !== first);
  while (unvisited.length) {
    const current = order.at(-1);
    let closestIndex = 0;
    for (let index = 1; index < unvisited.length; index++) {
      if (distance(current, unvisited[index]) < distance(current, unvisited[closestIndex])) {
        closestIndex = index;
      }
    }
    const [closest] = unvisited.splice(closestIndex, 1);
    order.push(closest);
  }
  return order;
}

function improveWithTwoOpt(order, distance, returnToEntrance) {
  let cost = routeCost(order, distance, returnToEntrance);
  let improved;
  do {
    improved = false;
    for (let left = 0; left < order.length - 1; left++) {
      for (let right = left + 1; right < order.length; right++) {
        const before = order[left - 1] ?? START;
        const after = order[right + 1] ?? (returnToEntrance ? START : null);
        const first = order[left];
        const last = order[right];
        // A reversal changes only the links at its two ends on this symmetric map.
        let change = distance(before, last) - distance(before, first);
        if (after !== null) change += distance(first, after) - distance(last, after);
        if (change >= -EPSILON) continue;
        const reversed = order.slice(left, right + 1).reverse();
        order.splice(left, reversed.length, ...reversed);
        cost += change;
        improved = true;
      }
    }
  } while (improved);
  return { order, cost };
}

function heuristicOrder(stops, distance, returnToEntrance) {
  let best = stops;
  let bestCost = routeCost(best, distance, returnToEntrance);
  for (const first of stops) {
    const greedy = nearestNeighborOrder(stops, first, distance);
    const { order, cost } = improveWithTwoOpt(greedy, distance, returnToEntrance);
    if (cost < bestCost - EPSILON) {
      best = order;
      bestCost = cost;
    }
  }
  return best;
}

function buildLegs(event, locations) {
  const legs = locations.map(() => []);
  for (let from = 0; from < locations.length; from++) {
    for (let to = from + 1; to < locations.length; to++) {
      const leg = shortestPath(event, locations[from].point, locations[to].point);
      legs[from][to] = leg;
      legs[to][from] = { distance: leg.distance, points: [...leg.points].reverse() };
    }
  }
  return legs;
}

/**
 * Plan a walking itinerary using multi-start nearest-neighbour and 2-opt
 * improvement. The original order remains a candidate, so the result is no
 * longer than that baseline; a globally optimal visit order is not guaranteed.
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
  const locations = [startEntrance, ...selected.map(({ id, access }) => ({ id, point: access }))];
  const legs = buildLegs(event, locations);
  const distance = (from, to) => legs[from][to].distance;
  const inputOrder = selected.map((_, index) => index + 1);
  const order = selected.length > 1
    ? heuristicOrder(inputOrder, distance, returnToEntrance)
    : inputOrder;
  const stops = order.map((stop) => selected[stop - 1]);
  const itinerary = [START, ...order];
  if (returnToEntrance && stops.length) itinerary.push(START);
  const segments = [];
  const routePoints = [];
  for (let index = 1; index < itinerary.length; index++) {
    const from = itinerary[index - 1];
    const to = itinerary[index];
    const leg = legs[from][to];
    segments.push({
      from: { ...locations[from].point },
      to: { ...locations[to].point },
      fromId: locations[from].id,
      toId: locations[to].id,
      points: leg.points.map((point) => ({ ...point })),
      distance: leg.distance,
    });
    for (const point of leg.points) {
      if (!routePoints.length || !samePoint(routePoints.at(-1), point)) routePoints.push({ ...point });
    }
  }
  const totalDistance = routeCost(order, distance, returnToEntrance);
  const baselineDistance = routeCost(inputOrder, distance, returnToEntrance);
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
