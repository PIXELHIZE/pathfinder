import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppHeader } from './components/AppHeader.jsx';
import { ShareDialog } from './components/ShareDialog.jsx';
import { HomePage } from './home/HomePage.jsx';
import { recommendBooths } from './planner/engine.js';
import { PlannerPage } from './planner/PlannerPage.jsx';
import { TourPage } from './planner/TourPage.jsx';
import {
  calculatePlan, findSavedEvent, maxStops, openLocation, pageUrl, rememberPlan,
  screenTitles, sharedPlanPrefix, shareUrl, storePlans,
} from './planner/session.js';

function removeBooth(plan, id) {
  const keep = boothId => boothId !== id;
  return { selected: plan.selected.filter(keep), completed: plan.completed.filter(keep) };
}

export function App({ exhibitions }) {
  const [session, setSession] = useState(() => openLocation(exhibitions, new URL(window.location.href)));
  const [share, setShare] = useState(null);
  const [notice, setNotice] = useState(session.message ?? '');
  const headingRef = useRef(null);
  const focusRequest = useRef(null);
  const { event, route, planner, view, plans, replaceUrl } = session;
  const plan = plans[event.id];
  const savedEvent = findSavedEvent(exhibitions, plans, event.id);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => storePlans(plans), [plans]);

  useEffect(() => {
    document.title = `부스패스 · ${screenTitles[view]}`;
  }, [view]);

  useLayoutEffect(() => {
    if (replaceUrl && replaceUrl !== window.location.href) window.history.replaceState(null, '', replaceUrl);
    const scroll = focusRequest.current;
    if (scroll === null) return;
    focusRequest.current = null;
    headingRef.current?.focus({ preventScroll: true });
    if (scroll) window.scrollTo(0, 0);
  }, [session]);

  useEffect(() => {
    function onLocationChange(change) {
      if (change.type !== 'popstate' && !window.location.hash.startsWith(sharedPlanPrefix)) return;
      navigate(window.location.href);
    }
    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('hashchange', onLocationChange);
    return () => {
      window.removeEventListener('popstate', onLocationChange);
      window.removeEventListener('hashchange', onLocationChange);
    };
  }, [exhibitions, session]);

  function navigate(href, focus = true, current = session) {
    const url = new URL(href);
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
    const next = openLocation(exhibitions, url, current);
    if (focus) focusRequest.current = next.view !== view;
    if (next.message) setNotice(next.message);
    setShare(null);
    setSession(next);
  }

  function followLink(click) {
    const hasModifier = click.metaKey || click.ctrlKey || click.shiftKey || click.altKey;
    if (click.defaultPrevented || click.button !== 0 || hasModifier) return;
    click.preventDefault();
    navigate(click.currentTarget.href);
  }

  function applyPlan(changes, { openTour = false, plannerChanges } = {}) {
    const result = calculatePlan(event, { ...plan, ...changes });
    const nextPlanner = plannerChanges ? { ...planner, ...plannerChanges } : planner;
    const next = rememberPlan({ ...session, route: result.route, planner: nextPlanner }, result.plan);
    if (result.message) setNotice(result.message);
    if (openTour && result.route) return navigate(pageUrl('tour', event.id), true, next);
    setSession(next);
  }

  function toggleBooth(id) {
    const alreadySelected = plan.selected.includes(id);
    if (!alreadySelected && plan.selected.length >= maxStops) {
      setNotice(`한 동선에 최대 ${maxStops}곳을 선택할 수 있습니다.`);
      return;
    }
    const selection = alreadySelected ? removeBooth(plan, id) : { selected: [...plan.selected, id] };
    applyPlan({ ...selection, planned: false }, { plannerChanges: { mode: 'manual' } });
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
    applyPlan({ selected, completed: [], planned: true }, {
      openTour: true, plannerChanges: { search: '', onlySelected: true },
    });
    if (picks.length < count) setNotice(`조건에 맞는 부스 ${picks.length}곳을 골랐습니다.`);
  }

  function toggleComplete(id, checked) {
    const completed = checked
      ? [...plan.completed, id]
      : plan.completed.filter(boothId => boothId !== id);
    setSession(rememberPlan(session, { ...plan, completed }));
  }

  function replan() {
    const start = plan.completed.at(-1);
    const selected = plan.selected.filter(id => !plan.completed.includes(id));
    applyPlan({ start, selected, completed: [] });
  }

  const actions = {
    navigate,
    followLink,
    openShare: () => setShare(shareUrl({ event, plan, route })),
    setPlanner: (field, value) => setSession(current => ({
      ...current,
      planner: { ...current.planner, [field]: value },
    })),
    changeStart: start => applyPlan({ ...removeBooth(plan, start), start }),
    changeReturn: back => applyPlan({ back }),
    toggleBooth,
    clearBooths: () => applyPlan({ selected: [], completed: [], planned: false }, {
      plannerChanges: { onlySelected: false },
    }),
    makePlan: () => applyPlan({ planned: true }, { openTour: true }),
    recommend,
    toggleComplete,
    replan,
  };

  return (
    <>
      <AppHeader view={view} eventId={event.id} tourEventId={savedEvent?.id ?? event.id} actions={actions} />
      <main className="app-main" id="main">
        {view === 'home' && <HomePage exhibitions={exhibitions} resume={savedEvent}
          actions={actions} headingRef={headingRef} />}
        {view === 'plan' && <PlannerPage exhibitions={exhibitions} event={event} plan={plan} route={route}
          planner={planner} actions={actions} headingRef={headingRef} />}
        {view === 'tour' && <TourPage key={event.id} event={event} plan={plan} route={route} actions={actions}
          headingRef={headingRef} />}
      </main>
      {share && <ShareDialog url={share} notice={setNotice} onClose={() => setShare(null)} />}
      <div className="app-status" role="status">{notice}</div>
    </>
  );
}
