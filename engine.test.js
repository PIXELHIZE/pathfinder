import test from 'node:test';
import assert from 'node:assert/strict';
import { events, getEvent } from './data.js';
import { planRoute, recommendBooths, shortestPath } from './engine.js';

const event = events[0];

function crossesInterior(a, b, booth) {
  if (a.x === b.x) return a.x > booth.x && a.x < booth.x + booth.width && Math.max(a.y, b.y) > booth.y && Math.min(a.y, b.y) < booth.y + booth.height;
  if (a.y === b.y) return a.y > booth.y && a.y < booth.y + booth.height && Math.max(a.x, b.x) > booth.x && Math.min(a.x, b.x) < booth.x + booth.width;
  return true; // Every walkway edge must be axis-aligned.
}

test('all samples have complete unique booth data and matching categories', () => {
  assert.equal(events.length, 3);
  for (const item of events) {
    assert.equal(item.booths.length, 24);
    assert.equal(new Set(item.booths.map((booth) => booth.id)).size, 24);
    assert.deepEqual(new Set(item.categories), new Set(item.booths.map((booth) => booth.category)));
    assert.equal(item.isSample, true);
  }
  assert.equal(getEvent('missing'), events[0]);
});

test('paths between every booth and entrance follow accessible aisles without crossing booth interiors', () => {
  for (const entrance of event.entrances) {
    for (const booth of event.booths) {
      const path = shortestPath(event, entrance.point, booth.access);
      assert.deepEqual(path.points[0], entrance.point);
      assert.deepEqual(path.points.at(-1), booth.access);
      for (let index = 1; index < path.points.length; index++) {
        for (const obstacle of event.booths) assert.equal(crossesInterior(path.points[index - 1], path.points[index], obstacle), false);
      }
      const geometricLength = path.points.slice(1).reduce((sum, point, index) => sum + Math.abs(point.x - path.points[index].x) + Math.abs(point.y - path.points[index].y), 0);
      assert.equal(path.distance, geometricLength * 0.5);
    }
  }
});

test('shortest paths use the corridor between booths rather than a direct diagonal', () => {
  const from = event.booths[0].access;
  const to = event.booths[23].access;
  const result = shortestPath(event, from, to);
  const manhattan = (Math.abs(from.x - to.x) + Math.abs(from.y - to.y)) * 0.5;
  assert.equal(result.distance, manhattan);
  assert.throws(() => shortestPath(event, { x: 150, y: 150 }, to), RangeError);
  assert.throws(() => shortestPath(event, { x: NaN, y: 2 }, to), TypeError);
  assert.deepEqual(shortestPath(event, from, from), { points: [from], distance: 0 });
});

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map((rest) => [item, ...rest]));
}

test('small route is globally optimal, including optional return to entrance', () => {
  const ids = [20, 2, 10, 17, 7].map((index) => event.booths[index].id);
  const entrance = event.entrances[0].point;
  const byId = new Map(event.booths.map((booth) => [booth.id, booth]));
  const pairDistance = new Map();
  const allPoints = new Map([['start', entrance], ...ids.map((id) => [id, byId.get(id).access])]);
  for (const [idA, pointA] of allPoints) for (const [idB, pointB] of allPoints) pairDistance.set(`${idA}/${idB}`, shortestPath(event, pointA, pointB).distance);
  for (const returnToEntrance of [false, true]) {
    const optimum = Math.min(...permutations(ids).map((order) => {
      const sequence = ['start', ...order, ...(returnToEntrance ? ['start'] : [])];
      return sequence.slice(1).reduce((sum, id, index) => sum + pairDistance.get(`${sequence[index]}/${id}`), 0);
    }));
    const result = planRoute(event, { boothIds: ids, returnToEntrance });
    assert.equal(result.totalDistance, optimum);
    assert.equal(result.stops.length, ids.length);
    assert.equal(result.segments.reduce((sum, segment) => sum + segment.distance, 0), result.totalDistance);
    assert.ok(result.totalDistance <= result.baselineDistance);
    if (returnToEntrance) assert.deepEqual(result.points.at(-1), entrance);
  }
});

test('large routes remain unique, accessible, and no worse than original order', () => {
  const ids = [...event.booths].reverse().map((booth) => booth.id);
  const route = planRoute(event, { boothIds: ids, returnToEntrance: true });
  assert.equal(route.stops.length, 24);
  assert.equal(new Set(route.stops.map((booth) => booth.id)).size, 24);
  assert.ok(route.totalDistance <= route.baselineDistance);
  for (const segment of route.segments) {
    for (let i = 1; i < segment.points.length; i++) {
      for (const booth of event.booths) assert.equal(crossesInterior(segment.points[i - 1], segment.points[i], booth), false);
    }
  }
});

