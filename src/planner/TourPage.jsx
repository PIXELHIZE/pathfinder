import { useState } from 'react';
import { followNavigation } from '../components/navigation.js';
import { VenueMap } from './VenueMap.jsx';
import { startingPlace } from './session.js';

const format = new Intl.NumberFormat('ko-KR');

export function TourPage({ event, plan, route, actions, paths, headingRef }) {
  const [locate, setLocate] = useState(null);

  const stops = route?.stops ?? [];
  const active = stops.length > 0;
  const completed = new Set(plan.completed);
  const next = stops.find(booth => !completed.has(booth.id));
  const progress = completed.size;
  const start = `출발 ${startingPlace(event, plan.start).name}${plan.back ? ' · 출발점 복귀' : ''}`;
  const distance = active && Number.isFinite(event.map.metresPerUnit) && event.map.metresPerUnit > 0
    ? ` · 이동 약 ${format.format(Math.round(route.totalDistance))}m`
    : '';

  return (
    <section aria-labelledby="tour-title">
      <header className="screen-header">
        <h1 id="tour-title" tabIndex={-1} ref={headingRef}>내 동선</h1>
        {active && <p>{[event.name, event.venue, event.venue.endsWith(event.hall) ? null : event.hall].filter(Boolean).join(' · ')}</p>}
      </header>
      {!active ? (
        <section className="tour-empty panel">
          <p>저장된 동선이 없습니다.</p>
          <a className="primary" href={paths.plan}
            onClick={click => followNavigation(click, actions.navigate, 'plan', event.id)}>동선 설계하기</a>
        </section>
      ) : (
        <div className="tour-layout">
          <section className="tour-progress panel" aria-label="관람 진행" aria-live="polite">
            <div className="progress-heading">
              <h2>관람 진행</h2><span><strong>{progress}</strong> / {stops.length}곳</span>
            </div>
            {next ? (
              <div className="next-stop">
                <div className="next-stop-info"><span>다음 부스 · {next.code}</span><strong>{next.name}</strong></div>
                <button className="text-button" type="button" onClick={() => setLocate({ boothId: next.id })}>지도에서 보기</button>
              </div>
            ) : <p>모든 부스 방문 완료</p>}
          </section>
          <VenueMap event={event} plan={plan} route={route} view="tour" locate={locate} />
          <section className="route-panel panel" aria-labelledby="route-title">
            <div className="section-heading"><h2 id="route-title">방문 순서</h2></div>
            <p className="route-summary">{start}{distance}</p>
            <ol className="route-list">
              {stops.map(booth => (
                <li key={booth.id} className={completed.has(booth.id) ? 'done' : next?.id === booth.id ? 'next' : undefined}>
                  <div className="route-item">
                    <span className="route-name">{booth.name} <small className="route-meta">{booth.code}</small></span>
                    <label className="inline-check">
                      <input type="checkbox" checked={completed.has(booth.id)} aria-label={`${booth.name} 방문 완료`}
                        onChange={change => actions.toggleComplete(booth.id, change.target.checked)} /> 방문 완료
                    </label>
                  </div>
                </li>
              ))}
            </ol>
            {progress > 0 && next && <button type="button" className="secondary" onClick={actions.replan}>현재 부스에서 다시 계산</button>}
          </section>
        </div>
      )}
    </section>
  );
}
