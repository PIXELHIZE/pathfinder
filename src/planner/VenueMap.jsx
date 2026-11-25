import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { startingPlace } from './session.js';

const path = (points = []) => points.length > 1 ? `M ${points.map(({ x, y }) => `${x} ${y}`).join(' L ')}` : '';
const polygonPoints = (points) => points.map((point) => Array.isArray(point) ? point.join(',') : `${point.x},${point.y}`).join(' ');

export function VenueMap({ event, plan, route, view, onToggleBooth, locate }) {
  const viewportRef = useRef(null);
  const mapRef = useRef(null);
  const zoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [inspection, setInspection] = useState(null);
  const { width, height, walkways = [] } = event.map;
  const minDimension = Math.min(width, height);
  const selected = new Set(plan.selected);
  const completed = new Set(plan.completed);
  const startPlace = startingPlace(event, plan.start);
  const start = startPlace.point ?? startPlace.access;
  const calibrated = Number.isFinite(event.map.metresPerUnit) && event.map.metresPerUnit > 0;
  const defaultStatus = view === 'tour'
    ? (calibrated ? '' : '이동 거리는 도면상의 통로 길이로 계산했습니다.')
    : '지도에서 부스를 눌러 선택할 수 있습니다.';
  const inspected = inspection?.booth;
  let status = defaultStatus;
  if (inspected) {
    status = `${inspection.next ? '다음 부스 · ' : ''}${inspected.code} ${inspected.name}`;
    if (view === 'plan') {
      status += inspected.id === plan.start ? ' · 출발점' : selected.has(inspected.id) ? ' · 선택됨' : ' · 선택 안 됨';
    }
  }
  const source = event.source || {};
  const sourceLinks = [
    ['공식 배치도', source.map],
    ['부스 목록', source.booths === source.map ? null : source.booths],
    ['공식 선정', source.highlights],
    ['기획 구역', source.programs],
    ['관람 안내', source.visit],
  ].filter(([, url]) => url);
  const activeCodes = new Set(event.booths.map((booth) => booth.code));
  const obstacles = (event.map.obstacles || []).filter(({ code }) => !activeCodes.has(code));
  const floor = event.map.outline || { x: 0, y: 0, width, height };
  const routeLines = (route?.segments || []).map((segment) => path(segment.points)).join(' ');

  const sizeMap = useCallback((nextZoom = zoomRef.current) => {
    const viewport = viewportRef.current;
    const map = mapRef.current;
    if (!viewport?.clientWidth || !viewport.clientHeight || !map) return false;
    const fit = Math.min(viewport.clientWidth / width, viewport.clientHeight / height);
    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / (map.clientWidth || 1);
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / (map.clientHeight || 1);
    const changed = nextZoom !== zoomRef.current;
    zoomRef.current = nextZoom;
    map.style.width = `${width * fit * nextZoom}px`;
    map.style.height = `${height * fit * nextZoom}px`;
    map.style.margin = nextZoom === 1 ? `${Math.max(0, (viewport.clientHeight - height * fit) / 2)}px auto 0` : '0';
    if (changed) {
      setZoom(nextZoom);
      viewport.scrollTo(centerX * map.clientWidth - viewport.clientWidth / 2, centerY * map.clientHeight - viewport.clientHeight / 2);
    }
    return true;
  }, [width, height]);

  useLayoutEffect(() => {
    sizeMap();
    const observer = new ResizeObserver(() => sizeMap());
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [sizeMap]);

  useEffect(() => {
    const booth = event.booths.find((item) => item.id === locate?.boothId);
    if (!booth) return;
    const frame = requestAnimationFrame(() => {
      if (!sizeMap(Math.max(2.25, zoomRef.current))) return;
      const viewport = viewportRef.current;
      const map = mapRef.current;
      viewport.scrollTo(
        booth.access.x / width * map.clientWidth - viewport.clientWidth / 2,
        booth.access.y / height * map.clientHeight - viewport.clientHeight / 2,
      );
      viewport.scrollIntoView({ block: 'nearest' });
      viewport.focus({ preventScroll: true });
      setInspection({ booth, next: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [locate, event.booths, width, height, sizeMap]);

  function selectBooth(booth) {
    setInspection({ booth });
    if (view !== 'tour' && booth.id !== plan.start) onToggleBooth?.(booth.id);
  }

  return (
    <section className="map-panel panel" aria-labelledby="map-title">
      <div className="section-heading">
        <div className="map-heading">
          <h2 id="map-title">전시장 지도</h2>
        </div>
        <div className="map-controls" aria-label="지도 크기">
          <button type="button" aria-label="지도 축소" disabled={zoom <= 1} onClick={() => sizeMap(Math.max(1, zoom / 1.5))}>−</button>
          <button type="button" aria-label="지도 확대" disabled={zoom >= 10} onClick={() => sizeMap(Math.min(10, zoom * 1.5))}>+</button>
          <button type="button" onClick={() => sizeMap(1)}>전체 보기</button>
        </div>
      </div>
      <div
        className="map-viewport"
        tabIndex={0}
        aria-label="전시장 지도. 확대 후 스크롤하여 이동할 수 있습니다."
        style={{ aspectRatio: `${width} / ${height}` }}
        ref={viewportRef}
      >
        <svg className="map-svg" role="img" aria-labelledby="map-svg-title" aria-describedby="map-description" viewBox={`0 0 ${width} ${height}`} ref={mapRef}>
          <title id="map-svg-title">{event.name} {event.hall} 배치도</title>
          <desc id="map-description">선택한 부스는 파란색, 방문 순서는 통로 위 숫자로 표시됩니다.</desc>
          <rect className="map-floor" x={floor.x} y={floor.y} width={floor.width} height={floor.height} />
          {(event.map.landmarks || []).map((landmark, index) => {
            const textSize = Math.min(minDimension * .024, landmark.width * 1.2 / landmark.name.length, landmark.height * .54);
            return (
              <g className="map-landmark" key={`${landmark.name}-${index}`}>
                <title>{landmark.name}</title>
                {landmark.polygon?.length
                  ? <polygon points={polygonPoints(landmark.polygon)} />
                  : <rect x={landmark.x} y={landmark.y} width={landmark.width} height={landmark.height} rx="2" />}
                <text className="map-label" x={landmark.x + landmark.width / 2} y={landmark.y + landmark.height / 2} fontSize={textSize}>{landmark.name}</text>
              </g>
            );
          })}
          <path className="map-path" d={walkways.map(path).join(' ')} />
          {obstacles.map((obstacle, index) => (
            <rect className="map-obstacle" key={`${obstacle.code || 'obstacle'}-${index}`} x={obstacle.x} y={obstacle.y} width={obstacle.width} height={obstacle.height} />
          ))}
          {event.booths.map((booth) => {
            const labelSize = Math.min(booth.height * .49, booth.width * 1.5 / booth.code.length);
            return (
              <g
                key={booth.id}
                className={`map-booth${selected.has(booth.id) ? ' selected' : ''}${completed.has(booth.id) ? ' done' : ''}`}
                onClick={() => selectBooth(booth)}
              >
                <title>{booth.code} {booth.name}</title>
                {booth.polygon?.length
                  ? <polygon points={polygonPoints(booth.polygon)} />
                  : <rect x={booth.x} y={booth.y} width={booth.width} height={booth.height} />}
                <text className="map-label" x={booth.x + booth.width / 2} y={booth.y + booth.height / 2} fontSize={labelSize}>{booth.code}</text>
              </g>
            );
          })}
          {event.entrances.map((entrance) => {
            const radius = minDimension * .009;
            return (
              <g key={entrance.id}>
                <circle className="entrance-marker" cx={entrance.point.x} cy={entrance.point.y} r={radius} />
                <text className="map-label" x={entrance.point.x} y={entrance.point.y - radius * 2} fontSize={radius * 1.55}>{entrance.name}</text>
              </g>
            );
          })}
          <path className="route-halo" d={routeLines} />
          <path className="route-line" d={routeLines} />
          <g pointerEvents="none">
            {(route?.stops || []).map((booth, index) => {
              const markerSize = Math.max(Math.min(booth.width, booth.height) * .31, minDimension * .008);
              return (
                <g key={booth.id}>
                  <circle className={`route-marker${completed.has(booth.id) ? ' done' : ''}`} cx={booth.access.x} cy={booth.access.y} r={markerSize} />
                  <text className="map-label marker-number" x={booth.access.x} y={booth.access.y} fontSize={markerSize * 1.3}>{index + 1}</text>
                </g>
              );
            })}
            <circle className="route-marker" cx={start.x} cy={start.y} r={minDimension * .011} />
            <circle cx={start.x} cy={start.y} r={minDimension * .004} fill="white" />
          </g>
        </svg>
      </div>
      <div className="map-caption">
        <span aria-live="polite">{status}</span>
        <span className="map-sources">
          {sourceLinks.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label}</a>)}
        </span>
      </div>
    </section>
  );
}
