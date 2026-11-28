import { eventAliases } from '../data/index.js';
import { planRoute, startingPlace } from './engine.js';

export const maxStops = 40;
export const screenTitles = { home: '행사 탐색', plan: '동선 설계', tour: '내 동선' };
export const sharedPlanPrefix = '#route=';

const storageKey = 'boothpath.real-plans.v1';
const aliases = new Map(Object.entries(eventAliases));

function getEvent(exhibitions, id) {
  const key = aliases.get(String(id)) ?? id;
  return exhibitions.find(event => event.id === key);
}

function readPlans() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    for (const [oldId, newId] of aliases) {
      if (saved[oldId] && !saved[newId]) saved[newId] = saved[oldId];
    }
    saved.lastEvent = aliases.get(String(saved.lastEvent)) ?? saved.lastEvent;
    return saved;
  } catch {
    return {};
  }
}

export function storePlans(plans) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(plans));
  } catch {}
}

export function findSavedEvent(exhibitions, plans, currentId) {
  for (const id of [currentId, plans.lastEvent, ...Object.keys(plans)]) {
    const savedPlan = plans[id];
    if (!savedPlan?.planned || !savedPlan.selected?.length) continue;
    const event = getEvent(exhibitions, id);
    if (event?.id === id) return event;
  }
}

export function pageUrl(view, eventId, location = window.location) {
  const url = new URL(location.pathname, location.origin);
  if (view === 'home') return url;
  url.searchParams.set('view', view);
  if (eventId) url.searchParams.set('event', eventId);
  return url;
}

export function shareUrl({ event, plan, route }) {
  const url = pageUrl(route ? 'tour' : 'plan', event.id);
  const data = { eventId: event.id, ...plan, completed: [] };
  url.hash = sharedPlanPrefix + encodeURIComponent(JSON.stringify(data));
  return url.href;
}

function restorePlan(event, stored) {
  const start = startingPlace(event, stored?.start).id;
  const boothIds = new Set(event.booths.map(booth => booth.id));
  const savedSelection = Array.isArray(stored?.selected) ? stored.selected : [];
  const selected = [...new Set(savedSelection)]
    .filter(id => id !== start && boothIds.has(id))
    .slice(0, maxStops);
  const completed = Array.isArray(stored?.completed)
    ? [...new Set(stored.completed)].filter(id => selected.includes(id))
    : [];
  return { start, selected, completed, back: stored?.back === true, planned: stored?.planned === true };
}

export function calculatePlan(event, plan) {
  if (!plan.planned) return { plan, route: null };
  if (!plan.selected.length) return { plan: { ...plan, planned: false }, route: null };
  const route = planRoute(event, {
    boothIds: plan.selected,
    startId: plan.start,
    returnToEntrance: plan.back,
  });
  if (route) return { plan, route };
  return {
    plan: { ...plan, planned: false }, route,
    message: '통로로 연결할 수 없는 부스가 있습니다. 부스 또는 출발점을 다시 골라주세요.',
  };
}

export function rememberPlan(session, plan) {
  const eventId = session.event.id;
  const plans = { ...session.plans, lastEvent: eventId, [eventId]: plan };
  return { ...session, plans };
}

function readSharedPlan(exhibitions, url) {
  try {
    const encoded = url.hash.slice(sharedPlanPrefix.length);
    const data = JSON.parse(decodeURIComponent(encoded));
    if (!Array.isArray(data?.selected)) return;
    const event = getEvent(exhibitions, data.eventId);
    if (event) return { event, plan: { ...data, completed: [] } };
  } catch {}
}

export function openLocation(exhibitions, url, previous) {
  const plans = previous?.plans ?? readPlans();
  const hasSharedPlan = url.hash.startsWith(sharedPlanPrefix);
  const shared = hasSharedPlan ? readSharedPlan(exhibitions, url) : undefined;
  const requestedView = url.searchParams.get('view');
  const requestedEventId = url.searchParams.get('event');
  const requestedEvent = getEvent(exhibitions, requestedEventId);
  const validView = Object.hasOwn(screenTitles, requestedView) ? requestedView : null;
  let view = validView ?? (requestedEvent ? 'plan' : 'home');
  if (shared) view = shared.plan.planned ? 'tour' : 'plan';

  let event = shared?.event ?? requestedEvent;
  if (!event && view === 'tour') event = findSavedEvent(exhibitions, plans, previous?.event.id);
  if (!event) event = getEvent(exhibitions, plans.lastEvent) ?? previous?.event ?? exhibitions[0];

  const differentEvent = view !== 'home' && requestedEventId !== event.id;
  const invalidView = requestedView && !validView;
  const replaceUrl = hasSharedPlan || differentEvent || invalidView ? pageUrl(view, event.id, url).href : null;
  const shareMessage = hasSharedPlan && !shared ? '이 동선 링크를 불러올 수 없습니다.' : undefined;
  const session = { event, view, plans, replaceUrl, message: shareMessage };
  if (!shared && previous?.event.id === event.id) return { ...previous, ...session };

  const stored = shared?.plan ?? plans[event.id];
  const { plan, route, message } = calculatePlan(event, restorePlan(event, stored));
  const planner = {
    mode: 'manual', search: '', onlySelected: false,
    count: Math.min(event.booths.length, 6), priority: 'balanced', interest: '',
  };
  return rememberPlan({ ...session, planner, route, message: shareMessage ?? message }, plan);
}
