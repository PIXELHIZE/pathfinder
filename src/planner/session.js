import { eventAliases } from '../data/index.js';
import { planRoute } from './engine.js';

export const maxStops = 40;
export const screenTitles = { home: '행사 탐색', plan: '동선 설계', tour: '내 동선' };

const storageKey = 'boothpath.real-plans.v1';

function canonicalId(id) {
  return Object.hasOwn(eventAliases, id) ? eventAliases[id] : id;
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
    // Planning still works when storage is blocked or full.
  }
}

export function findSavedEvent(exhibitions, plans, currentId) {
  return [currentId, plans.lastEvent, ...Object.keys(plans)].find(id =>
    getEvent(exhibitions, id)?.id === id && plans[id]?.planned && plans[id].selected?.length);
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

export function startingPlace(event, start) {
  return event.entrances.find(place => place.id === start)
    ?? event.booths.find(booth => booth.id === start)
    ?? event.entrances[0];
}

export function routingOptions(event, start) {
  return event.entrances.some(entrance => entrance.id === start)
    ? { startEntranceId: start }
    : { startBoothId: start };
}

function restorePlan(event, stored) {
  const start = startingPlace(event, stored?.start).id;
  const boothIds = new Set(event.booths.map(booth => booth.id));
  const selected = Array.isArray(stored?.selected)
    ? [...new Set(stored.selected.filter(id => id !== start && boothIds.has(id)))].slice(0, maxStops)
    : [];
  const completed = Array.isArray(stored?.completed)
    ? [...new Set(stored.completed.filter(id => selected.includes(id)))]
    : [];
  return { start, selected, completed, back: stored?.back === true, planned: stored?.planned === true };
}

export function calculatePlan(event, plan) {
  if (!plan.selected.length) return { plan: { ...plan, planned: false }, route: null };
  try {
    const route = planRoute(event, {
      ...routingOptions(event, plan.start),
      boothIds: plan.selected,
      returnToEntrance: plan.back,
    });
    return { plan: { ...plan, planned: true }, route };
  } catch (error) {
    const message = error instanceof RangeError
      ? '통로로 연결할 수 없는 부스가 있습니다. 부스 또는 출발점을 다시 골라주세요.'
      : '동선을 계산하지 못했습니다.';
    return { plan: { ...plan, planned: false }, route: null, message };
  }
}

export function updateSessionPlan(session, plan, route) {
  const eventId = session.event.id;
  return {
    ...session,
    plan,
    route,
    plans: { ...session.plans, lastEvent: eventId, [eventId]: plan },
  };
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
    // The current local plan is available if a shared link is malformed.
  }
  return { invalidShare: true };
}

export function openLocation(exhibitions, url, previous) {
  const plans = previous?.plans ?? readPlans();
  const { shared, invalidShare } = readSharedPlan(exhibitions, url);
  const requestedView = url.searchParams.get('view');
  const requestedEventId = url.searchParams.get('event');
  const requestedEvent = getEvent(exhibitions, requestedEventId);
  const validView = Object.hasOwn(screenTitles, requestedView) ? requestedView : null;
  const view = shared ? (shared.planned ? 'tour' : 'plan') : validView ?? (requestedEvent ? 'plan' : 'home');
  const savedId = view === 'tour' ? findSavedEvent(exhibitions, plans, previous?.event.id) : undefined;
  const event = getEvent(exhibitions, shared?.eventId) ?? requestedEvent ?? getEvent(exhibitions, savedId)
    ?? getEvent(exhibitions, plans.lastEvent) ?? previous?.event ?? exhibitions[0];
  const replaceUrl = shared || invalidShare || (view !== 'home' && requestedEventId !== event.id)
    || (requestedView && !validView) ? pageUrl(view, event.id, url).href : null;

  const session = { event, view, plans, replaceUrl };
  if (!shared && previous?.event.id === event.id) {
    session.plan = previous.plan;
    session.route = previous.route;
    session.planner = previous.planner;
  } else {
    const plan = restorePlan(event, shared ?? plans[event.id]);
    const calculated = plan.planned ? calculatePlan(event, plan) : { plan, route: null };
    Object.assign(session, calculated);
    session.planner = {
      mode: 'manual', search: '', onlySelected: false,
      count: Math.min(event.booths.length, 6), priority: 'balanced', interest: '',
    };
  }
  if (invalidShare) session.message = '이 동선 링크를 불러올 수 없습니다.';
  return updateSessionPlan(session, session.plan, session.route);
}
