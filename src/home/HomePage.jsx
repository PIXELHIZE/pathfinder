import { pageUrl } from '../planner/session.js';

function EventRow({ records, followLink }) {
  const first = records[0];
  const name = first.series || first.name;
  const venues = [...new Set(records.map(record => record.venue))].join(' · ');
  const metadata = (
    <span className="event-details">
      <span className="event-name">{name}</span>
      <span className="event-meta"><span>{first.dateRange || first.date}</span><span>{venues}</span></span>
    </span>
  );

  return (
    <li className="event-row">
      {records.length === 1 ? (
        <a className="event-summary" href={pageUrl('plan', first.id).href} onClick={followLink}>
          {metadata}
        </a>
      ) : (
        <details name="catalogue-event">
          <summary className="event-summary">{metadata}</summary>
          <div className="event-options" role="group" aria-label={first.optionLabel}>
            {records.map(record => (
              <a key={record.id} href={pageUrl('plan', record.id).href} onClick={followLink}
                aria-label={`${name} ${record.optionName} 동선 설계`}>
                {record.optionName}
              </a>
            ))}
          </div>
        </details>
      )}
    </li>
  );
}

export function HomePage({ exhibitions, resume, actions, headingRef }) {
  const groups = new Map();
  for (const exhibition of exhibitions) {
    if (!groups.has(exhibition.family)) groups.set(exhibition.family, []);
    groups.get(exhibition.family).push(exhibition);
  }

  return (
    <section className="catalogue" aria-labelledby="home-title">
      <h1 id="home-title" tabIndex={-1} ref={headingRef}>행사 탐색</h1>
      {resume && (
        <a className="resume" href={pageUrl('tour', resume.id).href} onClick={actions.followLink}>
          <span><small>최근 동선</small>{resume.name}</span><span className="resume-action">이어서 보기</span>
        </a>
      )}
      <ul className="event-list" aria-label="행사 목록">
        {[...groups].map(([family, records]) => <EventRow key={family} records={records} followLink={actions.followLink} />)}
      </ul>
    </section>
  );
}
