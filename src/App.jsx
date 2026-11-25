import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import logo from './assets/pathfinder-logo.svg';
import { AppHeader } from './components/AppHeader.jsx';
import { ShareDialog } from './components/ShareDialog.jsx';
import { HomePage } from './home/HomePage.jsx';
import { recommendBooths } from './planner/engine.js';
import { PlannerPage } from './planner/PlannerPage.jsx';
import { TourPage } from './planner/TourPage.jsx';
import {
  calculatePlan, findSavedEvent, getEvent, maxStops, openLocation, pageUrl,
  screenTitles, shareUrl, storePlans, updateSessionPlan,
} from './planner/session.js';

function changeAddress(view, eventId) {
  const url = pageUrl(view, eventId);
  if (url.href !== window.location.href) window.history.pushState(null, '', url);
  return url;
}

export function App({ exhibitions }) {
  const [session, setSession] = useState(() => openLocation(exhibitions, new URL(window.location.href)));
  const [share, setShare] = useState(null);
  const [notice, setNotice] = useState(session.message ?? '');
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

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

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
      showPage(next, true);
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

  function showPage(next, focus) {
    if (focus) focusRequest.current = { scroll: next.view !== view };
    if (next.message) setNotice(next.message);
    setShare(null);
    setSession(next);
  }

  function navigate(screen, id, { focus = true } = {}) {
    let targetId = id ?? event.id;
    if (!id && screen === 'tour' && savedId) targetId = savedId;
    const url = changeAddress(screen, targetId);
    const next = openLocation(exhibitions, url, session);
    showPage(next, focus);
  }

  function setPlanner(field, value) {
    setSession(current => {
      const nextPlanner = { ...current.planner, [field]: value };
      return { ...current, planner: nextPlanner };
    });
  }

  function savePlan(nextPlan, { openTour = false, nextPlanner = planner } = {}) {
    const result = nextPlan.planned ? calculatePlan(event, nextPlan) : { plan: nextPlan, route: null };
    const next = updateSessionPlan({ ...session, planner: nextPlanner }, result.plan, result.route);
    if (result.message) setNotice(result.message);
    if (openTour && result.route) {
      changeAddress('tour', event.id);
      showPage({ ...next, view: 'tour', replaceUrl: null, message: undefined }, true);
      return;
    }
    setSession(next);
  }

  function changeStart(id) {
    const selected = plan.selected.filter(boothId => boothId !== id);
    const completed = plan.completed.filter(boothId => boothId !== id);
    savePlan({ ...plan, start: id, selected, completed });
  }

  function toggleBooth(id) {
    const alreadySelected = plan.selected.includes(id);
    if (!alreadySelected && plan.selected.length >= maxStops) {
      setNotice(`한 동선에 최대 ${maxStops}곳을 선택할 수 있습니다.`);
      return;
    }
    const selected = plan.selected.filter(boothId => boothId !== id);
    if (!alreadySelected) selected.push(id);
    const completed = plan.completed.filter(boothId => boothId !== id);
    const nextPlanner = { ...planner, mode: 'manual' };
    savePlan({ ...plan, selected, completed, planned: false }, { nextPlanner });
  }

  function clearBooths() {
    const nextPlan = { ...plan, selected: [], completed: [], planned: false };
    const nextPlanner = { ...planner, onlySelected: false };
    savePlan(nextPlan, { nextPlanner });
  }

  function recommend() {
    const count = Number(planner.count);
    const picks = recommendBooths(event, {
      startId: plan.start,
      count,
      categories: planner.interest ? [planner.interest] : [],
      priority: planner.priority,
      excludeIds: plan.completed,
    });
    if (!picks.length) {
      setNotice('조건에 맞고 통로로 갈 수 있는 부스가 없습니다.');
      return;
    }
    const selected = picks.map(booth => booth.id);
    const nextPlan = { ...plan, selected, completed: [], planned: true };
    const nextPlanner = { ...planner, search: '', onlySelected: true };
    savePlan(nextPlan, { openTour: true, nextPlanner });
    if (picks.length < count) setNotice(`조건에 맞는 부스 ${picks.length}곳을 골랐습니다.`);
  }

  function toggleComplete(id, checked) {
    const completed = checked
      ? [...plan.completed, id]
      : plan.completed.filter(boothId => boothId !== id);
    setSession(updateSessionPlan(session, { ...plan, completed }, route));
  }

  function replan() {
    const start = plan.completed.at(-1);
    const selected = plan.selected.filter(id => !plan.completed.includes(id));
    savePlan({ ...plan, start, selected, completed: [] });
  }

  const actions = {
    navigate,
    openShare: () => setShare(shareUrl(session)),
    setPlanner,
    changeStart,
    changeReturn: back => savePlan({ ...plan, back }),
    toggleBooth,
    clearBooths,
    makePlan: () => savePlan({ ...plan, planned: true }, { openTour: true }),
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
      {share && <ShareDialog url={share} notice={setNotice} onClose={() => setShare(null)} />}
      <div className="app-status" role="status">{notice}</div>
    </>
  );
}
