const EPSILON = 0.000001;
const graphCache = new WeakMap();
const MAX_CACHED_SOURCES = 64;

const pointKey = (point) => `${point.x},${point.y}`;
const almostEqual = (a, b) => Math.abs(a - b) < EPSILON;
const samePoint = (a, b) => almostEqual(a.x, b.x) && almostEqual(a.y, b.y);
const isBetween = (value, a, b) => value >= Math.min(a, b) - EPSILON && value <= Math.max(a, b) + EPSILON;

function pointOnSegment(point, a, b) {
  const onVertical = almostEqual(a.x, b.x) && almostEqual(point.x, a.x) && isBetween(point.y, a.y, b.y);
  const onHorizontal = almostEqual(a.y, b.y) && almostEqual(point.y, a.y) && isBetween(point.x, a.x, b.x);
  return onVertical || onHorizontal;
}

export function startingPlace(event, startId) {
  for (const entrance of event.entrances) {
    if (entrance.id === startId) return entrance;
  }
  for (const booth of event.booths) {
    if (booth.id === startId) return booth;
  }
  return event.entrances[0];
}

function connectWalkwayPoints(segments, basePoints) {
  const uniquePoints = new Map();
  for (const point of basePoints) uniquePoints.set(pointKey(point), point);
  const points = Array.from(uniquePoints.values());
  const indices = new Map();
  const adjacency = [];
  for (let index = 0; index < points.length; index++) {
    indices.set(pointKey(points[index]), index);
    adjacency.push(new Map());
  }
  for (const segment of segments) {
    const start = segment[0];
    const end = segment[1];
    const pointsOnSegment = [];
    for (const point of points) {
      if (pointOnSegment(point, start, end)) pointsOnSegment.push(point);
    }
    pointsOnSegment.sort((first, second) => {
      if (almostEqual(start.x, end.x)) return first.y - second.y;
      return first.x - second.x;
    });
    for (let index = 1; index < pointsOnSegment.length; index++) {
      const first = pointsOnSegment[index - 1];
      const second = pointsOnSegment[index];
      const firstNode = indices.get(pointKey(first));
      const secondNode = indices.get(pointKey(second));
      const length = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
      adjacency[firstNode].set(secondNode, length);
      adjacency[secondNode].set(firstNode, length);
    }
  }
  return { points, indices, adjacency, sources: new Map() };
}

function pushByDistance(queue, node, distance) {
  const entry = { node, distance };
  let index = queue.length;
  queue.push(entry);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
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

function shortestPathsFrom(graph, start) {
  const cached = graph.sources.get(start);
  if (cached) {
    graph.sources.delete(start);
    graph.sources.set(start, cached);
    return cached;
  }
  const distances = new Array(graph.points.length).fill(Infinity);
  const previous = new Array(graph.points.length).fill(-1);
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
  if (graph.sources.size > MAX_CACHED_SOURCES) {
    const oldestStart = graph.sources.keys().next().value;
    graph.sources.delete(oldestStart);
  }
  return result;
}

function getHallGraph(event) {
  if (graphCache.has(event)) return graphCache.get(event);
  const segments = event.map.walkways.slice();
  for (const entrance of event.entrances) segments.push([entrance.point, entrance.access]);
  const basePoints = [];
  for (const segment of segments) basePoints.push(segment[0], segment[1]);
  for (const booth of event.booths) basePoints.push(booth.access);
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const [c, d] = segments[j];
      const firstVertical = a.x === b.x;
      const secondVertical = c.x === d.x;
      if (firstVertical === secondVertical) continue;
      let crossing;
      if (firstVertical) crossing = { x: a.x, y: c.y };
      else crossing = { x: c.x, y: a.y };
      if (pointOnSegment(crossing, a, b) && pointOnSegment(crossing, c, d)) basePoints.push(crossing);
    }
  }
  const graph = connectWalkwayPoints(segments, basePoints);
  graphCache.set(event, graph);
  return graph;
}

function simplifyPoints(points) {
  const result = [];
  for (const point of points) {
    if (result.length && samePoint(result.at(-1), point)) continue;
    while (result.length > 1) {
      const secondLast = result[result.length - 2];
      const last = result[result.length - 1];
      const vertical = almostEqual(secondLast.x, last.x) && almostEqual(last.x, point.x);
      const horizontal = almostEqual(secondLast.y, last.y) && almostEqual(last.y, point.y);
      if (!vertical && !horizontal) break;
      result.pop();
    }
    result.push({ x: point.x, y: point.y });
  }
  return result;
}

function shortestPath(graph, start, end, scale) {
  const { points } = graph;
  const startPoint = points[start];
  if (samePoint(startPoint, points[end])) return { points: [{ x: startPoint.x, y: startPoint.y }], distance: 0 };
  const { distances, previous } = shortestPathsFrom(graph, start);
  if (distances[end] === Infinity) return null;
  const routePoints = [];
  for (let index = end; index !== -1; index = previous[index]) routePoints.push(points[index]);
  routePoints.reverse();
  return { points: simplifyPoints(routePoints), distance: distances[end] * scale };
}

function exhibitorGroup(booth) {
  return booth.originalBoothNumbers || booth.id;
}

