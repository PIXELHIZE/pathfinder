import { exhibitions } from './exhibitions.js';
import { planRoute, recommendBooths } from './engine.js';

const $ = (id) => document.getElementById(id);
const maxStops = 40;
const storageKey = 'boothpath.real-plans.v1';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const format = new Intl.NumberFormat('ko-KR');
const idLabels = new Map(exhibitions.map((event) => [event.id, event]));
const startOption = ({ id, name }) => `<option value="${escape(id)}">${escape(name)}</option>`;
let event = exhibitions[0];
let state;
let route = null;
let zoom = 1;
let noticeTimer;
let mode = 'manual';
let plans = {};

try {
  plans = JSON.parse(localStorage.getItem(storageKey)) || {};
} catch { /* A blocked or outdated cache can be ignored. */ }

function startingPlace() {
  return event.entrances.find((place) => place.id === state.start) ||
    event.booths.find((place) => place.id === state.start);
}

function routingOptions() {
  return event.entrances.some(({ id }) => id === state.start)
    ? { startEntranceId: state.start }
    : { startBoothId: state.start };
}

function hydrate(data = {}) {
  const starts = [...event.entrances, ...event.booths];
  const start = starts.some(({ id }) => id === data.start) ? data.start : event.entrances[0].id;
  const boothIds = new Set(event.booths.map(({ id }) => id));
  const validIds = Array.isArray(data.selected) ? data.selected.filter((id) => id !== start && boothIds.has(id)) : [];
  const selected = [...new Set(validIds)].slice(0, maxStops);
  const completed = Array.isArray(data.completed) ? [...new Set(data.completed.filter((id) => selected.includes(id)))] : [];
  return { start, selected, completed, back: data.back === true, planned: data.planned === true };
}

function writeCache() {
  plans = { ...plans, lastEvent: event.id, [event.id]: state };
  try { localStorage.setItem(storageKey, JSON.stringify(plans)); } catch { /* Planning still works without storage. */ }
}

function notice(message) {
  clearTimeout(noticeTimer);
  $('status').textContent = message;
  noticeTimer = setTimeout(() => { $('status').textContent = ''; }, 3800);
}

function restoreShared() {
  const hash = location.hash.slice(1);
  if (!hash.startsWith('route=')) return null;
  try {
    const data = JSON.parse(decodeURIComponent(hash.slice(6)));
    if (idLabels.has(data.eventId)) {
      history.replaceState(null, '', location.pathname + location.search);
      return data;
    }
  } catch { /* Leave the current plan in place if the link is malformed. */ }
  notice('이 동선 링크를 불러올 수 없습니다.');
  return null;
}

function setEvent(id, initialState) {
  event = idLabels.get(id) || exhibitions[0];
  state = hydrate(initialState || plans[event.id]);
  route = null;
  zoom = 1;
  $('search').value = '';
  $('map-status').textContent = '지도에서 부스를 눌러 선택할 수 있습니다.';
  $('only-selected').checked = false;
  $('booths').scrollTop = 0;
  const limit = Math.min(maxStops, event.booths.length);
  $('count').max = limit;
  $('count').value = Math.min(limit, 6);
  $('interest').innerHTML = '<option value="">전체</option>' + event.categories.map((category) => startOption({id: category, name: category})).join('');
  const hasFeatures = event.booths.some((booth) => booth.featured || booth.novelty > 0 || booth.popularity > 0);
  $('priority').innerHTML = '<option value="balanced">분야 골고루</option><option value="nearby">출발점 가까운 순</option>' +
    (hasFeatures ? '<option value="featured">주최 측 선정 우선</option>' : '');
  $('recommend-note').textContent = hasFeatures
    ? '공식 선정 부스와 통로 거리를 반영합니다.'
    : '공개된 인기도 자료가 없어 분야와 통로 거리로 추천합니다.';
  const details = [event.date, event.venue, event.coverage || event.hall, `${format.format(event.booths.length)}곳`];
  $('event-info').textContent = details.join(' · ');
  $('sources').innerHTML = [
    ['공식 배치도', event.source.map], ['부스 목록', event.source.booths === event.source.map ? null : event.source.booths], ['공식 선정', event.source.highlights],
  ].filter(([, url]) => url).map(([label, url]) =>
    `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`).join('');
  $('event').value = event.id;
  $('start').innerHTML = `<optgroup label="입구">${event.entrances.map(startOption).join('')}</optgroup>` +
    `<optgroup label="현재 부스">${event.booths.map((booth) => startOption({id: booth.id, name: `${booth.code} ${booth.name}`})).join('')}</optgroup>`;
  $('start').value = state.start;
  $('return').checked = state.back;
  if (state.planned && state.selected.length) calculate();
  writeCache();
  render();
  $('map-viewport').scrollTo(0, 0);
}

