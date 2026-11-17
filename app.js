import { events, getEvent } from './data.js';
import { planRoute, recommendBooths } from './engine.js';

const $ = (selector) => document.querySelector(selector);
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const storageKey = 'boothpath.plan.v1';
const state = { eventId: events[0].id, selected: [], mode: 'manual', filter: '전체', search: '', entrance: 'south', returnToEntrance: false, recommendationCount: 6, priority: 'balanced', interests: [], completed: [], planned: true, started: false, view: 'booths' };
let route = null;
let zoom = 1;
let pan = { x: 0, y: 0 };
let popoverId = null;
let toastTimer;
let recommendationMade = false;
let persistent = true;
const event = () => getEvent(state.eventId);
const selectedBooths = () => event().booths.filter((booth) => state.selected.includes(booth.id));
const initialSelection = (exhibition) => [1,4,8,13,17,22].map((index) => exhibition.booths[index].id);
state.selected = initialSelection(event());

function applySaved(data) {
  if (!data || typeof data !== 'object') return false;
  if (!events.some((item) => item.id === data.eventId)) return false;
  if (state.eventId !== data.eventId) {
    state.filter = '전체'; state.interests = []; state.search = ''; recommendationMade = false;
    $('#booth-search').value = ''; $('#recommend-result').hidden = true; closePopover();
    zoom = 1; pan = {x:0,y:0};
  }
  state.eventId = data.eventId;
  const boothIds = new Set(event().booths.map((booth) => booth.id));
  state.selected = [...new Set(Array.isArray(data.selected) ? data.selected.filter((id) => boothIds.has(id)) : [])];
  state.entrance = [...event().entrances, ...event().booths].some((place) => place.id === data.entrance) ? data.entrance : 'south';
  state.returnToEntrance = data.returnToEntrance === true;
  state.completed = Array.isArray(data.completed) ? data.completed.filter((id) => state.selected.includes(id)) : [];
  state.planned = data.planned !== false;
  state.started = data.started === true;
  return true;
}
function loadPlan() {
  try { const saved = JSON.parse(localStorage.getItem(storageKey)); applySaved(saved); } catch { /* Storage can be unavailable in private browser contexts. */ }
  const hash = location.hash;
  if (hash.startsWith('#plan=')) {
    try {
      const binary = atob(decodeURIComponent(hash.slice(6)));
      const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
      if (!applySaved(parsed)) throw new Error('Invalid plan');
      state.completed = [];
      state.started = false;
      showToast('공유받은 부스 선택을 불러왔어요.');
    } catch { showToast('공유 링크를 읽지 못했어요. 저장된 동선을 표시합니다.'); }
  }
}
function serializable() {
  return {eventId: state.eventId, selected: state.selected, entrance: state.entrance, returnToEntrance: state.returnToEntrance, completed: state.completed, planned: state.planned, started: state.started};
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify(serializable())); persistent = true; }
  catch { persistent = false; }
  $('.save-status').innerHTML = `<span></span>${persistent ? '자동 저장됨' : '이 창에서만 유지됨'}`;
}
function showToast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
function compute() {
  state.selected = state.selected.filter(id => id !== state.entrance);
  route = state.planned && state.selected.length ? planRoute(event(), {boothIds: state.selected, startEntranceId: state.entrance, startBoothId: event().booths.some((booth) => booth.id === state.entrance) ? state.entrance : undefined, returnToEntrance: state.returnToEntrance}) : null;
}
function markChanged() {
  state.planned = false;
  state.completed = [];
  state.started = false;
  route = null;
  persist();
  renderSelection();
  renderMap();
  renderRoute();
}
function toggleBooth(id) {
  if (id === state.entrance) {renderBooths();showToast('현재 위치인 부스는 방문할 목록에서 제외해요.');return;}
  if (!event().booths.some((booth) => booth.id === id)) return;
  state.selected = state.selected.includes(id) ? state.selected.filter((item) => item !== id) : [...state.selected, id];
  markChanged();
  renderBooths();
  if (popoverId === id) renderPopover(id);
}
function renderEvent() {
  $('#event-select').innerHTML = events.map((item) => `<option value="${item.id}" ${item.id === state.eventId ? 'selected' : ''}>${escape(item.name)}</option>`).join('');
  $('#event-meta').innerHTML = `<strong>${escape(event().venue)}</strong><br>${event().booths.length}개 부스 · 가상 행사 데이터`;
  $('#entrance-select').innerHTML = `<optgroup label="입구에서 출발">${event().entrances.map((entrance) => `<option value="${entrance.id}" ${entrance.id === state.entrance ? 'selected' : ''}>${escape(entrance.name)}</option>`).join('')}</optgroup><optgroup label="현재 부스에서 출발">${event().booths.map((booth) => `<option value="${booth.id}" ${booth.id === state.entrance ? 'selected' : ''}>${booth.code} ${escape(booth.name)}</option>`).join('')}</optgroup>`;
  $('#return-input').checked = state.returnToEntrance;
  renderCategories();
}
function renderCategories() {
  $('#category-filters').innerHTML = ['전체', ...event().categories].map((category) => `<button data-category="${escape(category)}" class="${state.filter === category ? 'active' : ''}" aria-pressed="${state.filter === category}">${escape(category)}</button>`).join('');
  $('#recommend-categories').innerHTML = event().categories.map((category) => `<button data-interest="${escape(category)}" class="${state.interests.includes(category) ? 'active' : ''}" aria-pressed="${state.interests.includes(category)}">${escape(category)}</button>`).join('');
}
function renderBooths() {
  const list = $('#booth-list');
  const previousScroll = list.scrollTop;
  const focusedBooth = document.activeElement?.dataset.booth;
  let booths = event().booths;
  if (state.mode === 'recommend') booths = booths.filter((booth) => state.selected.includes(booth.id));
  else {
    if (state.filter !== '전체') booths = booths.filter((booth) => booth.category === state.filter);
    const query = state.search.trim().toLocaleLowerCase();
    if (query) booths = booths.filter((booth) => `${booth.name} ${booth.code} ${booth.category} ${booth.tags.join(' ')}`.toLocaleLowerCase().includes(query));
  }
  $('#list-count').textContent = `전체 ${booths.length}개`;
  list.innerHTML = booths.length ? booths.map((booth) => {
    const checked = state.selected.includes(booth.id);
    return `<label class="booth-item ${checked ? 'selected' : ''}"><input type="checkbox" data-booth="${booth.id}" ${checked ? 'checked' : ''} ${booth.id === state.entrance ? 'disabled' : ''} aria-label="${escape(booth.name)} ${booth.code} 선택"><span class="booth-checkbox">${icon('check')}</span><div class="booth-info"><div class="booth-meta"><span class="booth-code">${booth.code}${booth.id === state.entrance ? ' · 현재 위치' : ''}</span><i class="meta-dot"></i>${escape(booth.category)}</div><div class="booth-name">${escape(booth.name)}${booth.novelty >= 94 ? icon('spark') : ''}</div><div class="booth-description">${escape(booth.description)}</div></div>${booth.popularity >= 93 ? '<span class="booth-chip">인기</span>' : ''}</label>`;
  }).join('') : `<div class="empty-list">${state.mode === 'recommend' ? '취향과 방문할 개수를 정하고<br>추천받기를 눌러보세요.' : '검색 결과가 없어요.<br>다른 이름이나 번호로 찾아보세요.'}</div>`;
  list.scrollTop = previousScroll;
  if (focusedBooth) list.querySelector(`[data-booth="${focusedBooth}"]`)?.focus({preventScroll: true});
}
function renderSelection() {
  const count = state.selected.length;
  $('#selection-count').textContent = count;
  $('#action-count').textContent = count;
  $('#mobile-route-count').textContent = route ? count : '';
  $('#dwell-summary').textContent = count ? `부스 체류 약 ${selectedBooths().reduce((sum, booth) => sum + booth.dwellMinutes, 0)}분` : '';
  $('#plan-button').disabled = !count;
  $('#plan-button').innerHTML = `${route ? '동선 다시 계산하기' : count ? `${count}개 부스 동선 만들기` : '방문할 부스를 골라주세요'}${icon('arrow')}`;
  $('#map-status').textContent = route ? '동선 준비 완료' : count ? '부스 선택 중' : '부스를 골라보세요';
}
function renderMode() {
  const recommending = state.mode === 'recommend';
  $('.booth-panel').classList.toggle('recommend-mode', recommending);
  $('#manual-tab').setAttribute('aria-selected', !recommending);
  $('#recommend-tab').setAttribute('aria-selected', recommending);
  $('#manual-controls').hidden = recommending;
  $('#recommend-controls').hidden = !recommending;
  renderBooths();
}
function routePath(points) { return points.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' '); }
function renderMap() {
  const selected = new Set(state.selected);
  const completed = new Set(state.completed);
  const palettes = ['#eaeede','#e8e8ef','#eae7dc','#e1eae5','#f0e9dd'];
  const startingBooth = event().booths.find((booth) => booth.id === state.entrance);
  const selectedEntrance = event().entrances.find((entrance) => entrance.id === state.entrance) || {point: startingBooth.access};
  const stops = new Map((route?.stops || []).map((booth, index) => [booth.id, index + 1]));
  $('#hall-map').innerHTML = `<title>${escape(event().name)} 샘플 부스 배치 및 방문 경로</title><desc>가상 전시장입니다. 각 부스를 선택하면 상세 정보를 확인할 수 있습니다.</desc>
    <rect class="hall-outer" x="36" y="38" width="928" height="636" rx="8"/>
    <rect class="hall-inner" x="47" y="49" width="906" height="614" rx="4"/>
    <text x="500" y="21" text-anchor="middle" class="hall-title">EXHIBITION HALL A</text>
    <text x="80" y="110" class="hall-zone">A ZONE</text><text x="80" y="302" class="hall-zone">B ZONE</text><text x="80" y="494" class="hall-zone">C ZONE</text>
    <path d="M470 669h60" stroke="#fafbf8" stroke-width="15"/><path d="M36 437v38M964 437v38" stroke="#fafbf8" stroke-width="12"/>
    <text x="500" y="731" class="entrance-label" text-anchor="middle">중앙 입구 / 출구</text>
    <text x="23" y="490" class="hall-text" text-anchor="middle" transform="rotate(-90 23 490)" style="font-size:9px">왼쪽 입구</text><text x="978" y="490" class="hall-text" text-anchor="middle" transform="rotate(90 978 490)" style="font-size:9px">오른쪽 입구</text>
    <path class="entrance-path" d="M486 689l14-10 14 10M492 699l8-6 8 6"/>
    ${event().booths.map((booth) => `<g class="map-booth ${selected.has(booth.id) ? 'is-selected' : ''} ${completed.has(booth.id) ? 'is-completed' : ''}" data-map-booth="${booth.id}" role="button" tabindex="0" aria-label="${escape(booth.code)} ${escape(booth.name)}, ${escape(booth.category)}${selected.has(booth.id) ? ', 선택됨' : ''}" aria-pressed="${selected.has(booth.id)}"><rect x="${booth.x}" y="${booth.y}" width="${booth.width}" height="${booth.height}" rx="5" fill="${palettes[event().categories.indexOf(booth.category) % palettes.length]}"/><text x="${booth.x + booth.width/2}" y="${booth.y+40}" text-anchor="middle" class="booth-svg-code" style="font-size:17px">${booth.code}</text><text x="${booth.x + booth.width/2}" y="${booth.y+59}" text-anchor="middle" class="booth-svg-name" style="font-size:10px">${escape(booth.category)}</text></g>`).join('')}
    ${route ? route.segments.map((segment) => `<path class="route-line-halo" d="${routePath(segment.points)}"/><path class="route-line" d="${routePath(segment.points)}"/>`).join('') : ''}
    ${(route?.stops || []).map((booth) => `<path d="M${booth.x+booth.width/2},${booth.y+booth.height+5}V${booth.access.y-13}" stroke="#9bb88a" stroke-width="1.5" stroke-dasharray="3 3"/><g class="route-marker ${completed.has(booth.id) ? 'completed' : ''}" style="pointer-events:none"><circle cx="${booth.access.x}" cy="${booth.access.y}" r="12"/><text x="${booth.access.x}" y="${booth.access.y}">${completed.has(booth.id) ? '✓' : stops.get(booth.id)}</text></g>`).join('')}
    <circle class="entrance-dot" cx="${selectedEntrance.point.x}" cy="${selectedEntrance.point.y}" r="9"/><circle cx="${selectedEntrance.point.x}" cy="${selectedEntrance.point.y}" r="3" fill="#fff"/>`;
  applyMapTransform();
}
function applyMapTransform() { $('#hall-map').style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`; $('#map-viewport').classList.toggle('is-zoomed',zoom>1); $('.map-scale i').style.width = `${Math.max(8,$('#hall-map').getBoundingClientRect().width/1000*40)}px`; }
function renderPopover(id) {
  const booth = event().booths.find((booth) => booth.id === id);
  if (!booth) return closePopover();
  popoverId = id;
  const selected = state.selected.includes(id);
  $('#booth-popover').innerHTML = `<div class="popover-top"><span>${booth.code} · ${escape(booth.category)}</span><button class="icon-button" id="close-popover" aria-label="부스 상세 닫기">${icon('close')}</button></div><h3>${escape(booth.name)}</h3><p>${escape(booth.description)}</p><div class="popover-tags">${booth.tags.map((tag) => `<span>${escape(tag)}</span>`).join('')}<span>체류 약 ${booth.dwellMinutes}분</span></div><button class="primary-button" data-popover-toggle="${id}" ${id === state.entrance ? 'disabled' : ''}>${id === state.entrance ? '현재 위치인 부스예요' : selected ? '선택한 부스에서 빼기' : '방문할 부스에 담기'}${icon(selected ? 'minus' : 'plus')}</button>`;
  $('#booth-popover').hidden = false;
}
function closePopover() { $('#booth-popover').hidden = true; popoverId = null; }
function renderRoute() {
  const content = $('#route-content');
  $('#route-badge').textContent = route ? `${route.stops.length}개 부스` : '아직 비어 있어요';
  if (!route) {
    content.innerHTML = `<div class="empty-state">${icon('route')}<strong>${state.selected.length ? '부스를 골랐어요!' : '어떤 부스가 궁금하세요?'}</strong><p>${state.selected.length ? '동선 만들기를 누르면 효율적인 방문 순서와 경로가 여기에 표시돼요.' : '직접 부스를 선택하거나 추천받기로 나만의 동선을 시작해보세요.'}</p></div>`;
    return;
  }
  const completed = new Set(state.completed);
  const next = route.stops.find((booth) => !completed.has(booth.id));
  const entrance = route.startEntrance;
  const distance = Math.round(route.totalDistance);
  const walking = route.walkingMinutes;
  const progress = route.stops.length ? Math.round(completed.size / route.stops.length * 100) : 0;
  const stopMarkup = route.stops.map((booth, index) => {
    const segment = route.segments[index];
    const done = completed.has(booth.id);
    return `<div class="itinerary-stop ${done ? 'completed' : ''} ${state.started && next?.id === booth.id ? 'active-stop' : ''}"><span class="stop-number">${done ? icon('check') : index+1}</span><div class="stop-detail"><div class="stop-name"><span>${escape(booth.name)}<span class="stop-code">${booth.code}</span></span><button class="complete-button" data-complete="${booth.id}" aria-label="${escape(booth.name)} ${done ? '방문 완료 취소' : '방문 완료 표시'}" aria-pressed="${done}">${icon('check')}</button></div><div class="stop-meta">${escape(booth.category)} · ${Math.round(segment.distance)}m 이동 · 체류 ${booth.dwellMinutes}분</div></div></div>`;
  }).join('');
  content.innerHTML = `<div class="route-summary"><div class="metric"><span class="metric-label">${icon('walk')}총 이동 거리</span><strong>${distance}<small>m</small></strong></div><div class="metric"><span class="metric-label">${icon('clock')}걷는 시간</span><strong>${walking}<small>분</small></strong></div></div>
    <div class="efficiency-note">${icon('spark')}${route.savedPercent > 0 ? `선택한 순서보다 <strong>${Math.round(route.savedPercent)}% 덜 걸어요</strong>` : '<strong>통로를 따라 효율적으로 연결했어요</strong>'}</div>
    <div class="itinerary-header"><span>이 순서로 둘러보세요</span><span>방문 완료는 ✓</span></div><div class="itinerary"><div class="itinerary-stop"><span class="stop-number start">${icon('pin')}</span><div class="stop-detail"><div class="stop-name">${escape(entrance.name)}</div><div class="stop-meta">여기서 출발해요</div></div></div>${stopMarkup}${state.returnToEntrance ? `<div class="itinerary-stop"><span class="stop-number start">${icon('flag')}</span><div class="stop-detail"><div class="stop-name">출발점으로 복귀</div><div class="stop-meta">${Math.round(route.segments.at(-1).distance)}m 이동 · 관람 마무리</div></div></div>` : ''}</div>
    <div class="route-bottom">${state.started || completed.size ? `<div class="progress-row"><span>${completed.size === route.stops.length ? '모든 부스를 둘러봤어요!' : '차근차근 둘러보는 중'}</span><span>${completed.size} / ${route.stops.length}</span></div><div class="progress-track"><div style="width:${progress}%"></div></div>` : ''}<div class="tour-total"><span>체류 포함 예상 관람</span><strong>약 ${route.totalMinutes}분</strong></div><p class="route-fineprint">걷는 속도 70m/분 · 부스별 체류 시간 기준<br>현장 대기 시간은 포함하지 않아요.</p><button id="start-route" class="route-start">${icon(completed.size === route.stops.length ? 'reset' : state.started ? 'focus' : 'arrow')}${completed.size === route.stops.length ? '방문 기록 초기화' : state.started ? `다음 부스 · ${escape(next?.code || '')} 지도 보기` : '이 동선으로 출발하기'}</button>${completed.size > 0 && completed.size < route.stops.length ? `<button id="replan-remaining" class="route-start replan-button">${icon('route')}현재 부스에서 남은 동선 다시 계산</button>` : ''}</div>`;
}
function renderAll() { renderEvent(); renderMode(); renderSelection(); renderMap(); renderRoute(); setView(state.view); }
function setView(view) {
  state.view = view;
  $('.workspace').dataset.view = view;
  document.querySelectorAll('.mobile-tabs [data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
}
function makePlan() {
  if (!state.selected.length) return;
  state.planned = true;
  state.completed = [];
  state.started = false;
  compute(); persist(); closePopover(); renderSelection(); renderMap(); renderRoute();
  if (matchMedia('(max-width:760px)').matches) setView('route');
  showToast(`${route.stops.length}개 부스를 잇는 동선이 준비됐어요.`);
}
function changeEvent(id) {
  state.eventId = id;
  state.selected = [];
  state.search = ''; state.filter = '전체'; state.interests = []; state.completed = []; state.entrance = 'south'; state.started = false; state.planned = false;
  state.recommendationCount = 6; $('#recommend-count').value = 6;
  $('#booth-search').value = '';
  route = null; recommendationMade = false; $('#recommend-result').hidden = true;
  closePopover(); zoom = 1; pan = {x:0,y:0};
  persist(); renderAll(); normalizeCount();
  showToast(`${event().name} 샘플 행사를 불러왔어요.`);
}
function normalizeCount() {
  const value = Math.min(event().booths.length, Math.max(1, Math.floor(Number($('#recommend-count').value) || 1)));
  state.recommendationCount = value;
  $('#recommend-count').value = value;
  $('#count-minus').disabled = value <= 1;
  $('#count-plus').disabled = value >= event().booths.length;
  return value;
}
function recommend() {
  const count = normalizeCount();
  const recommended = recommendBooths(event(), {count, categories: state.interests, priority: state.priority, excludeIds: [state.entrance]});
  state.selected = recommended.map((booth) => booth.id);
  recommendationMade = true;
  $('#recommend-result').hidden = false;
  $('#recommend-result').textContent = `${recommended.length}곳을 골랐어요.${recommended.length < count ? ' 현재 위치와 관심 분야를 반영해 가능한 부스를 모두 골랐어요.' : ' 아래에서 확인하고, 동선을 만들어보세요.'}`;
  markChanged(); renderBooths();
  showToast(`${recommended.length}개 부스를 추천했어요. 자유롭게 빼거나 바꿔보세요.`);
}
function buildShareLink() {
  const data = {...serializable(), completed: [], started: false};
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const encoded = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
  return `${location.origin}${location.pathname}#plan=${encodeURIComponent(encoded)}`;
}
async function copyShareLink() {
  const link = $('#share-link').value;
  try { await navigator.clipboard.writeText(link); showToast('동선 링크를 복사했어요.'); $('#share-dialog').close(); }
  catch { $('#share-link').focus(); $('#share-link').select(); showToast('링크를 선택했어요. 복사해서 공유해주세요.'); }
}