test('empty, completed, duplicate and invalid selections produce sensible routes', () => {
  const id = event.booths[0].id;
  const result = planRoute(event, { boothIds: [id, id, 'does-not-exist'] });
  assert.equal(result.stops.length, 1);
  assert.ok(result.totalDistance > 0);
  assert.equal(result.totalMinutes, result.walkingMinutes + event.booths[0].dwellMinutes);
  const empty = planRoute(event, { boothIds: [id], completedIds: [id] });
  assert.equal(empty.totalDistance, 0);
  assert.equal(empty.totalMinutes, 0);
  assert.equal(empty.stops.length, 0);
  assert.equal(empty.savedPercent, 0);
  assert.equal(planRoute(event, { boothIds: null }).stops.length, 0);
  assert.equal(planRoute(event, { startEntranceId: 'missing' }).startEntrance.id, 'south');
});

test('every entrance and return choice is honoured', () => {
  for (const entrance of event.entrances) {
    const route = planRoute(event, { boothIds: [event.booths[4].id, event.booths[16].id], startEntranceId: entrance.id, returnToEntrance: true });
    assert.deepEqual(route.points[0], entrance.point);
    assert.deepEqual(route.points.at(-1), entrance.point);
    assert.equal(route.segments.length, 3);
  }
});

test('current booth start gives an exact optimal remaining route and excludes visited or current booths', () => {
  const startBooth = event.booths[11];
  const completedBooth = event.booths[5];
  const targets = [event.booths[23], event.booths[2], event.booths[16], event.booths[7]];
  const requested = [startBooth.id, targets[0].id, completedBooth.id, ...targets.slice(1).map((booth) => booth.id)];
  for (const returnToEntrance of [false, true]) {
    const result = planRoute(event, {
      boothIds: requested,
      startEntranceId: 'east',
      startBoothId: startBooth.id,
      completedIds: [completedBooth.id, startBooth.id],
      returnToEntrance,
    });
    const optimum = Math.min(...permutations(targets).map((order) => {
      const route = [startBooth, ...order, ...(returnToEntrance ? [startBooth] : [])];
      return route.slice(1).reduce((sum, booth, index) => sum + shortestPath(event, route[index].access, booth.access).distance, 0);
    }));
    assert.equal(result.totalDistance, optimum);
    assert.deepEqual(new Set(result.stops.map((booth) => booth.id)), new Set(targets.map((booth) => booth.id)));
    assert.deepEqual(result.startEntrance, {id: startBooth.id, name: `${startBooth.name} (${startBooth.code})`, point: startBooth.access, access: startBooth.access});
    assert.deepEqual(result.points[0], startBooth.access);
    assert.equal(result.segments[0].fromId, startBooth.id);
    if (returnToEntrance) {
      assert.deepEqual(result.points.at(-1), startBooth.access);
      assert.equal(result.segments.at(-1).toId, startBooth.id);
    }
  }
});

test('current booth start handles empty remaining targets, direct return, and invalid IDs', () => {
  const start = event.booths[13];
  for (const returnToEntrance of [false, true]) {
    const empty = planRoute(event, {boothIds: [start.id], startBoothId: start.id, returnToEntrance});
    assert.equal(empty.stops.length, 0);
    assert.equal(empty.segments.length, 0);
    assert.equal(empty.totalDistance, 0);
    assert.equal(empty.totalMinutes, 0);
    assert.deepEqual(empty.points, [start.access]);
  }
  const target = event.booths[0];
  const returned = planRoute(event, {boothIds: [target.id], startBoothId: start.id, returnToEntrance: true});
  assert.equal(returned.totalDistance, 2 * shortestPath(event, start.access, target.access).distance);
  assert.equal(returned.totalMinutes, returned.walkingMinutes + target.dwellMinutes);
  const fallback = planRoute(event, {boothIds: [target.id], startBoothId: 'missing', startEntranceId: 'west'});
  assert.equal(fallback.startEntrance.id, 'west');
  assert.deepEqual(fallback.points[0], event.entrances.find((entrance) => entrance.id === 'west').point);
});

test('recommendations respect categories, counts, exclusions and score preferences', () => {
  const popular = recommendBooths(event, { count: 6, priority: 'popular' });
  assert.equal(popular.length, 6);
  assert.equal(new Set(popular.map((booth) => booth.id)).size, 6);
  assert.equal(popular[0].popularity, Math.max(...event.booths.map((booth) => booth.popularity)));
  const unique = recommendBooths(event, { count: 6, priority: 'unique' });
  assert.equal(unique[0].novelty, Math.max(...event.booths.map((booth) => booth.novelty)));
  assert.notDeepEqual(unique.map((booth) => booth.id), popular.map((booth) => booth.id));
  const selected = recommendBooths(event, { count: 100, categories: ['체험'], excludeIds: [event.booths[7].id] });
  assert.ok(selected.length > 0);
  assert.ok(selected.every((booth) => booth.category === '체험' && booth.id !== event.booths[7].id));
  assert.equal(recommendBooths(event, { count: -3 }).length, 0);
  assert.equal(recommendBooths(event, { categories: ['없는 분야'] }).length, 0);
  const balanced = recommendBooths(event, { count: 6, priority: 'balanced' });
  assert.ok(new Set(balanced.map((booth) => booth.category)).size >= 4);
});
