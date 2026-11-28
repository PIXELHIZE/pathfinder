import { useCallback, useEffect, useRef, useState } from 'react';

const ZOOM_STEP = 1.5;
const DRAG_THRESHOLD = 5;
const KEYBOARD_STEP = 64;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function midpoint(first, second) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function mapCenter(position, visibleSize, mapSize) {
  const halfSize = Math.min(visibleSize, mapSize) / 2;
  return clamp(position, halfSize, mapSize - halfSize);
}

export function MapViewport({ width, height, locate, onLocate, children }) {
  const controls = useRef(null);
  const [zoomLimit, setZoomLimit] = useState('fit');

  const attachMap = useCallback(svg => {
    const viewport = svg.parentElement;
    const pointers = new Map();
    let center = { x: width / 2, y: height / 2 };
    let zoom = 1;
    let fitScale = 1;
    let size = { x: 0, y: 0 };
    let dragStart;
    let dragged = false;

    function draw(nextCenter, nextZoom) {
      if (nextZoom !== undefined) setZoom(nextZoom);
      const scale = zoom * fitScale;
      const visibleWidth = size.x / scale;
      const visibleHeight = size.y / scale;
      const x = mapCenter(nextCenter.x, visibleWidth, width);
      const y = mapCenter(nextCenter.y, visibleHeight, height);
      const moved = center.x !== x || center.y !== y;
      center = { x, y };
      const left = x - visibleWidth / 2;
      const top = y - visibleHeight / 2;
      svg.setAttribute('viewBox', `${left} ${top} ${visibleWidth} ${visibleHeight}`);
      return moved;
    }

    function mapOffset(point) {
      const scale = zoom * fitScale;
      return { x: (point.x - size.x / 2) / scale, y: (point.y - size.y / 2) / scale };
    }

    function setZoom(value) {
      const maxZoom = Math.max(10, 6 / fitScale);
      zoom = clamp(value, 1, maxZoom);
      let limit = '';
      if (zoom === 1) limit = 'fit';
      else if (zoom === maxZoom) limit = 'max';
      const pinScale = Math.min(1 / (fitScale * zoom), Math.min(width, height) / 650);
      svg.style.setProperty('--pin-scale', pinScale);
      viewport.dataset.zoomed = String(limit !== 'fit');
      setZoomLimit(limit);
    }

    function resize() {
      if (!viewport.clientWidth || !viewport.clientHeight) return;
      size = { x: viewport.clientWidth, y: viewport.clientHeight };
      fitScale = Math.min(size.x / width, size.y / height);
      draw(center, zoom);
    }

    function changeView(from, to, nextZoom = zoom) {
      const before = mapOffset(from);
      if (nextZoom !== zoom) setZoom(nextZoom);
      const after = mapOffset(to);
      moveCenter(before.x - after.x, before.y - after.y);
    }

    const zoomBy = factor => draw(center, zoom * factor);
    const reset = () => draw(center, 1);

    function position(event) {
      const rect = viewport.getBoundingClientRect();
      return { x: event.clientX - rect.left - viewport.clientLeft, y: event.clientY - rect.top - viewport.clientTop };
    }

    function pointerDown(event) {
      if (event.button !== 0) return;
      const point = position(event);
      dragged = pointers.size > 0;
      if (!dragged) dragStart = point;
      pointers.set(event.pointerId, point);
      event.target.setPointerCapture(event.pointerId);
    }

    function pointerMove(event) {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const point = position(event);
      pointers.set(event.pointerId, point);
      if (pointers.size === 2) {
        const [first, second] = pointers.values();
        const otherPoint = first === point ? second : first;
        const previousSpan = distance(otherPoint, previous);
        if (previousSpan > 0) {
          const nextSpan = distance(otherPoint, point);
          changeView(midpoint(otherPoint, previous), midpoint(otherPoint, point), zoom * nextSpan / previousSpan);
        }
      } else if (pointers.size === 1) {
        if (!dragged && distance(dragStart, point) < DRAG_THRESHOLD) return;
        if (zoom > 1) changeView(dragged ? previous : dragStart, point);
        dragged = true;
      }
      if (zoom > 1) viewport.dataset.dragging = 'true';
    }

    function pointerEnd(event) {
      pointers.delete(event.pointerId);
      if (!pointers.size) delete viewport.dataset.dragging;
    }

    function suppressDragClick(event) {
      if (!dragged || event.detail === 0) return;
      event.preventDefault();
      event.stopPropagation();
    }

    const moveCenter = (x, y) => draw({ x: center.x + x, y: center.y + y });
    const panBy = (x, y) => moveCenter(x / (zoom * fitScale), y / (zoom * fitScale));

    function wheel(event) {
      let unit = 1;
      if (event.deltaMode === 1) unit = 16;
      if (event.deltaMode === 2) unit = size.y;
      if (event.ctrlKey || event.metaKey) {
        const point = position(event);
        const zoomChange = clamp(-event.deltaY * unit * .012, -2, 2);
        changeView(point, point, zoom * Math.exp(zoomChange));
        event.preventDefault();
      } else if (zoom > 1) {
        const x = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
        const y = event.shiftKey ? 0 : event.deltaY;
        if (panBy(x * unit, y * unit)) event.preventDefault();
      }
    }

    function keyDown(event) {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      switch (event.key) {
        case '+': case '=': zoomBy(ZOOM_STEP); break;
        case '-': zoomBy(1 / ZOOM_STEP); break;
        case 'Home': reset(); break;
        case 'ArrowLeft': if (!panBy(-KEYBOARD_STEP, 0)) return; break;
        case 'ArrowRight': if (!panBy(KEYBOARD_STEP, 0)) return; break;
        case 'ArrowUp': if (!panBy(0, -KEYBOARD_STEP)) return; break;
        case 'ArrowDown': if (!panBy(0, KEYBOARD_STEP)) return; break;
        default: return;
      }
      event.preventDefault();
    }

    function locateBooth(booth) {
      const left = Math.min(booth.x, booth.access.x);
      const right = Math.max(booth.x + booth.width, booth.access.x);
      const top = Math.min(booth.y, booth.access.y);
      const bottom = Math.max(booth.y + booth.height, booth.access.y);
      const detailZoom = 36 / (Math.min(booth.height, booth.width) * fitScale);
      const areaZoom = .8 * Math.min(size.x / (right - left), size.y / (bottom - top)) / fitScale;
      const focus = midpoint({ x: left, y: top }, { x: right, y: bottom });
      draw(focus, Math.min(Math.max(zoom, 2.25, detailZoom), areaZoom));
      viewport.scrollIntoView({ block: 'nearest' });
      viewport.focus({ preventScroll: true });
    }

    controls.current = { reset, zoomBy, locateBooth };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    viewport.addEventListener('pointerdown', pointerDown, options);
    viewport.addEventListener('pointermove', pointerMove, options);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      viewport.addEventListener(type, pointerEnd, options);
    }
    viewport.addEventListener('click', suppressDragClick, { ...options, capture: true });
    viewport.addEventListener('wheel', wheel, { ...options, passive: false });
    viewport.addEventListener('keydown', keyDown, options);
    return () => {
      controls.current = null;
      observer.disconnect();
      listeners.abort();
    };
  }, [width, height]);

  useEffect(() => {
    if (!locate) return;
    controls.current?.locateBooth(locate.booth);
    onLocate?.(locate.booth);
  }, [locate, onLocate]);

  return (
    <>
      <div className="section-heading">
        <h2 id="map-title">전시장 지도</h2>
        <div className="map-controls" role="group" aria-label="지도 크기">
          <button type="button" aria-label="지도 축소" disabled={zoomLimit === 'fit'} onClick={() => controls.current.zoomBy(1 / ZOOM_STEP)}>−</button>
          <button type="button" aria-label="지도 확대" disabled={zoomLimit === 'max'} onClick={() => controls.current.zoomBy(ZOOM_STEP)}>+</button>
          <button type="button" disabled={zoomLimit === 'fit'} onClick={() => controls.current.reset()}>전체 보기</button>
        </div>
      </div>
      <div className="map-viewport" tabIndex={0} role="region" style={{ aspectRatio: `${width} / ${height}` }}
        aria-label="전시장 지도. 확대하면 드래그하거나 방향키로 이동할 수 있습니다.">
        <svg className="map-svg" role="img" aria-labelledby="map-svg-title" aria-describedby="map-description" ref={attachMap}>
          {children}
        </svg>
      </div>
    </>
  );
}
