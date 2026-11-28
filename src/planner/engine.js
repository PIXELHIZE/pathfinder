const EPSILON = 0.000001;
const MAX_CACHED_SOURCES = 64;
const NON_FEATURED_PENALTY = 2;
const REPEATED_AREA_PENALTY = 0.65;
const graphCache = new WeakMap();

const pointKey = (point) => `${point.x},${point.y}`;
const placePoint = (place) => place.point ?? place.access;
const almostEqual = (a, b) => Math.abs(a - b) < EPSILON;
const samePoint = (a, b) => almostEqual(a.x, b.x) && almostEqual(a.y, b.y);
const isBetween = (value, a, b) => value >= Math.min(a, b) - EPSILON && value <= Math.max(a, b) + EPSILON;

function pointOnSegment(point, a, b) {
  const onVertical = almostEqual(a.x, b.x) && almostEqual(point.x, a.x) && isBetween(point.y, a.y, b.y);
  const onHorizontal = almostEqual(a.y, b.y) && almostEqual(point.y, a.y) && isBetween(point.x, a.x, b.x);
  return onVertical || onHorizontal;
}

export function startingPlace(event, startId) {
  const matchesStart = place => place.id === startId;
  return event.entrances.find(matchesStart) ?? event.booths.find(matchesStart) ?? event.entrances[0];
}

function connectWalkwayPoints(segments, basePoints) {
  const nodes = new Map();
  for (const point of basePoints) nodes.set(pointKey(point), { point, links: new Map() });
  const allNodes = [...nodes.values()];
  for (const [index, node] of allNodes.entries()) node.index = index;
  for (const [start, end] of segments) {
    const onSegment = allNodes.filter(node => pointOnSegment(node.point, start, end));
    const axis = almostEqual(start.x, end.x) ? 'y' : 'x';
    onSegment.sort((first, second) => first.point[axis] - second.point[axis]);
    for (let index = 1; index < onSegment.length; index++) {
      const first = onSegment[index - 1];
      const second = onSegment[index];
      const length = Math.abs(first.point.x - second.point.x) + Math.abs(first.point.y - second.point.y);
      first.links.set(second, length);
      second.links.set(first, length);
    }
  }
  return { nodes, sources: new Map() };
}

function pushByDistance(queue, node, distance) {
  const entry = { node, distance };
  let index = queue.length;
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
  if (!queue.length) return first;

  let index = 0;
  while (index * 2 + 1 < queue.length) {
    let closestChild = index * 2 + 1;
    const right = closestChild + 1;
    if (right < queue.length && queue[right].distance < queue[closestChild].distance) closestChild = right;
    if (queue[closestChild].distance >= last.distance) break;
    queue[index] = queue[closestChild];
    index = closestChild;
  }
  queue[index] = last;
  return first;
}

function findShortestPaths(graph, start) {
  const distances = new Array(graph.nodes.size).fill(Infinity);
  const previous = new Array(graph.nodes.size).fill(null);
  const queue = [{ node: start, distance: 0 }];
  distances[start.index] = 0;

  while (queue.length) {
    const { node, distance } = takeClosest(queue);
    if (distance > distances[node.index] + EPSILON) continue;
    for (const [next, length] of node.links) {
      const candidate = distance + length;
      if (candidate < distances[next.index] - EPSILON) {
        distances[next.index] = candidate;
        previous[next.index] = node;
        pushByDistance(queue, next, candidate);
      }
    }
  }
  return { distances, previous };
}

function shortestPathsFrom(graph, start) {
  const sources = graph.sources;
  const result = sources.get(start) ?? findShortestPaths(graph, start);
  sources.delete(start);
  sources.set(start, result);
  if (sources.size > MAX_CACHED_SOURCES) sources.delete(sources.keys().next().value);
  return result;
}

