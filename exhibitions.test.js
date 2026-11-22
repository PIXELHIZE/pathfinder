import assert from 'node:assert/strict';
import test from 'node:test';
import { exhibitions } from './exhibitions.js';
import { planRoute, recommendBooths, shortestPath } from './engine.js';

for (const event of exhibitions) {
  test(`${event.id}: every listed booth is connected to every listed entrance`, () => {
    assert.ok(event.booths.length > 0);
    assert.equal(new Set(event.booths.map(({ id }) => id)).size, event.booths.length);
    for (const entrance of event.entrances) {
      for (const booth of event.booths) {
        const { points, distance } = shortestPath(event, entrance.point, booth.access);
        assert.deepEqual(points[0], entrance.point, booth.code);
        assert.deepEqual(points.at(-1), booth.access, booth.code);
        assert.ok(Number.isFinite(distance), booth.code);
      }
    }
  });

  test(`${event.id}: recommendations can be planned from an entrance and a current booth`, () => {
    const entrance = event.entrances[0];
    const priority = event.booths.some(({ featured }) => featured) ? 'featured' : 'balanced';
    const picks = recommendBooths(event, { count: 12, startEntranceId: entrance.id, priority });
    assert.equal(picks.length, 12);
    const groupKeys = picks.map((booth) => booth.originalBoothNumbers || booth.id);
    assert.equal(new Set(groupKeys).size, picks.length);
    if (priority === 'featured') assert.ok(picks[0].featured);
    const start = picks[0];
    const route = planRoute(event, {
      startBoothId: start.id, boothIds: picks.map(({ id }) => id), returnToEntrance: true,
    });
    assert.equal(route.stops.length, 11);
    assert.deepEqual(route.points[0], start.access);
    assert.deepEqual(route.points.at(-1), start.access);
    assert.equal(route.walkingMinutes, null);
    assert.ok(route.totalDistance <= route.baselineDistance);
  });
}