function setMode(next) {
  mode = next;
  $('manual').setAttribute('aria-pressed', mode === 'manual');
  $('recommend').setAttribute('aria-pressed', mode === 'recommend');
  $('recommend-form').hidden = mode !== 'recommend';
}

const normalizeSearch = (value) => value.toLocaleLowerCase().replace(/[\s_-]+/g, '');

function renderBooths() {
  const selected = new Set(state.selected);
  const query = normalizeSearch($('search').value);
  const visible = event.booths.filter((booth) => {
    if ($('only-selected').checked && !selected.has(booth.id)) return false;
    return !query || [booth.code, booth.name, booth.category, ...(booth.tags || [])].some((value) => normalizeSearch(value).includes(query));
  });
  const focus = document.activeElement?.dataset.booth;
  const scroll = $('booths').scrollTop;
  $('results').textContent = `${format.format(visible.length)}곳`;
  $('booths').innerHTML = visible.length ? visible.map((booth) => `
    <label class="booth-row">
      <input type="checkbox" data-booth="${escape(booth.id)}" ${selected.has(booth.id) ? 'checked' : ''} ${booth.id === state.start ? 'disabled' : ''}>
      <span>${escape(booth.name)}<small>${escape([booth.code, booth.category, booth.id === state.start ? '출발점' : booth.highlight].filter(Boolean).join(' · '))}</small></span>
    </label>`).join('') : '<p class="results">해당하는 부스가 없습니다.</p>';
  $('booths').scrollTop = scroll;
  if (focus) [...$('booths').querySelectorAll('[data-booth]')].find((item) => item.dataset.booth === focus)?.focus({preventScroll: true});
  $('selected-count').textContent = `${selected.size}곳 선택`;
  $('plan').disabled = $('share').disabled = !selected.size;
  $('clear').disabled = !selected.size;
}

const xy = ({ x, y }) => `${x} ${y}`;
const path = (points) => points.length > 1 ? `M ${points.map(xy).join(' L ')}` : '';