function addCrossings(segments, points) {
  for (let i = 0; i < segments.length; i++) {
    const [firstStart, firstEnd] = segments[i];
    const firstVertical = firstStart.x === firstEnd.x;
    for (let j = i + 1; j < segments.length; j++) {
      const [secondStart, secondEnd] = segments[j];
      const secondVertical = secondStart.x === secondEnd.x;
      if (firstVertical === secondVertical) continue;
      const crossing = firstVertical
        ? { x: firstStart.x, y: secondStart.y }
        : { x: secondStart.x, y: firstStart.y };
      const onFirst = pointOnSegment(crossing, firstStart, firstEnd);
      if (onFirst && pointOnSegment(crossing, secondStart, secondEnd)) points.push(crossing);
    }
  }
}

function getHallGraph(event) {
  const cached = graphCache.get(event);
  if (cached) return cached;

  const segments = event.map.walkways.slice();
  for (const entrance of event.entrances) segments.push([entrance.point, entrance.access]);
  const basePoints = segments.flatMap(([start, end]) => [start, end]);
  for (const booth of event.booths) basePoints.push(booth.access);
  addCrossings(segments, basePoints);
  const graph = connectWalkwayPoints(segments, basePoints);
  graphCache.set(event, graph);
  return graph;
}

function simplifyPoints(points) {
  const result = [];
  for (const point of points) {
    const lastPoint = result.at(-1);
    if (lastPoint && samePoint(lastPoint, point)) continue;
    while (result.length > 1) {
      const secondLast = result.at(-2);
      const last = result.at(-1);
      const vertical = almostEqual(secondLast.x, last.x) && almostEqual(last.x, point.x);
      const horizontal = almostEqual(secondLast.y, last.y) && almostEqual(last.y, point.y);
      if (!vertical && !horizontal) break;
      result.pop();
    }
    result.push({ x: point.x, y: point.y });
  }
  return result;
}

function shortestPath(start, end, { distances, previous }, scale) {
  const { x, y } = start.point;
  if (samePoint(start.point, end.point)) return { points: [{ x, y }], distance: 0 };
  if (distances[end.index] === Infinity) return null;
  const routePoints = [];
  for (let node = end; node; node = previous[node.index]) routePoints.push(node.point);
  routePoints.reverse();
  return { points: simplifyPoints(routePoints), distance: distances[end.index] * scale };
}

const exhibitorGroup = booth => booth.originalBoothNumbers || booth.id;

function takeBest(items, isBetter) {
  let best = 0;
  for (let index = 1; index < items.length; index++) {
    if (isBetter(items[index], items[best])) best = index;
  }
  return items.splice(best, 1)[0];
}