$('#event-select').addEventListener('change', (e) => changeEvent(e.target.value));
$('#entrance-select').addEventListener('change', (e) => {state.entrance = e.target.value; state.selected=state.selected.filter(id=>id!==state.entrance);state.completed=[];state.started=false;if (state.planned) compute(); persist(); renderSelection();renderBooths();renderMap(); renderRoute();});
$('#return-input').addEventListener('change', (e) => {state.returnToEntrance = e.target.checked; if (state.planned) compute(); persist(); renderMap(); renderRoute();});
$('#booth-search').addEventListener('input', (e) => {state.search = e.target.value; renderBooths();});
$('#category-filters').addEventListener('click', (e) => {const button = e.target.closest('[data-category]'); if (!button) return; state.filter = button.dataset.category; renderCategories(); renderBooths();});
$('#recommend-categories').addEventListener('click', (e) => {const button = e.target.closest('[data-interest]'); if (!button) return; const category = button.dataset.interest; state.interests = state.interests.includes(category) ? state.interests.filter((value) => value !== category) : [...state.interests, category]; renderCategories();});
$('.mode-tabs').addEventListener('click', (e) => {const tab = e.target.closest('[data-mode]'); if (!tab) return; state.mode = tab.dataset.mode; renderMode();});
$('#booth-list').addEventListener('change', (e) => {if (e.target.matches('[data-booth]')) toggleBooth(e.target.dataset.booth);});
$('#clear-button').addEventListener('click', () => {state.selected = []; closePopover(); markChanged(); renderBooths(); if(recommendationMade){$('#recommend-result').hidden=true; recommendationMade=false;} showToast('부스 선택과 동선을 비웠어요.');});
$('#plan-button').addEventListener('click', makePlan);
$('#count-minus').addEventListener('click', () => {$('#recommend-count').value = normalizeCount()-1; normalizeCount();});
$('#count-plus').addEventListener('click', () => {$('#recommend-count').value = normalizeCount()+1; normalizeCount();});
$('#recommend-count').addEventListener('change', normalizeCount);
$('#priority-select').addEventListener('change', (e) => {state.priority = e.target.value;});
$('#recommend-button').addEventListener('click', recommend);
$('#hall-map').addEventListener('click', (e) => {const booth = e.target.closest('[data-map-booth]'); if (booth) renderPopover(booth.dataset.mapBooth);});
$('#hall-map').addEventListener('keydown', (e) => {const booth = e.target.closest('[data-map-booth]'); if (booth && ['Enter',' '].includes(e.key)) {e.preventDefault(); renderPopover(booth.dataset.mapBooth); $('#close-popover').focus();}});
$('#booth-popover').addEventListener('click', (e) => {if(e.target.closest('#close-popover')) {const previous=popoverId;closePopover();$(`[data-map-booth="${previous}"]`)?.focus();} const toggle = e.target.closest('[data-popover-toggle]'); if (toggle) {toggleBooth(toggle.dataset.popoverToggle); closePopover();}});
$('#zoom-in').addEventListener('click', () => {zoom = Math.min(2, zoom+.2); applyMapTransform();});
$('#zoom-out').addEventListener('click', () => {zoom = Math.max(.8, zoom-.2); if(zoom<=1)pan={x:0,y:0};applyMapTransform();});
$('#zoom-reset').addEventListener('click', () => {zoom = 1; pan = {x:0,y:0}; applyMapTransform();});
let dragging = null;
$('#map-viewport').addEventListener('pointerdown', (e) => {if (zoom <= 1 || e.target.closest('button,[data-map-booth],.booth-popover')) return; dragging = {x:e.clientX,y:e.clientY,panX:pan.x,panY:pan.y}; $('#map-viewport').setPointerCapture(e.pointerId);});
$('#map-viewport').addEventListener('pointermove', (e) => {if(!dragging)return;pan={x:Math.max(-240,Math.min(240,dragging.panX+e.clientX-dragging.x)),y:Math.max(-240,Math.min(240,dragging.panY+e.clientY-dragging.y))};applyMapTransform();});
$('#map-viewport').addEventListener('pointerup', () => {dragging=null;});
$('#map-viewport').addEventListener('pointercancel', () => {dragging=null;});
$('#route-content').addEventListener('click', (e) => {
  if (e.target.closest('#replan-remaining')) {
    const lastId = state.completed.at(-1);
    if (!lastId) return;
    state.entrance = lastId;state.selected=state.selected.filter(id=>!state.completed.includes(id));state.completed=[];state.started=false;
    compute();persist();renderAll();showToast('마지막으로 방문한 부스에서 남은 동선을 다시 계산했어요.');return;
  }
  const complete = e.target.closest('[data-complete]');
  if (complete) {const id=complete.dataset.complete;state.completed=state.completed.includes(id)?state.completed.filter((item)=>item!==id):[...state.completed,id];state.started=true;persist();renderRoute();renderMap();if(state.completed.length===route.stops.length)showToast('모든 부스를 둘러봤어요. 즐거운 관람이었길 바라요!');return;}
  if (e.target.closest('#start-route')) {
    if (state.completed.length===route.stops.length) {state.completed=[];state.started=false;persist();renderRoute();renderMap();showToast('방문 기록을 초기화했어요.');return;}
    state.started=true;persist();renderRoute();setView('map');const next=route.stops.find((booth)=>!state.completed.includes(booth.id));if(next)renderPopover(next.id);showToast(`다음 부스는 ${next.code} ${next.name}입니다.`);
  }
});
$('.mobile-tabs').addEventListener('click', (e) => {const button=e.target.closest('[data-view]');if(button)setView(button.dataset.view);});
$('#help-button').addEventListener('click', () => $('#help-dialog').showModal());
$('#share-button').addEventListener('click', () => {if(!state.selected.length){showToast('공유할 부스를 먼저 골라주세요.');return;}$('#share-link').value=buildShareLink();$('#share-dialog').showModal();});
$('#copy-link-button').addEventListener('click', copyShareLink);
for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => button.closest('dialog').close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', (e) => {if(e.target===dialog){const bounds=dialog.getBoundingClientRect();if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)dialog.close();}});
$('.brand').addEventListener('click', (e) => {e.preventDefault();setView('booths');window.scrollTo({top:0,behavior:'smooth'});});
document.addEventListener('keydown', (e) => {if(e.key==='Escape')closePopover();if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('dialog[open]')){e.preventDefault();state.mode='manual';renderMode();setView('booths');$('#booth-search').focus();}});
window.addEventListener('resize', applyMapTransform);
window.addEventListener('hashchange', () => {if(location.hash.startsWith('#plan=')){loadPlan();compute();persist();renderAll();}});
loadPlan(); compute(); persist(); renderAll(); normalizeCount();
