import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { loadExhibitions } from './data/index.js';
import './styles.css';

const root = createRoot(document.getElementById('root'));
root.render(<main className="app-main"><p role="status">행사 자료를 불러오는 중입니다.</p></main>);

async function startApp() {
  try {
    const exhibitions = await loadExhibitions();
    root.render(<App exhibitions={exhibitions} />);
  } catch {
    root.render(
      <main className="app-main">
        <p role="alert">행사 자료를 불러오지 못했습니다.</p>
        <button type="button" className="secondary" onClick={() => window.location.reload()}>다시 불러오기</button>
      </main>,
    );
  }
}

startApp();
