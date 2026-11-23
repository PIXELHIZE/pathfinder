/** Event catalogue. Previews use the same real booth geometry as the planner. */
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const number = (value) => Number(value || 0).toLocaleString('ko-KR');
const pinIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

const FAMILY = {
  comicworld: {category: '창작 · 서브컬처', name: '코믹월드 339 일산', date: '2026년 11월 7일–8일', optionLabel: '방문할 날짜'},
  illustar: {category: '서브컬처 · 인디게임', name: '일러스타 페스 14', date: '2026년 10월 10일–11일', optionLabel: '둘러볼 구역'},
  cafeshow: {category: '커피 · 식음료', name: '서울카페쇼 2026', date: '2026년 11월 11일–14일', optionLabel: '둘러볼 전시 홀'},
};

function familyOf(exhibition) {
  if (/comicworld|seoul-comic/i.test(exhibition.id)) return 'comicworld';
  if (/illustar/i.test(exhibition.id)) return 'illustar';
  if (/cafe|coffee/i.test(exhibition.id)) return 'cafeshow';
  return exhibition.family || exhibition.id;
}
function metadata(key, records) {
  const first = records[0];
  const known = FAMILY[key];
  if (known) return known;
  return {category: '박람회', name: first.name.split(' · ')[0], date: first.date || '행사 일정 확인', optionLabel: '둘러볼 구역'};
}
function optionName(exhibition, key) {
  if (key === 'comicworld') {
    const day = /토요일|토\)/.test(exhibition.name + ' ' + exhibition.date) ? '토요일' : /일요일|일\)/.test(exhibition.name + ' ' + exhibition.date) ? '일요일' : exhibition.name.split(' · ').at(-1);
    const shortDate = String(exhibition.date || '').replace(/\d{4}년\s*/, '').replace(/\s*\([^)]*\)/, '');
    return `${shortDate} ${day}`;
  }
  return exhibition.hall || exhibition.name.split(' · ').at(-1);
}
function familyCount(records, key) {
  if (key === 'comicworld') return Math.max(0, ...records.map((record) => record.booths.length));
  return new Set(records.flatMap((record) => record.booths.map((booth) => booth.id))).size;
}
function dimensions(exhibition) {
  const width = Number(exhibition.map?.width);
  const height = Number(exhibition.map?.height);
  if (width > 0 && height > 0) return {x: 0, y: 0, width, height};
  const booths = exhibition.booths || [];
  if (!booths.length) return {x: 0, y: 0, width: 100, height: 100};
  const minX = Math.min(...booths.map((booth) => booth.x));
  const minY = Math.min(...booths.map((booth) => booth.y));
  const maxX = Math.max(...booths.map((booth) => booth.x + booth.width));
  const maxY = Math.max(...booths.map((booth) => booth.y + booth.height));
  return {x: minX - 12, y: minY - 12, width: maxX - minX + 24, height: maxY - minY + 24};
}
function validPoint(point) {
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}
function preview(exhibition) {
  const bounds = dimensions(exhibition);
  const palette = ['#a7b9e3', '#c2cdec', '#d7dff2', '#b4c5e9'];
  const categories = [...new Set(exhibition.booths.map((booth) => booth.category))];
  const stroke = Math.max(bounds.width, bounds.height) / 1200;
  const cells = exhibition.booths.map((booth) => {
    const color = booth.highlighted ? '#6384cd' : palette[Math.max(0, categories.indexOf(booth.category)) % palette.length];
    const common = `fill="${color}" stroke="#ffffff" stroke-width="${stroke}"`;
    if (Array.isArray(booth.polygon) && booth.polygon.length > 2) {
      const points = booth.polygon.map((point) => Array.isArray(point) ? point : [point.x, point.y]).filter(([x,y]) => Number.isFinite(x) && Number.isFinite(y));
      return `<polygon points="${points.map((point) => point.join(',')).join(' ')}" ${common}/>`;
    }
    return `<rect x="${booth.x}" y="${booth.y}" width="${booth.width}" height="${booth.height}" rx="${Math.min(2, booth.width / 8)}" ${common}/>`;
  }).join('');
  const fixtures = (exhibition.map?.obstacles || []).filter((fixture) => !exhibition.booths.some((booth) => booth.code === fixture.code)).map((fixture) => `<rect x="${fixture.x}" y="${fixture.y}" width="${fixture.width}" height="${fixture.height}" rx="1" fill="#e9edf5"/>`).join('');
  const entrances = (exhibition.entrances || []).filter((entrance) => validPoint(entrance.point)).map((entrance) => `<circle cx="${entrance.point.x}" cy="${entrance.point.y}" r="${Math.max(bounds.width, bounds.height) / 105}" fill="#3466cf" stroke="#fff" stroke-width="${stroke*2}"/>`).join('');
  return `<svg viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escape(exhibition.name)} 부스 배치 미리보기"><title>${escape(exhibition.name)}의 실제 수록 부스 배치</title><g class="event-preview-floor">${fixtures}${cells}${entrances}</g></svg>`;
}
function cardMarkup(key, records, selectedId) {
  const selected = records.find((record) => record.id === selectedId) || records[0];
  const meta = metadata(key, records);
  const count = familyCount(records, key);
  const optionId = `catalogue-option-${key.replace(/[^a-z0-9_-]/gi, '-')}`;
  const scope = key === 'comicworld' ? `창작·전문·밀리터리 구역 · 하루 최대 ${number(count)}개 부스`
    : key === 'cafeshow' ? `${records.length}개 홀 · 전체 ${number(count)}개 부스 수록`
    : key === 'illustar' ? `${selected.hall || '인디게임 쇼케이스 구역'} · ${number(count)}개 부스 수록`
    : `${selected.coverage || '공개 배치도'} · ${number(count)}개 부스 수록`;
  const choices = records.length > 1
    ? `<label class="event-option-label" for="${optionId}">${escape(meta.optionLabel)}</label><select class="event-option-select" id="${optionId}" data-catalogue-select="${escape(key)}">${records.map((record) => `<option value="${escape(record.id)}" ${record.id === selected.id ? 'selected' : ''}>${escape(optionName(record, key))} · ${number(record.booths.length)}개 부스</option>`).join('')}</select>`
    : '';
  return `<article class="event-card" data-family="${escape(key)}" data-catalogue-card="${escape(key)}">
    <div class="event-preview">${preview(selected)}</div>
    <div class="event-card-body"><p class="event-card-kicker">${escape(meta.category)}</p><h3 class="event-card-title">${escape(meta.name)}</h3><p class="event-card-date">${escape(meta.date)}</p><div class="event-card-meta">${pinIcon}<span>${escape(selected.venue)}</span></div><p class="event-card-scope${records.length === 1 ? ' event-single-scope' : ''}">${escape(scope)}</p>${choices}</div>
    <div class="event-card-footer"><a class="event-card-link" href="?view=plan&amp;event=${encodeURIComponent(selected.id)}" data-nav="plan" data-event="${escape(selected.id)}">동선 설계</a></div>
  </article>`;
}

