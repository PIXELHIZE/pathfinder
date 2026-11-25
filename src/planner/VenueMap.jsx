import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { startingPlace } from './session.js';

function pathData(points) {
  if (points.length < 2) return '';
  return `M ${points.map(point => `${point.x} ${point.y}`).join(' L ')}`;
}

function polygonCoordinates(points) {
  return points.map(point => `${point.x},${point.y}`).join(' ');
}

export function VenueMap({ event, plan, route, view, onToggleBooth, locate }) {
  const viewportRef = useRef(null);
  const svgRef = useRef(null);
  const currentZoomRef = useRef(1);
  const [zoom, setZoom] = useState(1);
  const [inspection, setInspection] = useState(null);
  const { width, height, walkways } = event.map;
  const shortestSide = Math.min(width, height);
  const selectedBoothIds = new Set(plan.selected);
  const completedBoothIds = new Set(plan.completed);
  const startLocation = startingPlace(event, plan.start);
  const startPoint = startLocation.point ?? startLocation.access;
  const isCalibrated = event.map.metresPerUnit > 0;
  const inspectedBooth = inspection?.booth;
  let status = '지도에서 부스를 눌러 선택할 수 있습니다.';
  if (view === 'tour') {
    status = '';
    if (!isCalibrated) status = '이동 거리는 도면상의 통로 길이로 계산했습니다.';
  }
  if (inspectedBooth) {
    const prefix = inspection.next ? '다음 부스 · ' : '';
    status = `${prefix}${inspectedBooth.code} ${inspectedBooth.name}`;
    if (view === 'plan') {
      if (inspectedBooth.id === plan.start) status += ' · 출발점';
      else if (selectedBoothIds.has(inspectedBooth.id)) status += ' · 선택됨';
      else status += ' · 선택 안 됨';
    }
  }
  const source = event.source;
  const boothListUrl = source.booths === source.map ? null : source.booths;
  const sourceLinks = [
    ['공식 배치도', source.map],
    ['부스 목록', boothListUrl],
    ['공식 선정', source.highlights],
    ['기획 구역', source.programs],
    ['관람 안내', source.visit],
  ].filter(([, url]) => url);
  const activeCodes = new Set(event.booths.map((booth) => booth.code));
  const obstacles = (event.map.obstacles || []).filter(({ code }) => !activeCodes.has(code));
  const floor = event.map.outline || { x: 0, y: 0, width, height };
  const walkwayPath = walkways.map(pathData).join(' ');
  const routePath = (route?.segments || []).map(segment => pathData(segment.points)).join(' ');
  const entranceRadius = shortestSide * .009;

  const resizeMap = useCallback((nextZoom = currentZoomRef.current) => {
    const viewport = viewportRef.current;
    const svg = svgRef.current;
    if (!viewport || !svg || !viewport.clientWidth || !viewport.clientHeight) return false;

    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;
    const centerX = (viewport.scrollLeft + viewportWidth / 2) / (svg.clientWidth || 1);
    const centerY = (viewport.scrollTop + viewportHeight / 2) / (svg.clientHeight || 1);
    const fitScale = Math.min(viewportWidth / width, viewportHeight / height);
    const zoomChanged = nextZoom !== currentZoomRef.current;
    currentZoomRef.current = nextZoom;
    svg.style.width = `${width * fitScale * nextZoom}px`;
    svg.style.height = `${height * fitScale * nextZoom}px`;
    svg.style.margin = '0';
    if (nextZoom === 1) {
      const topMargin = Math.max(0, (viewportHeight - height * fitScale) / 2);
      svg.style.margin = `${topMargin}px auto 0`;
    }
    if (zoomChanged) {
      setZoom(nextZoom);
      const scrollLeft = centerX * svg.clientWidth - viewportWidth / 2;
      const scrollTop = centerY * svg.clientHeight - viewportHeight / 2;
      viewport.scrollTo(scrollLeft, scrollTop);
    }
    return true;
  }, [width, height]);

  useLayoutEffect(() => {
    resizeMap();
    const resizeObserver = new ResizeObserver(() => resizeMap());
    resizeObserver.observe(viewportRef.current);
    return () => resizeObserver.disconnect();
  }, [resizeMap]);

  useEffect(() => {
    if (!locate) return;
    const targetBooth = event.booths.find(booth => booth.id === locate.boothId);
    if (!targetBooth) return;
    const animationFrame = requestAnimationFrame(() => {
      const targetZoom = Math.max(2.25, currentZoomRef.current);
      if (!resizeMap(targetZoom)) return;
      const viewport = viewportRef.current;
      const svg = svgRef.current;
      const scrollLeft = targetBooth.access.x / width * svg.clientWidth - viewport.clientWidth / 2;
      const scrollTop = targetBooth.access.y / height * svg.clientHeight - viewport.clientHeight / 2;
      viewport.scrollTo(scrollLeft, scrollTop);
      viewport.scrollIntoView({ block: 'nearest' });
      viewport.focus({ preventScroll: true });
      setInspection({ booth: targetBooth, next: true });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [locate, event.booths, width, height, resizeMap]);

  function selectBooth(booth) {
    setInspection({ booth });
    if (view === 'plan' && booth.id !== plan.start) onToggleBooth(booth.id);
  }

  return (
    <section className="map-panel panel" aria-labelledby="map-title">
      <div className="section-heading">
        <div className="map-heading">
          <h2 id="map-title">전시장 지도</h2>
        </div>
        <div className="map-controls" aria-label="지도 크기">
          <button type="button" aria-label="지도 축소" disabled={zoom <= 1} onClick={() => resizeMap(Math.max(1, zoom / 1.5))}>−</button>
          <button type="button" aria-label="지도 확대" disabled={zoom >= 10} onClick={() => resizeMap(Math.min(10, zoom * 1.5))}>+</button>
          <button type="button" onClick={() => resizeMap(1)}>전체 보기</button>
        </div>
      </div>
      <div
        className="map-viewport"
        tabIndex={0}
        aria-label="전시장 지도. 확대 후 스크롤하여 이동할 수 있습니다."
        style={{ aspectRatio: `${width} / ${height}` }}
        ref={viewportRef}
      >
        <svg className="map-svg" role="img" aria-labelledby="map-svg-title" aria-describedby="map-description" viewBox={`0 0 ${width} ${height}`} ref={svgRef}>
          <title id="map-svg-title">{event.name} {event.hall} 배치도</title>
          <desc id="map-description">선택한 부스는 파란색, 방문 순서는 통로 위 숫자로 표시됩니다.</desc>
          <rect className="map-floor" x={floor.x} y={floor.y} width={floor.width} height={floor.height} />
          {(event.map.landmarks || []).map((landmark, index) => {
            const textSize = Math.min(shortestSide * .024, landmark.width * 1.2 / landmark.name.length, landmark.height * .54);
            const centerX = landmark.x + landmark.width / 2;
            const centerY = landmark.y + landmark.height / 2;
            return (
              <g className="map-landmark" key={`${landmark.name}-${index}`}>
                <title>{landmark.name}</title>
                {landmark.polygon?.length
                  ? <polygon points={polygonCoordinates(landmark.polygon)} />
                  : <rect x={landmark.x} y={landmark.y} width={landmark.width} height={landmark.height} rx="2" />}
                <text className="map-label" x={centerX} y={centerY} fontSize={textSize}>{landmark.name}</text>
              </g>
            );
          })}
          <path className="map-path" d={walkwayPath} />
          {obstacles.map((obstacle, index) => (
            <rect className="map-obstacle" key={`${obstacle.code || 'obstacle'}-${index}`} x={obstacle.x} y={obstacle.y} width={obstacle.width} height={obstacle.height} />
          ))}
          {event.booths.map((booth) => {
            const labelSize = Math.min(booth.height * .49, booth.width * 1.5 / booth.code.length);
            const centerX = booth.x + booth.width / 2;
            const centerY = booth.y + booth.height / 2;
            let boothClass = 'map-booth';
            if (selectedBoothIds.has(booth.id)) boothClass += ' selected';
            if (completedBoothIds.has(booth.id)) boothClass += ' done';
            return (
              <g
                key={booth.id}
                className={boothClass}
                onClick={() => selectBooth(booth)}
              >
                <title>{booth.code} {booth.name}</title>
                {booth.polygon?.length
                  ? <polygon points={polygonCoordinates(booth.polygon)} />
                  : <rect x={booth.x} y={booth.y} width={booth.width} height={booth.height} />}
                <text className="map-label" x={centerX} y={centerY} fontSize={labelSize}>{booth.code}</text>
              </g>
            );
          })}
          {event.entrances.map(entrance => (
            <g key={entrance.id}>
              <circle className="entrance-marker" cx={entrance.point.x} cy={entrance.point.y} r={entranceRadius} />
              <text className="map-label" x={entrance.point.x} y={entrance.point.y - entranceRadius * 2} fontSize={entranceRadius * 1.55}>{entrance.name}</text>
            </g>
          ))}
          <path className="route-halo" d={routePath} />
          <path className="route-line" d={routePath} />
          <g pointerEvents="none">
            {(route?.stops || []).map((booth, index) => {
              const markerSize = Math.max(Math.min(booth.width, booth.height) * .31, shortestSide * .008);
              const markerClass = completedBoothIds.has(booth.id) ? 'route-marker done' : 'route-marker';
              return (
                <g key={booth.id}>
                  <circle className={markerClass} cx={booth.access.x} cy={booth.access.y} r={markerSize} />
                  <text className="map-label marker-number" x={booth.access.x} y={booth.access.y} fontSize={markerSize * 1.3}>{index + 1}</text>
                </g>
              );
            })}
            <circle className="route-marker" cx={startPoint.x} cy={startPoint.y} r={shortestSide * .011} />
            <circle cx={startPoint.x} cy={startPoint.y} r={shortestSide * .004} fill="white" />
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
