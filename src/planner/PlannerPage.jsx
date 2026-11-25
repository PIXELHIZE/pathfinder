import { useEffect, useState } from 'react';
import { VenueMap } from './VenueMap.jsx';
import { maxStops } from './session.js';

const format = new Intl.NumberFormat('ko-KR');

function normalizeSearchText(value) {
  return String(value ?? '').toLocaleLowerCase().replace(/[\s_-]+/g, '');
}

function matchesSearch(searchText, values) {
  if (!searchText) return true;
  for (const value of values) {
    if (normalizeSearchText(value).includes(searchText)) return true;
  }
  return false;
}

function ManualPicker({ event, plan, planner, actions }) {
  const [unmappedOpen, setUnmappedOpen] = useState(false);
  const selectedBoothIds = new Set(plan.selected);
  const searchText = normalizeSearchText(planner.search);
  const matchingBooths = [];
  const unmappedMatches = [];

  for (const booth of event.booths) {
    if (planner.onlySelected && !selectedBoothIds.has(booth.id)) continue;
    const searchableValues = [booth.code, booth.name, booth.category, ...(booth.tags ?? [])];
    if (matchesSearch(searchText, searchableValues)) matchingBooths.push(booth);
  }
  if (!planner.onlySelected) {
    for (const booth of event.unmappedBooths ?? []) {
      if (matchesSearch(searchText, [booth.code, booth.name, booth.zone])) unmappedMatches.push(booth);
    }
  }
  const onlyUnmappedResults = searchText !== '' && unmappedMatches.length > 0 && matchingBooths.length === 0;

  useEffect(() => {
    if (onlyUnmappedResults) setUnmappedOpen(true);
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
      {unmappedMatches.length > 0 && (
        <details className="unmapped-booths" open={unmappedOpen} onToggle={toggle => setUnmappedOpen(toggle.currentTarget.open)}>
          <summary>위치 미공개 명단 · {format.format(unmappedMatches.length)}곳</summary>
          <ul>
            {unmappedMatches.map((booth, index) => (
              <li key={`${booth.code || booth.name}-${index}`}>
                <strong>{booth.name}</strong><small>{[booth.code, booth.zone].filter(Boolean).join(' · ')}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="selection">
        <span aria-live="polite">{selectedBoothIds.size}곳 선택</span>
        <button className="primary" type="button" disabled={selectedBoothIds.size === 0} onClick={actions.makePlan}>동선 만들기</button>
      </div>
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

export function PlannerPage({ exhibitions, event, plan, route, planner, actions, headingRef }) {
  const isManualMode = planner.mode === 'manual';
  const eventDetails = [event.date, event.venue];
  if (!event.venue.endsWith(event.hall)) eventDetails.push(event.hall);
  const description = eventDetails.filter(Boolean).join(' · ');
  const schedule = event.schedule ?? [];
  const dailyHours = [];
  for (const day of schedule) {
    let text = '';
    if (schedule.length > 1) text = `${Number(day.date.slice(5, 7))}월 ${Number(day.date.slice(8))}일 `;
    text += `${day.label} ${day.opens}–${day.closes}`;
    if (day.lastEntry) text += ` (입장 마감 ${day.lastEntry})`;
    dailyHours.push(text);
  }
  const hours = dailyHours.join(' · ');

  return (
    <section aria-labelledby="plan-title">
      <header className="screen-header">
        <h1 id="plan-title" tabIndex={-1} ref={headingRef}>{event.name}</h1>
        <p>{description}</p>
        {hours && <p>{hours}</p>}
        {event.site && <a className="event-address" href={event.site.directions} target="_blank" rel="noopener noreferrer">{event.site.address}</a>}
        {event.notice && <p>{event.notice}</p>}
      </header>
      <section className="event-settings panel" aria-label="행사 및 출발점 설정">
        <label>행사·구역
          <select value={event.id} onChange={change => actions.navigate('plan', change.target.value, { focus: false })}>
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
      </section>
      <div className="planner">
        <section className="booth-panel panel" aria-labelledby="booth-title">
          <div className="section-heading">
            <h2 id="booth-title">부스 선택</h2>
            {isManualMode && plan.selected.length > 0 && (
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
        <VenueMap key={event.id} event={event} plan={plan} route={route} view="plan" onToggleBooth={actions.toggleBooth} />
      </div>
    </section>
  );
}
