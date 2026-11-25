import { useEffect, useState } from 'react';
import { VenueMap } from './VenueMap.jsx';
import { maxStops } from './session.js';

const format = new Intl.NumberFormat('ko-KR');
const normalize = value => String(value ?? '').toLocaleLowerCase().replace(/[\s_-]+/g, '');

function ManualPicker({ event, plan, planner, actions }) {
  const [unmappedOpen, setUnmappedOpen] = useState(false);
  const selected = new Set(plan.selected);
  const query = normalize(planner.search);
  const matches = values => !query || values.some(value => normalize(value).includes(query));
  const booths = event.booths.filter(booth => (
    (!planner.onlySelected || selected.has(booth.id))
    && matches([booth.code, booth.name, booth.category, ...(booth.tags ?? [])])
  ));
  const unmapped = planner.onlySelected ? [] : (event.unmappedBooths ?? []).filter(booth =>
    matches([booth.code, booth.name, booth.zone]));
  const showUnmappedMatch = Boolean(query && unmapped.length && !booths.length);

  useEffect(() => {
    if (showUnmappedMatch) setUnmappedOpen(true);
  }, [query, showUnmappedMatch]);

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
        {booths.map(booth => (
          <label className={selected.has(booth.id) ? 'booth-row selected' : 'booth-row'} key={booth.id}>
            <input type="checkbox" checked={selected.has(booth.id)} disabled={booth.id === plan.start}
              onChange={() => actions.toggleBooth(booth.id)} />
            <span>{booth.name}<small>{[booth.code, booth.category, booth.id === plan.start ? '출발점' : booth.highlight].filter(Boolean).join(' · ')}</small></span>
          </label>
        ))}
        {!booths.length && <p className="results">동선에 추가할 수 있는 부스가 없습니다.</p>}
      </div>
      {unmapped.length > 0 && (
        <details className="unmapped-booths" open={unmappedOpen} onToggle={toggle => setUnmappedOpen(toggle.currentTarget.open)}>
          <summary>위치 미공개 명단 · {format.format(unmapped.length)}곳</summary>
          <ul>
            {unmapped.map((booth, index) => (
              <li key={(booth.code || booth.name) + '-' + index}>
                <strong>{booth.name}</strong><small>{[booth.code, booth.zone].filter(Boolean).join(' · ')}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="selection">
        <span aria-live="polite">{selected.size}곳 선택</span>
        <button className="primary" type="button" disabled={!selected.size} onClick={actions.makePlan}>동선 만들기</button>
      </div>
    </>
  );
}

function RecommendationForm({ event, planner, actions }) {
  const hasHighlights = event.booths.some(booth => booth.featured || booth.novelty > 0 || booth.popularity > 0);
  return (
    <form className="recommend-form" onSubmit={submit => { submit.preventDefault(); actions.recommend(); }}>
      <div className="recommend-fields">
        <label>방문할 개수
          <input type="number" inputMode="numeric" min={1} max={Math.min(maxStops, event.booths.length)}
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
  const manual = planner.mode === 'manual';
  const details = [event.date, event.venue, event.venue?.endsWith(event.hall) ? null : event.hall].filter(Boolean).join(' · ');
  const schedule = event.schedule ?? [];
  const hours = schedule.map(({ date, label, opens, closes, lastEntry }) => {
    const day = schedule.length > 1 ? `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 ` : '';
    return `${day}${label} ${opens}–${closes}${lastEntry ? ` (입장 마감 ${lastEntry})` : ''}`;
  }).join(' · ');

  return (
    <section aria-labelledby="plan-title">
      <header className="screen-header">
        <h1 id="plan-title" tabIndex={-1} ref={headingRef}>{event.name}</h1>
        <p>{details}</p>
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
            {manual && plan.selected.length > 0 && (
              <button className="text-button" type="button" onClick={actions.clearBooths}>선택 해제</button>
            )}
          </div>
          <div className="mode" role="group" aria-label="선택 방식">
            <button type="button" aria-pressed={manual} onClick={() => actions.setPlanner('mode', 'manual')}>직접 고르기</button>
            <button type="button" aria-pressed={!manual} onClick={() => actions.setPlanner('mode', 'recommend')}>추천받기</button>
          </div>
          {manual
            ? <ManualPicker key={event.id} event={event} plan={plan} planner={planner} actions={actions} />
            : <RecommendationForm event={event} planner={planner} actions={actions} />}
        </section>
        <VenueMap key={event.id} event={event} plan={plan} route={route} view="plan" onToggleBooth={actions.toggleBooth} />
      </div>
    </section>
  );
}
