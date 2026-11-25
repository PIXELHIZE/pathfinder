import { useState } from 'react';
import { followNavigation } from '../components/navigation.js';

function EventRow({ family, records, actions, paths }) {
  const [selectedId, setSelectedId] = useState(records[0].id);
  const selected = records.find(record => record.id === selectedId);
  const optionId = `catalogue-option-${family}`;

  return (
    <li className="event-row">
      <div className="event-details">
        <h2 className="event-name">{selected.series || selected.name}</h2>
        <p className="event-date">{selected.dateRange || selected.date}</p>
        <p className="event-venue">{selected.venue}</p>
      </div>
      <div className="event-choice">
        {records.length > 1 ? (
          <>
            <label className="event-option-label" htmlFor={optionId}>{selected.optionLabel}</label>
            <select className="event-option-select" id={optionId} value={selected.id} onChange={event => setSelectedId(event.target.value)}>
              {records.map((record) => <option key={record.id} value={record.id}>{record.optionName}</option>)}
            </select>
          </>
        ) : selected.optionName && <p className="event-scope">{selected.optionName}</p>}
        <a className="primary event-planner-link" href={paths.forEvent('plan', selected.id)}
          onClick={event => followNavigation(event, actions.navigate, 'plan', selected.id)}>동선 설계</a>
      </div>
    </li>
  );
}

export function HomePage({ exhibitions, resume, actions, paths, headingRef }) {
  const groups = new Map();
  for (const exhibition of exhibitions) {
    if (!groups.has(exhibition.family)) groups.set(exhibition.family, []);
    groups.get(exhibition.family).push(exhibition);
  }

  return (
    <section aria-labelledby="home-title">
      <h1 id="home-title" tabIndex={-1} ref={headingRef}>행사 탐색</h1>
      {resume && (
        <p className="resume">
          <span>최근 동선 · {resume.name}</span>
          <a className="secondary" href={paths.forEvent('tour', resume.id)}
            onClick={event => followNavigation(event, actions.navigate, 'tour', resume.id)}>이어서 보기</a>
        </p>
      )}
      <ul className="event-list" aria-label="행사 목록">
        {[...groups].map(([family, records]) => <EventRow key={family} family={family} records={records} actions={actions} paths={paths} />)}
      </ul>
    </section>
  );
}
