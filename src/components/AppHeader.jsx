import logo from '../assets/pathfinder-logo.svg';
import { pageUrl, screenTitles } from '../planner/session.js';

export function AppHeader({ view, eventId, tourEventId, actions }) {
  return (
    <>
      <a className="skip-link" href="#main">본문으로 이동</a>
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href={pageUrl('home').href} aria-label="Pathfinder 홈" onClick={actions.followLink}>
            <img src={logo} width="1852" height="396" alt="" />
          </a>
          <nav className="app-nav" aria-label="주 메뉴">
            {Object.entries(screenTitles).map(([screen, title]) => (
              <a key={screen} href={pageUrl(screen, screen === 'tour' ? tourEventId : eventId).href}
                aria-current={view === screen ? 'page' : undefined} onClick={actions.followLink}>{title}</a>
            ))}
          </nav>
        </div>
      </header>
    </>
  );
}
