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

function explicitHall(walkways, { booths = [], entrances = [], metresPerUnit } = {}) {
  return { map: { walkways, ...(metresPerUnit === undefined ? {} : { metresPerUnit }) }, booths, entrances };
}
const segment = (x1, y1, x2, y2) => [{x:x1,y:y1}, {x:x2,y:y2}];
const realBooth = (id, x, y, area = 'A', extra = {}) => ({id, code:id, name:id, access:{x,y}, area, category:'작가', dwellMinutes:5, ...extra});

test('explicit walkways connect interior crossings and preserve scaled geometric distance', () => {
  const hall = explicitHall([segment(100, 20, 0, 20), segment(40, -10, 40, 90)], {metresPerUnit:0.25});
  const path = shortestPath(hall, {x:10,y:20}, {x:40,y:80});
  assert.deepEqual(path.points, [{x:10,y:20}, {x:40,y:20}, {x:40,y:80}]);
  assert.equal(path.distance, 22.5);
  // Dynamic points split a temporary graph without corrupting later queries.
  assert.equal(shortestPath(hall, {x:90,y:20}, {x:40,y:-5}).distance, 18.75);
  assert.throws(() => shortestPath(hall, {x:66,y:76}, {x:40,y:20}), RangeError);
});

test('T-junctions, partial collinear overlaps, reversed segments and entrance connectors join correctly', () => {
  const entrance = {id:'entry',name:'입구',point:{x:50,y:70},access:{x:50,y:40}};
  const booth = realBooth('target', 130, 0);
  const hall = explicitHall([
    segment(0, 0, 80, 0), segment(60, 0, 120, 0), segment(140, 0, 100, 0),
    segment(50, 0, 50, 40), segment(140, 0, 140, 40),
  ], {booths:[booth], entrances:[entrance], metresPerUnit:2});
  assert.equal(shortestPath(hall, {x:0,y:0}, {x:140,y:0}).distance, 280);
  const route = planRoute(hall, {boothIds:[booth.id], startEntranceId:'entry',returnToEntrance:true});
  assert.equal(route.totalDistance, 600);
  assert.deepEqual(route.points[0], entrance.point);
  assert.deepEqual(route.points.at(-1), entrance.point);
  assert.deepEqual(route.segments[0].points, [{x:50,y:70},{x:50,y:0},{x:130,y:0}]);
});

test('explicit networks never bridge gaps or silently fall back to the sample grid', () => {
  const hall = explicitHall([segment(0,0,10,0),segment(20,0,30,0)]);
  assert.equal(shortestPath(hall,{x:2,y:0},{x:8,y:0}).distance,6);
  assert.throws(() => shortestPath(hall,{x:0,y:0},{x:30,y:0}), /연결하는 통로/);
  assert.throws(() => shortestPath(explicitHall([]),{x:66,y:76},{x:66,y:264}), RangeError);
  assert.throws(() => shortestPath(explicitHall([segment(0,0,10,10)]),{x:0,y:0},{x:10,y:10}), /수평 또는 수직/);
  assert.throws(() => shortestPath(explicitHall([[{x:0,y:0}]]),{x:0,y:0},{x:1,y:0}), TypeError);
});

test('irregular hall routing retains exact optimization and does not invent physical scale or time', () => {
  const booths = [realBooth('current',0,20),realBooth('far',100,20),realBooth('lower',100,80),realBooth('branch',30,40),realBooth('near',0,60)];
  const hall = explicitHall([segment(0,0,0,100),segment(0,100,100,100),segment(100,100,100,0),segment(0,40,30,40)],{booths});
  assert.equal(shortestPath(hall,booths[0].access,booths[1].access).distance,260);
  for(const returnToEntrance of [false,true]) {
    const result=planRoute(hall,{boothIds:booths.map((booth)=>booth.id),startBoothId:'current',returnToEntrance});
    const optimum=Math.min(...permutations(booths.slice(1)).map((order)=>{
      const sequence=[booths[0],...order,...(returnToEntrance?[booths[0]]:[])];
      return sequence.slice(1).reduce((sum,booth,index)=>sum+shortestPath(hall,sequence[index].access,booth.access).distance,0);
    }));
    assert.equal(result.totalDistance,optimum);
    assert.equal(result.walkingMinutes,null);
    assert.equal(result.totalMinutes,null);
    assert.ok(result.totalDistance<=result.baselineDistance);
  }
});

test('real recommendations use accessible aisle distance, supplied highlights and area diversity', () => {
  const booths=[realBooth('near-a',0,90),realBooth('highlight',100,0,'A',{featured:true}),realBooth('nearest',0,80),realBooth('area-b',0,100,'B'),realBooth('unreachable',1000,1000)];
  const entry={id:'entry',name:'입구',point:{x:0,y:0},access:{x:0,y:0}};
  const hall=explicitHall([segment(0,0,0,100),segment(0,100,100,100),segment(100,100,100,0)],{booths,entrances:[entry]});
  assert.deepEqual(recommendBooths(hall,{count:4,priority:'nearby'}).map((booth)=>booth.id),['nearest','near-a','area-b','highlight']);
  assert.equal(recommendBooths(hall,{count:1,priority:'featured'})[0].id,'highlight');
  assert.deepEqual(recommendBooths(hall,{count:2,priority:'balanced'}).map((booth)=>booth.id),['nearest','area-b']);
  assert.deepEqual(recommendBooths(hall,{count:3,priority:'nearby',startBoothId:'highlight',excludeIds:['area-b']}).map((booth)=>booth.id),['near-a','nearest']);
  assert.equal(recommendBooths(hall,{count:10}).some((booth)=>booth.id==='unreachable'),false);
  assert.equal(recommendBooths(hall,{count:3,categories:['존재하지 않음']}).length,0);
  const noHighlights=explicitHall(hall.map.walkways,{booths:booths.filter((booth)=>!booth.featured),entrances:[entry]});
  assert.equal(recommendBooths(noHighlights,{count:1,priority:'featured'})[0].id,'nearest');
  const numericHighlight=explicitHall(hall.map.walkways,{booths:[...booths,realBooth('supplied-score',100,10,'C',{novelty:7})],entrances:[entry]});
  assert.equal(recommendBooths(numericHighlight,{count:1,priority:'featured'})[0].id,'supplied-score');
});

test('large explicit hall reuses materialized graph for recommendations and a 30-stop heuristic route', () => {
  const booths=Array.from({length:578},(_,index)=>realBooth(`booth-${index}`,index,10,`area-${Math.floor(index/80)}`));
  const walkways=Array.from({length:578},(_,index)=>segment(index,10,index+1,10));
  const hall=explicitHall(walkways,{booths,entrances:[{id:'entry',name:'입구',point:{x:0,y:0},access:{x:0,y:10}}]});
  const picks=recommendBooths(hall,{count:30,priority:'nearby'});
  assert.deepEqual(picks.map((booth)=>booth.id),booths.slice(0,30).map((booth)=>booth.id));
  const route=planRoute(hall,{boothIds:[...picks].reverse().map((booth)=>booth.id),startEntranceId:'entry',returnToEntrance:true});
  assert.equal(route.stops.length,30);
  assert.equal(route.totalDistance,78);
  assert.ok(route.totalDistance<=route.baselineDistance);
  assert.equal(route.walkingMinutes,null);
  assert.equal(new Set(route.stops.map((booth)=>booth.id)).size,30);
});
