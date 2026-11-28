import { useEffect, useRef, useState } from 'react';
import { ShareButton } from '../components/ShareDialog.jsx';
import { venueLabel } from '../data/index.js';
import { startingPlace } from './engine.js';
import { VenueMap } from './VenueMap.jsx';
import { maxStops, pageUrl } from './session.js';

function normalizeSearchText(value) {
  return String(value ?? '').toLocaleLowerCase().replace(/[\s_-]+/g, '');
}

function matchesSearch(searchText, values) {
  return !searchText || values.some(value => normalizeSearchText(value).includes(searchText));
}

function ManualPicker({ event, plan, planner, actions }) {
  const unmappedDetails = useRef(null);
  const selectedBoothIds = new Set(plan.selected);
  const searchText = normalizeSearchText(planner.search);
  const matchingBooths = event.booths.filter(booth => {
    if (planner.onlySelected && !selectedBoothIds.has(booth.id)) return false;
    const searchableValues = [booth.code, booth.name, booth.category, ...(booth.tags ?? [])];
    return matchesSearch(searchText, searchableValues);
  });
  const unmappedMatches = planner.onlySelected ? [] : (event.unmappedBooths ?? []).filter(booth =>
    matchesSearch(searchText, [booth.code, booth.name, booth.zone])
  );
  const onlyUnmappedResults = searchText !== '' && unmappedMatches.length > 0 && matchingBooths.length === 0;

  useEffect(() => {
    if (onlyUnmappedResults) unmappedDetails.current.open = true;
  }, [searchText, onlyUnmappedResults]);

  return (
    <>
      <div className="search-fields">
        <input type="search" placeholder="부스 이름 또는 번호" aria-label="부스 이름 또는 번호 검색"
          value={planner.search} onChange={change => actions.setPlanner('search', change.target.value)} />
        <label className="inline-check">
          <input type="checkbox" checked={planner.onlySelected}
            onChange={change => actions.setPlanner('onlySelected', change.target.checked)} />
          선택한 부스만
        </label>
      </div>
      <div className="booth-list" aria-label="부스 목록">
        {matchingBooths.map(booth => {
          const isSelected = selectedBoothIds.has(booth.id);
          const isStart = booth.id === plan.start;
          const boothStatus = isStart ? '출발점' : booth.highlight;
          const boothDetails = [booth.code, booth.category, boothStatus].filter(Boolean).join(' · ');
          return (
            <label className={isSelected ? 'booth-row selected' : 'booth-row'} key={booth.id}>
              <input type="checkbox" checked={isSelected} disabled={isStart}
                onChange={() => actions.toggleBooth(booth.id)} />
              <span>{booth.name}<small>{boothDetails}</small></span>
            </label>
          );
        })}
        {matchingBooths.length === 0 && <p className="results">동선에 추가할 수 있는 부스가 없습니다.</p>}
      </div>
      <details className="unmapped-booths" ref={unmappedDetails} hidden={!unmappedMatches.length}>
        <summary>위치 미공개 명단 · {unmappedMatches.length.toLocaleString('ko-KR')}곳</summary>
        <ul>
          {unmappedMatches.map((booth, index) => (
            <li key={`${booth.code || booth.name}-${index}`}>
              <strong>{booth.name}</strong><small>{[booth.code, booth.zone].filter(Boolean).join(' · ')}</small>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

function RecommendationForm({ event, planner, actions }) {
  const hasHighlights = event.booths.some(booth => booth.featured);
  const visitLimit = Math.min(maxStops, event.booths.length);

  function submitRecommendations(submitEvent) {
    submitEvent.preventDefault();
    actions.recommend();
  }

  return (
    <form className="recommend-form" onSubmit={submitRecommendations}>
      <div className="recommend-fields">
        <label>방문할 개수
          <input type="number" inputMode="numeric" min={1} max={visitLimit}
            value={planner.count} required onChange={change => actions.setPlanner('count', change.target.value)} />
        </label>
        <label>추천 기준
          <select value={planner.priority} onChange={change => actions.setPlanner('priority', change.target.value)}>
            <option value="balanced">분야 골고루</option>
            <option value="nearby">출발점 가까운 순</option>
            {hasHighlights && <option value="featured">주최 측 선정 우선</option>}
          </select>
        </label>
        <label>관심 분야
          <select value={planner.interest} onChange={change => actions.setPlanner('interest', change.target.value)}>
            <option value="">전체</option>
            {event.categories.map(category => <option key={category}>{category}</option>)}
          </select>
        </label>
      </div>
      <button className="primary" type="submit">추천하고 동선 만들기</button>
    </form>
  );
}

function formatHours(day, showDate) {
  let hours = `${day.label} ${day.opens}–${day.closes}`;
  if (day.lastEntry) hours += ` (입장 마감 ${day.lastEntry})`;
  if (!showDate) return hours;
  const [, month, date] = day.date.split('-').map(Number);
  return `${month}월 ${date}일 ${hours}`;
}

function VisitorInfo({ event }) {
  const schedule = event.schedule ?? [];
  if (!schedule.length && !event.site && !event.notice) return null;

  return (
    <details className="visitor-info">
      <summary>관람 안내</summary>
      <div>
        {schedule.map(day => <p key={day.date}>{formatHours(day, schedule.length > 1)}</p>)}
        {event.site && <a className="event-address" href={event.site.directions} target="_blank" rel="noopener noreferrer">{event.site.address}</a>}
        {event.notice && <p>{event.notice}</p>}
      </div>
    </details>
  );
}

function EventSettings({ exhibitions, event, plan, actions }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const start = startingPlace(event, plan.start);

  return (
    <section className="event-settings panel" aria-label="행사 및 출발점 설정">
      <button className="settings-toggle" type="button" aria-expanded={settingsOpen}
        aria-controls="planner-settings" onClick={() => setSettingsOpen(!settingsOpen)}>
        행사·출발 설정<span className="settings-start">{start.name}</span>
        <span aria-hidden="true">{settingsOpen ? '▴' : '▾'}</span>
      </button>
      <div className="settings-fields" id="planner-settings">
        <label>행사·구역
          <select value={event.id} onChange={change => actions.navigate(pageUrl('plan', change.target.value), false)}>
            {exhibitions.map(exhibition => <option key={exhibition.id} value={exhibition.id}>{exhibition.name}</option>)}
          </select>
        </label>
        <label>출발점
          <select value={plan.start} onChange={change => actions.changeStart(change.target.value)}>
            <optgroup label="입구">
              {event.entrances.map(entrance => <option key={entrance.id} value={entrance.id}>{entrance.name}</option>)}
            </optgroup>
            <optgroup label="현재 부스">
              {event.booths.map(booth => <option key={booth.id} value={booth.id}>{booth.code} {booth.name}</option>)}
            </optgroup>
          </select>
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={plan.back} onChange={change => actions.changeReturn(change.target.checked)} />
          출발점으로 돌아오기
        </label>
      </div>
    </section>
  );
}

export function PlannerPage({ exhibitions, event, plan, route, planner, actions, headingRef }) {
  const [mobilePane, setMobilePane] = useState('map');
  const isManualMode = planner.mode === 'manual';
  const selectedCount = plan.selected.length;
  const description = [event.date, venueLabel(event)].filter(Boolean).join(' · ');

  return (
    <section aria-labelledby="plan-title">
      <header className="screen-header">
        <h1 id="plan-title" tabIndex={-1} ref={headingRef}>{event.name}</h1>
        <p>{description}</p>
        <div className="visit-actions">
          <VisitorInfo key={event.id} event={event} />
          <ShareButton hasSelection={selectedCount > 0} hasRoute={route} onClick={actions.openShare} />
        </div>
      </header>
      <EventSettings exhibitions={exhibitions} event={event} plan={plan} actions={actions} />
      <div className="mobile-panes" role="group" aria-label="설계 화면">
        <button type="button" aria-pressed={mobilePane === 'map'} aria-controls="planner-map" onClick={() => setMobilePane('map')}>지도</button>
        <button type="button" aria-pressed={mobilePane === 'list'} aria-controls="picker" onClick={() => setMobilePane('list')}>부스 목록</button>
      </div>
      <div className="planner" data-pane={mobilePane}>
        <div className="picker-column panel">
          <section className="booth-panel" id="picker" aria-labelledby="booth-title">
            <div className="section-heading">
              <h2 id="booth-title">부스 선택</h2>
              {isManualMode && selectedCount > 0 && (
                <button className="text-button" type="button" onClick={actions.clearBooths}>선택 해제</button>
              )}
            </div>
            <div className="mode" role="group" aria-label="선택 방식">
              <button type="button" aria-pressed={isManualMode} onClick={() => actions.setPlanner('mode', 'manual')}>직접 고르기</button>
              <button type="button" aria-pressed={!isManualMode} onClick={() => actions.setPlanner('mode', 'recommend')}>추천받기</button>
            </div>
            {isManualMode
              ? <ManualPicker key={event.id} event={event} plan={plan} planner={planner} actions={actions} />
              : <RecommendationForm event={event} planner={planner} actions={actions} />}
          </section>
          {isManualMode && (
            <div className="selection">
              <span aria-live="polite"><strong>{selectedCount}</strong>곳 선택</span>
              <button className="primary" type="button" disabled={!selectedCount} onClick={actions.makePlan}>동선 만들기</button>
            </div>
          )}
        </div>
        <VenueMap id="planner-map" key={event.id} event={event} plan={plan} route={route} view="plan" onToggleBooth={actions.toggleBooth} />
      </div>
    </section>
  );
}