export function recommendBooths(event, { count, categories, priority, excludeIds, startId }) {
  const graph = getHallGraph(event);
  const start = startingPlace(event, startId);
  const startNode = graph.nodes.get(pointKey(placePoint(start)));
  const { distances } = shortestPathsFrom(graph, startNode);
  const categorySet = new Set(categories);
  const excluded = new Set(excludeIds).add(start.id);

  const candidates = [];
  const chosenGroups = new Set();
  let maxDistance = 1;
  for (const booth of event.booths) {
    if (excluded.has(booth.id)) {
      chosenGroups.add(exhibitorGroup(booth));
      continue;
    }
    if (categorySet.size && !categorySet.has(booth.category)) continue;
    const node = graph.nodes.get(pointKey(booth.access));
    const distance = distances[node.index];
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
  function score({ distance, featured, area }) {
    const distanceScore = distance / maxDistance;
    if (priority === 'nearby') return distanceScore;
    if (priority === 'featured') return distanceScore + (featured ? 0 : NON_FEATURED_PENALTY);
    const pickedInArea = areaCounts.get(area) || 0;
    return distanceScore + pickedInArea * REPEATED_AREA_PENALTY;
  }

  function isBetterCandidate(candidate, current) {
    const difference = score(candidate) - score(current);
    if (Math.abs(difference) >= EPSILON) return difference < -EPSILON;
    if (candidate.featured !== current.featured) return candidate.featured;
    if (candidate.distance !== current.distance) return candidate.distance < current.distance;
    return candidate.booth.code.localeCompare(current.booth.code) < 0;
  }

  const selected = [];
  while (selected.length < count && candidates.length) {
    const candidate = takeBest(candidates, isBetterCandidate);
    const group = exhibitorGroup(candidate.booth);
    if (chosenGroups.has(group)) continue;
    chosenGroups.add(group);
    selected.push(candidate.booth);
    areaCounts.set(candidate.area, (areaCounts.get(candidate.area) || 0) + 1);
  }
  return selected;
}

const START = 0;

function routeDistance(order, distance) {
  let cost = 0;
  for (let index = 1; index < order.length; index++) cost += distance(order[index - 1], order[index]);
  return cost;
}

function nearestNeighborOrder(stops, first, distance) {
  const order = [first];
  const unvisited = stops.filter(stop => stop !== first);
  while (unvisited.length) {
    const current = order.at(-1);
    const closest = takeBest(unvisited, (next, best) => distance(current, next) < distance(current, best));
    order.push(closest);
  }
  return order;
}

function improveWithTwoOpt(order, distance) {
  let cost = routeDistance(order, distance);
  const pastLastStop = order.at(-1) === START ? order.length - 1 : order.length;
  let improved = true;
  while (improved) {
    improved = false;
    for (let left = 1; left < pastLastStop - 1; left++) {
      const before = order[left - 1];
      for (let right = left + 1; right < pastLastStop; right++) {
        const after = order[right + 1];
        const first = order[left];
        const last = order[right];
        let change = distance(before, last) - distance(before, first);
        if (after !== undefined) change += distance(first, after) - distance(last, after);
        if (change >= -EPSILON) continue;
        const reversed = order.slice(left, right + 1).reverse();
        order.splice(left, reversed.length, ...reversed);
        cost += change;
        improved = true;
      }
    }
  }
  return { order, cost };
}

function chooseVisitOrder(stops, distance, returnToEntrance) {
  const finish = returnToEntrance ? [START] : [];
  const initialOrder = [START, ...stops, ...finish];
  if (stops.length < 2) return initialOrder;
  let best = { order: initialOrder, cost: routeDistance(initialOrder, distance) };
  for (const first of stops) {
    const greedy = nearestNeighborOrder(stops, first, distance);
    const candidate = improveWithTwoOpt([START, ...greedy, ...finish], distance);
    if (candidate.cost < best.cost - EPSILON) best = candidate;
  }
  return best.order;
}

function buildLegs(event, locations) {
  const graph = getHallGraph(event);
  const nodes = locations.map(point => graph.nodes.get(pointKey(point)));
  const legs = nodes.map(() => []);
  const scale = event.map.metresPerUnit > 0 ? event.map.metresPerUnit : 1;
  for (let from = 0; from < nodes.length - 1; from++) {
    const paths = shortestPathsFrom(graph, nodes[from]);
    for (let to = from + 1; to < nodes.length; to++) {
      const leg = shortestPath(nodes[from], nodes[to], paths, scale);
      if (!leg) return null;
      legs[from][to] = leg;
      const reversePoints = leg.points.slice().reverse();
      legs[to][from] = { distance: leg.distance, points: reversePoints };
    }
  }
  return legs;
}

export function planRoute(event, { boothIds, startId, returnToEntrance }) {
  if (!boothIds.length) return { stops: [], segments: [], totalDistance: 0 };
  const boothsById = new Map();
  for (const booth of event.booths) boothsById.set(booth.id, booth);
  const selected = boothIds.map(id => boothsById.get(id));
  const start = startingPlace(event, startId);
  const locations = [placePoint(start), ...selected.map(booth => booth.access)];
  const legs = buildLegs(event, locations);
  if (!legs) return null;
  const distance = (from, to) => legs[from][to].distance;
  const inputOrder = selected.map((booth, index) => index + 1);
  const order = chooseVisitOrder(inputOrder, distance, returnToEntrance);
  const stops = [];
  const segments = [];
  let totalDistance = 0;
  for (let index = 1; index < order.length; index++) {
    const to = order[index];
    const leg = legs[order[index - 1]][to];
    if (to !== START) stops.push(selected[to - 1]);
    segments.push({ points: leg.points });
    totalDistance += leg.distance;
  }
  return { stops, segments, totalDistance };
}