export function recommendBooths(event, { count, categories, priority, excludeIds, startId }) {
  const graph = getHallGraph(event);
  const start = startingPlace(event, startId);
  const startPoint = start.point ?? start.access;
  const { distances } = shortestPathsFrom(graph, graph.indices.get(pointKey(startPoint)));
  const categorySet = new Set(categories);
  const excludeSet = new Set(excludeIds);
  excludeSet.add(start.id);
  const candidates = [];
  let maxDistance = 1;
  for (const booth of event.booths) {
    if (excludeSet.has(booth.id)) continue;
    if (categorySet.size && !categorySet.has(booth.category)) continue;
    const node = graph.indices.get(pointKey(booth.access));
    const distance = distances[node];
    if (distance === Infinity) continue;
    candidates.push({
      booth,
      distance,
      area: booth.area ?? booth.zone ?? booth.category,
      featured: booth.featured === true,
    });
    if (distance > maxDistance) maxDistance = distance;
  }
  const areaCounts = new Map();
  const selected = [];
  const chosenGroups = new Set();
  for (const booth of event.booths) {
    if (excludeSet.has(booth.id)) chosenGroups.add(exhibitorGroup(booth));
  }
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
    if (Math.abs(difference) >= EPSILON) return false;
    if (candidate.featured !== current.featured) return candidate.featured;
    if (candidate.distance !== current.distance) return candidate.distance < current.distance;
    return candidate.booth.code.localeCompare(current.booth.code) < 0;
  };
  while (selected.length < count && candidates.length) {
    let best = 0;
    for (let index = 1; index < candidates.length; index++) {
      if (isBetterCandidate(candidates[index], candidates[best])) best = index;
    }
    const candidate = candidates[best];
    candidates.splice(best, 1);
    const group = exhibitorGroup(candidate.booth);
    if (chosenGroups.has(group)) continue;
    chosenGroups.add(group);
    selected.push(candidate.booth);
    const previousCount = areaCounts.get(candidate.area) || 0;
    areaCounts.set(candidate.area, previousCount + 1);
  }
  return selected;
}

const START = 0;

function routeDistance(order, distance, returnToEntrance) {
  let cost = 0;
  let from = START;
  for (const to of order) {
    cost += distance(from, to);
    from = to;
  }
  if (returnToEntrance) cost += distance(from, START);
  return cost;
}

function nearestNeighborOrder(stops, first, distance) {
  const order = [first];
  const unvisited = [];
  for (const stop of stops) {
    if (stop !== first) unvisited.push(stop);
  }
  while (unvisited.length) {
    const current = order.at(-1);
    let closestIndex = 0;
    for (let index = 1; index < unvisited.length; index++) {
      if (distance(current, unvisited[index]) < distance(current, unvisited[closestIndex])) {
        closestIndex = index;
      }
    }
    const closest = unvisited[closestIndex];
    unvisited.splice(closestIndex, 1);
    order.push(closest);
  }
  return order;
}

function improveWithTwoOpt(order, distance, returnToEntrance) {
  let cost = routeDistance(order, distance, returnToEntrance);
  let improved = true;
  while (improved) {
    improved = false;
    for (let left = 0; left < order.length - 1; left++) {
      for (let right = left + 1; right < order.length; right++) {
        const before = left > 0 ? order[left - 1] : START;
        let after = null;
        if (right + 1 < order.length) after = order[right + 1];
        else if (returnToEntrance) after = START;
        const first = order[left];
        const last = order[right];
        let change = distance(before, last) - distance(before, first);
        if (after !== null) change += distance(first, after) - distance(last, after);
        if (change >= -EPSILON) continue;
        let firstIndex = left;
        let lastIndex = right;
        while (firstIndex < lastIndex) {
          const saved = order[firstIndex];
          order[firstIndex] = order[lastIndex];
          order[lastIndex] = saved;
          firstIndex++;
          lastIndex--;
        }
        cost += change;
        improved = true;
      }
    }
  }
  return { order, cost };
}

function chooseVisitOrder(stops, distance, returnToEntrance) {
  let best = stops;
  let bestCost = routeDistance(best, distance, returnToEntrance);
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
  const graph = getHallGraph(event);
  const nodes = [];
  const legs = [];
  for (const point of locations) {
    nodes.push(graph.indices.get(pointKey(point)));
    legs.push([]);
  }
  const scale = event.map.metresPerUnit > 0 ? event.map.metresPerUnit : 1;
  for (let from = 0; from < locations.length; from++) {
    for (let to = from + 1; to < locations.length; to++) {
      const leg = shortestPath(graph, nodes[from], nodes[to], scale);
      if (!leg) return null;
      legs[from][to] = leg;
      const reversePoints = leg.points.slice();
      reversePoints.reverse();
      legs[to][from] = { distance: leg.distance, points: reversePoints };
    }
  }
  return legs;
}

export function planRoute(event, { boothIds, startId, returnToEntrance }) {
  if (!boothIds.length) return { stops: [], segments: [], totalDistance: 0 };
  const boothsById = new Map();
  for (const booth of event.booths) boothsById.set(booth.id, booth);
  const selected = [];
  for (const id of boothIds) selected.push(boothsById.get(id));
  const start = startingPlace(event, startId);
  const locations = [start.point ?? start.access];
  for (const booth of selected) locations.push(booth.access);
  const legs = buildLegs(event, locations);
  if (!legs) return null;
  const distance = (from, to) => legs[from][to].distance;
  const inputOrder = [];
  for (let index = 0; index < selected.length; index++) inputOrder.push(index + 1);
  const order = selected.length > 1
    ? chooseVisitOrder(inputOrder, distance, returnToEntrance)
    : inputOrder;
  const stops = [];
  const itinerary = [START];
  for (const stop of order) {
    stops.push(selected[stop - 1]);
    itinerary.push(stop);
  }
  if (returnToEntrance) itinerary.push(START);
  const segments = [];
  for (let index = 1; index < itinerary.length; index++) {
    const from = itinerary[index - 1];
    const to = itinerary[index];
    const leg = legs[from][to];
    segments.push({ points: leg.points });
  }
  return { stops, segments, totalDistance: routeDistance(order, distance, returnToEntrance) };
}
