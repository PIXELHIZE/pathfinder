import { useState } from 'react';
import { MapViewport } from './MapViewport.jsx';
import { startingPlace } from './engine.js';

function pathData(points) {
  if (points.length < 2) return '';
  return `M ${points.map(point => `${point.x} ${point.y}`).join(' L ')}`;
}

function drawPlace({ key, shape, label, title = label, fontSize, radius, className, onClick }) {
  const { x, y, width, height, polygon } = shape;
  const points = polygon?.map(point => `${point.x},${point.y}`).join(' ');
  return (
    <g key={key} className={className} onClick={onClick}>
      <title>{title}</title>
      {points ? <polygon points={points} /> : <rect x={x} y={y} width={width} height={height} rx={radius} />}
      <text className="map-label" x={x + width / 2} y={y + height / 2} fontSize={fontSize}>{label}</text>
    </g>
  );
}

function MapPin({ point, marker, radius, label, labelClass = 'map-label', labelY, children }) {
  return (
    <g transform={`translate(${point.x} ${point.y})`} pointerEvents="none">
      <g className="map-pin">
        <circle className={marker} r={radius} />
        {label !== undefined && <text className={labelClass} y={labelY} fontSize="12">{label}</text>}
        {children}
      </g>
    </g>
  );
}

function mapStatus(booth, view, startId, selectedIds, isCalibrated) {
  if (!booth) {
    if (view !== 'tour') return '부스를 눌러 선택하세요.';
    return isCalibrated ? '' : '이동 거리는 도면상의 통로 길이로 계산했습니다.';
  }
  const name = `${booth.code} ${booth.name}`;
  if (view !== 'plan') return name;
  if (booth.id === startId) return `${name} · 출발점`;
  if (selectedIds.has(booth.id)) return `${name} · 선택됨`;
  return `${name} · 선택 안 됨`;
}

export function VenueMap({ id, event, plan, route, view, onToggleBooth, locate }) {
  const [inspectedBooth, setInspection] = useState(null);
  const { map, source, booths, entrances } = event;
  const { width, height, walkways } = map;
  const shortestSide = Math.min(width, height);
  const selectedBoothIds = new Set(plan.selected);
  const completedBoothIds = new Set(plan.completed);
  const startLocation = startingPlace(event, plan.start);
  const startPoint = startLocation.point ?? startLocation.access;
  const status = mapStatus(inspectedBooth, view, plan.start, selectedBoothIds, map.metresPerUnit > 0);
  const sourceLinks = [
    ['공식 배치도', source.map],
    ['부스 목록', source.booths !== source.map && source.booths],
    ['공식 선정', source.highlights],
    ['기획 구역', source.programs],
    ['관람 안내', source.visit],
  ];
  const activeCodes = new Set(booths.map(booth => booth.code));
  const obstacles = (map.obstacles || []).filter(obstacle => !activeCodes.has(obstacle.code));
  const floor = map.outline || { x: 0, y: 0, width, height };
  const routePath = (route?.segments || []).map(segment => pathData(segment.points)).join(' ');

  function selectBooth(booth) {
    setInspection(booth);
    if (view === 'plan' && booth.id !== plan.start) onToggleBooth(booth.id);
  }

  return (
    <section className="map-panel panel" id={id} aria-labelledby="map-title">
      <MapViewport width={width} height={height} locate={locate} onLocate={setInspection}>
        <title id="map-svg-title">{event.name} {event.hall} 배치도</title>
        <desc id="map-description">선택한 부스는 파란색, 방문 순서는 통로 위 숫자로 표시됩니다.</desc>
        <rect className="map-floor" x={floor.x} y={floor.y} width={floor.width} height={floor.height} />
        {(map.landmarks || []).map((landmark, index) => {
          const textSize = Math.min(shortestSide * .024, landmark.width * 1.2 / landmark.name.length, landmark.height * .54);
          return drawPlace({ key: `${landmark.name}-${index}`, className: 'map-landmark',
            shape: landmark, label: landmark.name, fontSize: textSize, radius: '2' });
        })}
        <path className="map-path" d={walkways.map(pathData).join(' ')} />
        {obstacles.map((obstacle, index) => (
          <rect className="map-obstacle" key={`${obstacle.code || 'obstacle'}-${index}`} x={obstacle.x} y={obstacle.y} width={obstacle.width} height={obstacle.height} />
        ))}
        {booths.map(booth => {
          const labelSize = Math.min(booth.height * .49, booth.width * 1.5 / booth.code.length);
          let boothClass = 'map-booth';
          if (selectedBoothIds.has(booth.id)) boothClass += ' selected';
          if (completedBoothIds.has(booth.id)) boothClass += ' done';
          return drawPlace({ key: booth.id, className: boothClass, shape: booth, label: booth.code,
            title: `${booth.code} ${booth.name}`, fontSize: labelSize, onClick: () => selectBooth(booth) });
        })}
        {entrances.map(entrance => (
          <MapPin key={entrance.id} point={entrance.point} marker="entrance-marker" radius="5"
            label={entrance.name} labelY="-16" />
        ))}
        <path className="route-halo" d={routePath} />
        <path className="route-line" d={routePath} />
        {(route?.stops || []).map((booth, index) => (
          <MapPin key={booth.id} point={booth.access} radius="11" label={index + 1} labelClass="map-label marker-number"
            marker={completedBoothIds.has(booth.id) ? 'route-marker done' : 'route-marker'} />
        ))}
        <MapPin point={startPoint} marker="route-marker" radius="7">
          <circle r="2.5" fill="white" />
        </MapPin>
      </MapViewport>
      <div className="map-caption">
        <span aria-live="polite">{status}</span>
        <span className="map-sources">
          {sourceLinks.map(([label, url]) => url ? <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label}</a> : null)}
        </span>
      </div>
    </section>
  );
}