function renderMap() {
  const map = $('map');
  const selected = new Set(state.selected);
  const completed = new Set(state.completed);
  const { width, height, walkways } = event.map;
  const minDimension = Math.min(width, height);
  const start = startingPlace().point ?? startingPlace().access;
  const routeLines = route?.segments.map((segment) => path(segment.points)).join(' ') || '';
  const markers = route?.stops.map((booth, index) => {
    const markerSize = Math.max(Math.min(booth.width, booth.height) * .31, minDimension * .008);
    return `<circle class="route-marker ${completed.has(booth.id) ? 'done' : ''}" cx="${booth.access.x}" cy="${booth.access.y}" r="${markerSize}"/>
      <text class="map-label marker-number" x="${booth.access.x}" y="${booth.access.y}" font-size="${markerSize * 1.3}">${index + 1}</text>`;
  }).join('') || '';
  const entrances = event.entrances.map((entrance) => {
    const radius = minDimension * .009;
    return `<g><circle cx="${entrance.point.x}" cy="${entrance.point.y}" r="${radius}" fill="#95afa3"/>
      <text class="map-label" x="${entrance.point.x}" y="${entrance.point.y - radius * 2}" font-size="${radius * 1.55}">${escape(entrance.name)}</text></g>`;
  }).join('');
  const floor = event.map.outline || { x: 0, y: 0, width, height };
  const booths = event.booths.map((booth) => {
    const labelSize = Math.min(booth.height * .49, booth.width * 1.5 / booth.code.length);
    const shape = booth.polygon?.length
      ? `<polygon points="${booth.polygon.map((point) => Array.isArray(point) ? point.join(',') : `${point.x},${point.y}`).join(' ')}"/>`
      : `<rect x="${booth.x}" y="${booth.y}" width="${booth.width}" height="${booth.height}"/>`;
    return `<g class="map-booth ${selected.has(booth.id) ? 'selected' : ''} ${completed.has(booth.id) ? 'done' : ''}" data-map-booth="${escape(booth.id)}">
      <title>${escape(booth.code)} ${escape(booth.name)}</title>
      ${shape}
      <text class="map-label" x="${booth.x + booth.width / 2}" y="${booth.y + booth.height / 2}" font-size="${labelSize}">${escape(booth.code)}</text>
    </g>`;
  }).join('');
  const obstacles = (event.map.obstacles || []).map(({x, y, width, height}) =>
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#e9efeb" stroke="#d8e1db"/>`).join('');
  map.setAttribute('viewBox', `0 0 ${width} ${height}`);
  $('map-viewport').style.aspectRatio = `${width} / ${height}`;
  map.innerHTML = `<title id="map-svg-title">${escape(event.name)} ${escape(event.hall)} 배치도</title>
    <desc id="map-description">선택한 부스는 초록색, 방문 순서는 통로 위 숫자로 표시됩니다.</desc>
    <rect class="map-floor" x="${floor.x}" y="${floor.y}" width="${floor.width}" height="${floor.height}"/>
    <path class="map-path" d="${walkways.map(path).join(' ')}"/>
    ${obstacles}${booths}${entrances}
    <path class="route-halo" d="${routeLines}"/><path class="route-line" d="${routeLines}"/>
    <g pointer-events="none">${markers}<circle class="route-marker" cx="${start.x}" cy="${start.y}" r="${minDimension * .011}"/><circle cx="${start.x}" cy="${start.y}" r="${minDimension * .004}" fill="white"/></g>`;
  sizeMap();
}

function sizeMap(nextZoom = zoom) {
  const viewport = $('map-viewport');
  const map = $('map');
  const { width, height } = event.map;
  const fit = Math.min(viewport.clientWidth / width, viewport.clientHeight / height);
  const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / (map.clientWidth || 1);
  const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / (map.clientHeight || 1);
  const changed = nextZoom !== zoom;
  zoom = nextZoom;
  map.style.width = `${width * fit * zoom}px`;
  map.style.height = `${height * fit * zoom}px`;
  map.style.margin = zoom === 1 ? `${Math.max(0, (viewport.clientHeight - height * fit) / 2)}px auto 0` : '0';
  if (changed) viewport.scrollTo(centerX * map.clientWidth - viewport.clientWidth / 2, centerY * map.clientHeight - viewport.clientHeight / 2);
  $('zoom-in').disabled = zoom >= 10;
  $('zoom-out').disabled = zoom <= 1;
}

function renderRoute() {
  const checkFocus = document.activeElement?.dataset.complete;
  $('replan').hidden = !route || state.completed.length === 0 || state.completed.length === route.stops.length;
  if (!route) {
    $('route').textContent = '부스를 선택하거나 추천받으면 방문 순서를 계산할 수 있습니다.';
    return;
  }
  const calibrated = Number.isFinite(event.map.metresPerUnit) && event.map.metresPerUnit > 0;
  const summary = [`${route.stops.length}곳`, state.completed.length ? `${state.completed.length}곳 방문 완료` : null];
  if (calibrated) summary.push(`이동 약 ${format.format(Math.round(route.totalDistance))}m`);
  else summary.push('도면 좌표 기준으로 계산');
  if (route.savedPercent > 0 && route.stops.length > 1) summary.push(`선택한 순서보다 이동 거리 ${route.savedPercent}% 감소`);
  const completed = new Set(state.completed);
  $('route').innerHTML = `<p class="route-summary">${escape(summary.filter(Boolean).join(' · '))}</p>
    <p class="route-summary">출발 ${escape(startingPlace().name)}${state.back ? ' · 출발점 복귀' : ''}</p>
    <ol class="route-list">${route.stops.map((booth) => `
      <li class="${completed.has(booth.id) ? 'done' : ''}"><div class="route-item">
        <span class="route-name">${escape(booth.name)} <small class="route-meta">${escape(booth.code)} · ${escape(booth.category)}</small></span>
        <label class="inline-check"><input type="checkbox" data-complete="${escape(booth.id)}" ${completed.has(booth.id) ? 'checked' : ''} aria-label="${escape(booth.name)} 방문 완료"> 방문 완료</label>
      </div></li>`).join('')}</ol>`;
  if (checkFocus) [...$('route').querySelectorAll('[data-complete]')].find((item) => item.dataset.complete === checkFocus)?.focus({preventScroll: true});
}

function render() {
  renderBooths();
  renderMap();
  renderRoute();
}

function calculate() {
  if (!state.selected.length) return false;
  try {
    route = planRoute(event, { ...routingOptions(), boothIds: state.selected, returnToEntrance: state.back });
    state.planned = true;
    return true;
  } catch (error) {
    route = null;
    state.planned = false;
    notice(error instanceof RangeError ? '통로로 연결할 수 없는 부스가 있습니다. 부스 또는 출발점을 다시 골라주세요.' : '동선을 계산하지 못했습니다.');
    return false;
  }
}

function updatePlan({ showResult = false } = {}) {
  const success = calculate();
  writeCache();
  render();
  if (success && showResult) $('map-title').scrollIntoView({ block: 'start', behavior: 'auto' });
}

function invalidatePlan() {
  state.planned = false;
  route = null;
}

function toggleBooth(id) {
  const booth = event.booths.find((item) => item.id === id);
  if (!booth || id === state.start) return;
  const selected = state.selected.includes(id);
  if (!selected && state.selected.length >= maxStops) {
    notice(`한 동선에 최대 ${maxStops}곳을 선택할 수 있습니다.`);
    renderBooths();
    return;
  }
  state.selected = selected ? state.selected.filter((item) => item !== id) : [...state.selected, id];
  if (selected) state.completed = state.completed.filter((item) => item !== id);
  invalidatePlan();
  writeCache();
  render();
}

$('event').innerHTML = exhibitions.map((item) => startOption({id: item.id, name: item.coverage ? item.name : `${item.name} · ${item.hall}`})).join('');
$('event').addEventListener('change', () => setEvent($('event').value));
$('start').addEventListener('change', () => {
  state.start = $('start').value;
  state.selected = state.selected.filter((id) => id !== state.start);
  state.completed = state.completed.filter((id) => id !== state.start);
  if (state.planned && state.selected.length) calculate();
  else invalidatePlan();
  writeCache();
  render();
});
$('return').addEventListener('change', () => {
  state.back = $('return').checked;
  if (state.planned) updatePlan();
  else writeCache();
});
$('search').addEventListener('input', renderBooths);
$('only-selected').addEventListener('change', renderBooths);
$('manual').addEventListener('click', () => setMode('manual'));
$('recommend').addEventListener('click', () => setMode('recommend'));
$('booths').addEventListener('change', (ev) => {
  if (ev.target.dataset.booth) toggleBooth(ev.target.dataset.booth);
});
$('map').addEventListener('click', (ev) => {
  const box = ev.target.closest('[data-map-booth]');
  if (!box) return;
  const booth = event.booths.find(({ id }) => id === box.dataset.mapBooth);
  toggleBooth(booth.id);
  $('map-status').textContent = booth.id === state.start ? `${booth.code} ${booth.name} · 출발점` :
    `${booth.code} ${booth.name} · ${state.selected.includes(booth.id) ? '선택됨' : '선택 안 됨'}`;
});
$('zoom-in').addEventListener('click', () => sizeMap(Math.min(10, zoom * 1.5)));
$('zoom-out').addEventListener('click', () => sizeMap(Math.max(1, zoom / 1.5)));
$('fit').addEventListener('click', () => sizeMap(1));
new ResizeObserver(() => sizeMap()).observe($('map-viewport'));
$('plan').addEventListener('click', () => updatePlan({ showResult: window.innerWidth <= 760 }));
$('clear').addEventListener('click', () => {
  state.selected = [];
  state.completed = [];
  invalidatePlan();
  $('only-selected').checked = false;
  writeCache();
  render();
});
$('recommend-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const count = Number($('count').value);
  const interest = $('interest').value;
  let picks;
  try {
    picks = recommendBooths(event, {
      ...routingOptions(), count, categories: interest ? [interest] : [],
      priority: $('priority').value, excludeIds: [state.start, ...state.completed],
    });
  } catch {
    notice('부스를 추천하지 못했습니다. 출발점을 다시 골라주세요.');
    return;
  }
  if (!picks.length) {
    notice('조건에 맞고 통로로 갈 수 있는 부스가 없습니다.');
    return;
  }
  state.selected = picks.map(({ id }) => id);
  state.completed = [];
  $('search').value = '';
  $('only-selected').checked = true;
  updatePlan({ showResult: window.innerWidth <= 760 });
  if (picks.length < count) notice(`조건에 맞는 부스 ${picks.length}곳을 골랐습니다.`);
});
$('route').addEventListener('change', (ev) => {
  const id = ev.target.dataset.complete;
  if (!id) return;
  state.completed = ev.target.checked ? [...new Set([...state.completed, id])] : state.completed.filter((item) => item !== id);
  writeCache();
  renderRoute();
  renderMap();
});
$('replan').addEventListener('click', () => {
  if (!state.completed.length) return;
  state.start = state.completed.at(-1);
  state.selected = state.selected.filter((id) => !state.completed.includes(id));
  state.completed = [];
  $('start').value = state.start;
  updatePlan();
});
$('share').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.hash = `route=${encodeURIComponent(JSON.stringify({ eventId: event.id, ...state, completed: [] }))}`;
  try {
    await navigator.clipboard.writeText(url.href);
    notice('동선 링크를 복사했습니다.');
  } catch {
    notice('이 브라우저에서 링크를 복사할 수 없습니다.');
  }
});
window.addEventListener('hashchange', () => {
  const shared = restoreShared();
  if (shared) setEvent(shared.eventId, shared);
});
const shared = restoreShared();
setEvent(shared?.eventId || plans.lastEvent, shared);
