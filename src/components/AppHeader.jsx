import { followNavigation } from './navigation.js';
import { screenTitles } from '../planner/session.js';

export function AppHeader({ view, paths, actions, canShare, hasRoute, logo }) {
  return (
    <>
      <a className="skip-link" href="#main">본문으로 이동</a>
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href={paths.home} aria-label="Pathfinder 홈" onClick={event => followNavigation(event, actions.navigate, 'home')}>
            <img src={logo} width="1852" height="396" alt="" />
          </a>
          <nav className="app-nav" aria-label="주 메뉴">
            {Object.entries(screenTitles).map(([screen, title]) => (
              <a key={screen} href={paths[screen]} aria-current={view === screen ? 'page' : undefined}
                onClick={event => followNavigation(event, actions.navigate, screen)}>{title}</a>
            ))}
          </nav>
          {view !== 'home' && canShare && (
            <button className="secondary share-button" type="button" onClick={actions.openShare}>
              {hasRoute ? '동선 공유' : '부스 선택 공유'}
            </button>
          )}
        </div>
      </header>
    </>
  );
}
