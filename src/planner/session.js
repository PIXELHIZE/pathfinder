import { eventAliases } from '../data/index.js';
import { planRoute, startingPlace } from './engine.js';

export { startingPlace };

export const maxStops = 40;
export const screenTitles = { home: '행사 탐색', plan: '동선 설계', tour: '내 동선' };

const storageKey = 'boothpath.real-plans.v1';

function canonicalId(id) {
  if (Object.hasOwn(eventAliases, id)) return eventAliases[id];
  return id;
}

export function getEvent(exhibitions, id) {
  const key = canonicalId(id);
  return exhibitions.find(event => event.id === key);
}

function readPlans() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    for (const [oldId, newId] of Object.entries(eventAliases)) {
      if (saved[oldId] && !saved[newId]) saved[newId] = saved[oldId];
    }
    return { ...saved, lastEvent: canonicalId(saved.lastEvent) };
  } catch {
    return {};
  }
}

export function storePlans(plans) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(plans));
  } catch {
    return;
  }
}

export function findSavedEvent(exhibitions, plans, currentId) {
  const candidates = [currentId, plans.lastEvent, ...Object.keys(plans)];
  for (const id of candidates) {
    const event = getEvent(exhibitions, id);
    const savedPlan = plans[id];
    if (event?.id === id && savedPlan?.planned && savedPlan.selected?.length) return id;
  }
}

export function pageUrl(view, eventId, location = window.location) {
  const url = new URL(location.pathname, location.origin);
  if (view !== 'home') {
    url.searchParams.set('view', view);
    if (eventId) url.searchParams.set('event', eventId);
  }
  return url;
}

export function shareUrl({ event, plan, route }) {
  const url = pageUrl(route ? 'tour' : 'plan', event.id);
  const data = { eventId: event.id, ...plan, completed: [] };
  url.hash = `route=${encodeURIComponent(JSON.stringify(data))}`;
  return url.href;
}

function restorePlan(event, stored) {
  const start = startingPlace(event, stored?.start).id;
  const boothIds = new Set(event.booths.map(booth => booth.id));
  const selected = [];
  if (Array.isArray(stored?.selected)) {
    for (const id of stored.selected) {
      if (id === start || !boothIds.has(id) || selected.includes(id)) continue;
      selected.push(id);
      if (selected.length === maxStops) break;
    }
  }
  const completed = [];
  if (Array.isArray(stored?.completed)) {
    for (const id of stored.completed) {
      if (selected.includes(id) && !completed.includes(id)) completed.push(id);
    }
  }
  return { start, selected, completed, back: stored?.back === true, planned: stored?.planned === true };
}

export function calculatePlan(event, plan) {
  if (!plan.selected.length) return { plan: { ...plan, planned: false }, route: null };
  const route = planRoute(event, {
    boothIds: plan.selected,
    startId: plan.start,
    returnToEntrance: plan.back,
  });
  const result = { plan: { ...plan, planned: Boolean(route) }, route };
  if (!route) {
    result.message = '통로로 연결할 수 없는 부스가 있습니다. 부스 또는 출발점을 다시 골라주세요.';
  }
  return result;
}

export function updateSessionPlan(session, plan, route) {
  const eventId = session.event.id;
  const plans = { ...session.plans };
  plans.lastEvent = eventId;
  plans[eventId] = plan;
  return { ...session, plan, route, plans };
}

function readSharedPlan(exhibitions, url) {
  if (!url.hash.startsWith('#route=')) return {};
  try {
    const data = JSON.parse(decodeURIComponent(url.hash.slice('#route='.length)));
    const event = getEvent(exhibitions, data?.eventId);
    if (event && Array.isArray(data.selected)) {
      return { shared: { ...data, eventId: event.id, completed: [] } };
    }
  } catch {
    return { invalidShare: true };
  }
  return { invalidShare: true };
}

export function openLocation(exhibitions, url, previous) {
  const plans = previous?.plans ?? readPlans();
  const { shared, invalidShare } = readSharedPlan(exhibitions, url);
  const requestedView = url.searchParams.get('view');
  const requestedEventId = url.searchParams.get('event');
  const requestedEvent = getEvent(exhibitions, requestedEventId);
  let validView = null;
  if (Object.hasOwn(screenTitles, requestedView)) validView = requestedView;

  let view = 'home';
  if (shared) {
    view = 'plan';
    if (shared.planned) view = 'tour';
  } else if (validView) {
    view = validView;
  } else if (requestedEvent) {
    view = 'plan';
  }

  let savedEvent;
  if (view === 'tour') {
    const savedId = findSavedEvent(exhibitions, plans, previous?.event.id);
    savedEvent = getEvent(exhibitions, savedId);
  }
  let event = getEvent(exhibitions, shared?.eventId);
  if (!event) event = requestedEvent;
  if (!event) event = savedEvent;
  if (!event) event = getEvent(exhibitions, plans.lastEvent);
  if (!event) event = previous?.event;
  if (!event) event = exhibitions[0];

  let replaceUrl = null;
  const differentEvent = view !== 'home' && requestedEventId !== event.id;
  const invalidView = requestedView && !validView;
  if (shared || invalidShare || differentEvent || invalidView) {
    replaceUrl = pageUrl(view, event.id, url).href;
  }

  const session = { event, view, plans, replaceUrl };
  if (!shared && previous?.event.id === event.id) {
    session.plan = previous.plan;
    session.route = previous.route;
    session.planner = previous.planner;
  } else {
    let storedPlan = plans[event.id];
    if (shared) storedPlan = shared;
    session.plan = restorePlan(event, storedPlan);
    session.route = null;
    if (session.plan.planned) {
      const calculated = calculatePlan(event, session.plan);
      session.plan = calculated.plan;
      session.route = calculated.route;
      if (calculated.message) session.message = calculated.message;
    }
    session.planner = {
      mode: 'manual', search: '', onlySelected: false,
      count: Math.min(event.booths.length, 6), priority: 'balanced', interest: '',
    };
  }
  if (invalidShare) session.message = '이 동선 링크를 불러올 수 없습니다.';
  return updateSessionPlan(session, session.plan, session.route);
}
