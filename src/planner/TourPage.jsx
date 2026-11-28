import { useState } from 'react';
import { ShareButton } from '../components/ShareDialog.jsx';
import { venueLabel } from '../data/index.js';
import { startingPlace } from './engine.js';
import { VenueMap } from './VenueMap.jsx';
import { pageUrl } from './session.js';

export function TourPage({ event, plan, route, actions, headingRef }) {
  const [locate, setLocate] = useState(null);
  const stops = route?.stops ?? [];
  const hasRoute = stops.length > 0;
  const completedBoothIds = new Set(plan.completed);
  const completedCount = completedBoothIds.size;
  const nextBooth = stops.find(booth => !completedBoothIds.has(booth.id));
  const canReplan = completedCount > 0 && Boolean(nextBooth);
  const startPlace = startingPlace(event, plan.start);
  let routeSummary = `출발 ${startPlace.name}`;
  if (plan.back) routeSummary += ' · 출발점 복귀';
  if (hasRoute && event.map.metresPerUnit > 0) {
    const metres = Math.round(route.totalDistance).toLocaleString('ko-KR');
    routeSummary += ` · 이동 약 ${metres}m`;
  }
  const eventDescription = [event.name, venueLabel(event)].filter(Boolean).join(' · ');

  return (
    <section aria-labelledby="tour-title">
      <header className="screen-header">
        <div className="screen-heading-row">
          <h1 id="tour-title" tabIndex={-1} ref={headingRef}>내 동선</h1>
          <ShareButton hasSelection={plan.selected.length > 0} hasRoute={route} onClick={actions.openShare} />
        </div>
        {hasRoute && <p>{eventDescription}</p>}
      </header>
      {!hasRoute ? (
        <section className="tour-empty panel">
          <p>저장된 동선이 없습니다.</p>
          <a className="primary" href={pageUrl('plan', event.id).href} onClick={actions.followLink}>동선 설계하기</a>
        </section>
      ) : (
        <div className="tour-layout">
          <section className="tour-progress panel" aria-label="관람 진행" aria-live="polite">
            <div className="progress-heading">
              <h2>관람 진행</h2><span><strong>{completedCount}</strong> / {stops.length}곳</span>
            </div>
            <progress value={completedCount} max={stops.length} aria-label="방문한 부스" />
            {nextBooth ? (
              <div className="next-stop">
                <div className="next-stop-info"><span>다음 부스 · {nextBooth.code}</span><strong>{nextBooth.name}</strong></div>
                <button className="text-button" type="button" onClick={() => setLocate({ booth: nextBooth })}>지도에서 보기</button>
              </div>
            ) : (
              <p>모든 부스 방문 완료</p>
            )}
          </section>
          <VenueMap event={event} plan={plan} route={route} view="tour" locate={locate} />
          <section className="route-panel panel" aria-labelledby="route-title">
            <h2 id="route-title">방문 순서</h2>
            <p className="route-summary">{routeSummary}</p>
            <ol className="route-list">
              {stops.map(booth => {
                const isCompleted = completedBoothIds.has(booth.id);
                let stopClass;
                if (isCompleted) stopClass = 'done';
                else if (nextBooth?.id === booth.id) stopClass = 'next';
                return (
                  <li key={booth.id} className={stopClass}>
                    <label className="route-item">
                      <span className="route-name">{booth.name}<small className="route-meta">{booth.code}</small></span>
                      <input type="checkbox" checked={isCompleted} aria-label={`${booth.name} 방문 완료`}
                        onChange={change => actions.toggleComplete(booth.id, change.target.checked)} />
                    </label>
                  </li>
                );
              })}
            </ol>
            {canReplan && <button type="button" onClick={actions.replan}>현재 부스에서 다시 계산</button>}
          </section>
        </div>
      )}
    </section>
  );
}
