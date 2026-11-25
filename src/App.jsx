import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import logo from './assets/pathfinder-logo.svg';
import { AppHeader } from './components/AppHeader.jsx';
import { ShareDialog } from './components/ShareDialog.jsx';
import { HomePage } from './home/HomePage.jsx';
import { recommendBooths } from './planner/engine.js';
import { PlannerPage } from './planner/PlannerPage.jsx';
import { TourPage } from './planner/TourPage.jsx';
import {
  calculatePlan, findSavedEvent, getEvent, maxStops, openLocation, pageUrl, routingOptions,
  screenTitles, shareUrl, storePlans, updateSessionPlan,
} from './planner/session.js';

export function App({ exhibitions }) {
  const [session, setSession] = useState(() => openLocation(exhibitions, new URL(window.location.href)));
  const [share, setShare] = useState(null);
  const [status, setStatus] = useState(() => ({ text: session.message ?? '' }));
  const headingRef = useRef(null);
  const focusRequest = useRef(null);
  const { event, plan, route, planner, view, plans } = session;
  const savedId = findSavedEvent(exhibitions, plans, event.id);
  const paths = {
    home: pageUrl('home').href,
    plan: pageUrl('plan', event.id).href,
    tour: pageUrl('tour', savedId ?? event.id).href,
    forEvent: (screen, id) => pageUrl(screen, id).href,
  };

  function notice(text) {
    setStatus({ text });
  }

  useEffect(() => {
    if (!status.text) return;
    const timer = window.setTimeout(() => setStatus({ text: '' }), 3800);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    storePlans(plans);
  }, [plans]);

  useEffect(() => {
    document.title = `부스패스 · ${screenTitles[view]}`;
  }, [view]);

  useLayoutEffect(() => {
    if (session.replaceUrl && session.replaceUrl !== window.location.href) {
      window.history.replaceState(null, '', session.replaceUrl);
    }
    const focus = focusRequest.current;
    if (!focus) return;
    focusRequest.current = null;
    headingRef.current?.focus({ preventScroll: true });
    if (focus.scroll) window.scrollTo(0, 0);
  }, [session]);

  useEffect(() => {
    function onLocationChange() {
      const next = openLocation(exhibitions, new URL(window.location.href), session);
      focusRequest.current = { scroll: next.view !== session.view };
      if (next.message) setStatus({ text: next.message });
      setShare(null);
      setSession(next);
    }
    function onHashChange() {
      if (window.location.hash.startsWith('#route=')) onLocationChange();
    }
    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [exhibitions, session]);

  function navigate(screen, id, { focus = true } = {}, current = session) {
    const saved = screen === 'tour' ? findSavedEvent(exhibitions, current.plans, current.event.id) : undefined;
    const targetId = id ?? saved ?? current.event.id;
    const url = pageUrl(screen, targetId);
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
    const next = openLocation(exhibitions, url, current);
    if (focus) focusRequest.current = { scroll: next.view !== current.view };
    if (next.message) notice(next.message);
    setShare(null);
    setSession(next);
  }

  function setPlanner(field, value) {
    setSession(current => ({ ...current, planner: { ...current.planner, [field]: value } }));
  }

  function savePlan(nextPlan, { recalculate = false, openTour = false, nextPlanner = planner } = {}) {
    const result = recalculate ? calculatePlan(event, nextPlan) : { plan: nextPlan, route: null };
    const next = updateSessionPlan({ ...session, planner: nextPlanner }, result.plan, result.route);
    if (result.message) notice(result.message);
    if (openTour && result.route) navigate('tour', event.id, {}, next);
    else setSession(next);
  }

  function changeStart(id) {
    const selected = plan.selected.filter(boothId => boothId !== id);
    const completed = plan.completed.filter(boothId => boothId !== id);
    const planned = plan.planned && selected.length > 0;
    savePlan({ ...plan, start: id, selected, completed, planned }, { recalculate: planned });
  }

  function toggleBooth(id) {
    if (id === plan.start || !event.booths.some(booth => booth.id === id)) return;
    const selected = plan.selected.includes(id);
    if (!selected && plan.selected.length >= maxStops) {
      notice(`한 동선에 최대 ${maxStops}곳을 선택할 수 있습니다.`);
      return;
    }
    savePlan({
      ...plan,
      selected: selected ? plan.selected.filter(boothId => boothId !== id) : [...plan.selected, id],
      completed: plan.completed.filter(boothId => boothId !== id),
      planned: false,
    }, { nextPlanner: { ...planner, mode: 'manual' } });
  }

  function recommend() {
    const count = Number(planner.count);
    const limit = Math.min(maxStops, event.booths.length);
    if (!Number.isInteger(count) || count < 1 || count > limit) return;
    let picks;
    try {
      picks = recommendBooths(event, {
        ...routingOptions(event, plan.start),
        count,
        categories: planner.interest ? [planner.interest] : [],
        priority: planner.priority,
        excludeIds: [plan.start, ...plan.completed],
      });
    } catch {
      notice('부스를 추천하지 못했습니다. 출발점을 다시 골라주세요.');
      return;
    }
    if (!picks.length) {
      notice('조건에 맞고 통로로 갈 수 있는 부스가 없습니다.');
      return;
    }
    savePlan({ ...plan, selected: picks.map(booth => booth.id), completed: [] }, {
      recalculate: true,
      openTour: true,
      nextPlanner: { ...planner, search: '', onlySelected: true },
    });
    if (picks.length < count) notice(`조건에 맞는 부스 ${picks.length}곳을 골랐습니다.`);
  }

  function toggleComplete(id, checked) {
    const completed = checked
      ? [...new Set([...plan.completed, id])]
      : plan.completed.filter(boothId => boothId !== id);
    setSession(updateSessionPlan(session, { ...plan, completed }, route));
  }

  function replan() {
    const start = plan.completed.at(-1);
    if (!start) return;
    const selected = plan.selected.filter(id => !plan.completed.includes(id));
    savePlan({ ...plan, start, selected, completed: [] }, { recalculate: true });
  }

  const actions = {
    navigate,
    openShare: () => setShare(shareUrl(session)),
    setPlanner,
    changeStart,
    changeReturn: back => savePlan({ ...plan, back }, { recalculate: plan.planned }),
    toggleBooth,
    clearBooths: () => savePlan({ ...plan, selected: [], completed: [], planned: false }, {
      nextPlanner: { ...planner, onlySelected: false },
    }),
    makePlan: () => savePlan(plan, { recalculate: true, openTour: true }),
    recommend,
    toggleComplete,
    replan,
  };

  return (
    <>
      <AppHeader view={view} paths={paths} actions={actions} canShare={plan.selected.length > 0} hasRoute={Boolean(route)} logo={logo} />
      <main className="app-main" id="main">
        {view === 'home' && <HomePage exhibitions={exhibitions} resume={getEvent(exhibitions, savedId)}
          actions={actions} paths={paths} headingRef={headingRef} />}
        {view === 'plan' && <PlannerPage exhibitions={exhibitions} event={event} plan={plan} route={route}
          planner={planner} actions={actions} headingRef={headingRef} />}
        {view === 'tour' && <TourPage key={event.id} event={event} plan={plan} route={route} actions={actions}
          paths={paths} headingRef={headingRef} />}
      </main>
      {share && <ShareDialog url={share} notice={notice} onClose={() => setShare(null)} />}
      <div className="app-status" role="status">{status.text}</div>
    </>
  );
}