/** Mount three event families; hall/day changes update the preview and planner link. */
export function mountCatalogue(container, exhibitions) {
  if (!container || typeof container.addEventListener !== 'function') throw new TypeError('행사 목록을 표시할 요소가 필요합니다.');
  const groups = new Map();
  for (const exhibition of exhibitions) {
    if (!Array.isArray(exhibition.booths) || !exhibition.booths.length) continue;
    const family = familyOf(exhibition);
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(exhibition);
  }
  const familyOrder = ['comicworld','illustar','cafeshow'];
  const entries = [...groups].sort(([first],[second]) => {
    const a=familyOrder.indexOf(first), b=familyOrder.indexOf(second);
    return (a < 0 ? familyOrder.length : a) - (b < 0 ? familyOrder.length : b);
  });
  container.innerHTML = entries.map(([key, records]) => cardMarkup(key, records)).join('') || '<p class="catalogue-empty">표시할 행사가 없습니다.</p>';
  container.addEventListener('change', (event) => {
    const select = event.target.closest('[data-catalogue-select]');
    if (!select || !container.contains(select)) return;
    const key = select.dataset.catalogueSelect;
    const records = groups.get(key);
    if (!records?.some((record) => record.id === select.value)) return;
    select.closest('[data-catalogue-card]').outerHTML = cardMarkup(key, records, select.value);
    container.querySelector(`[data-catalogue-select="${key}"]`)?.focus({preventScroll:true});
  });
}
