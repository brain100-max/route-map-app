import { useState, useRef, useEffect, useCallback } from "react";

const MARKER_RADIUS = 14;
const FONT_SIZE = 13;
const MIN_ZOOM = 0.3;
const FIT_ZOOM = 1;
const MAX_ZOOM = 5;
const TAP_MOVE_THRESHOLD = 10;
const MOUSE_DRAG_THRESHOLD = 5;
const MIN_SHAPE_RADIUS = 4;
const HANDLE_SCREEN_RADIUS = 5;

const COLORS = {
  hold:  { fill: "rgba(255,255,255,0.85)", stroke: "white",   text: "#111" },
  start: { fill: "rgba(34,139,34,0.88)",   stroke: "white",   text: "white" },
  top:   { fill: "rgba(30,90,200,0.88)",   stroke: "white",   text: "white" },
  clip:  { fill: "rgba(255,190,0,0.88)",   stroke: "white",   text: "#111" },
  duo:   { fill: "rgba(255,255,255,0.85)", stroke: "#f472b6", text: "#111" },
};

// 시작점 = 중심, 드래그 위치 = 가장자리 → 중심으로 다시 끌면 축소됨
function ellipseFromDrag(cx, cy, x1, y1, lockCircle = false) {
  let rx = Math.abs(x1 - cx);
  let ry = Math.abs(y1 - cy);
  if (lockCircle) {
    const r = Math.max(rx, ry);
    rx = r;
    ry = r;
  }
  return { cx, cy, rx, ry };
}

function pointInEllipse(px, py, shape, pad = 0) {
  const rx = shape.rx + pad;
  const ry = shape.ry + pad;
  if (rx <= 0 || ry <= 0) return false;
  const nx = (px - shape.cx) / rx;
  const ny = (py - shape.cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function getShapeHandles(shape) {
  const { cx, cy, rx, ry } = shape;
  return [
    { id: "n", x: cx, y: cy - ry },
    { id: "e", x: cx + rx, y: cy },
    { id: "s", x: cx, y: cy + ry },
    { id: "w", x: cx - rx, y: cy },
  ];
}

// markerSize=14(기본)일 때 테두리 두께 4px, 슬라이더에 비례
function ellipseStrokeWidth(markerSize = MARKER_RADIUS) {
  return (markerSize / MARKER_RADIUS) * 4;
}

function drawEllipseShape(ctx, shape, s, markerSize = MARKER_RADIUS) {
  if (!shape || shape.rx <= 0 || shape.ry <= 0) return;
  ctx.beginPath();
  ctx.ellipse(shape.cx * s, shape.cy * s, shape.rx * s, shape.ry * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = "transparent";
  ctx.fill();
  ctx.strokeStyle = "#111";
  ctx.lineWidth = ellipseStrokeWidth(markerSize);
  ctx.stroke();
}

function drawShapeHandles(ctx, shape, s) {
  getShapeHandles(shape).forEach(h => {
    ctx.beginPath();
    ctx.arc(h.x * s, h.y * s, HANDLE_SCREEN_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
}

function drawAll(ctx, markers, scale, markerSize = MARKER_RADIUS, dpr = 1, shapes = [], previewShape = null, showHandles = false, ellipseCenter = null) {
  // scale: CSS 표시 배율, dpr: devicePixelRatio
  // ctx.scale(dpr)가 이미 적용된 경우 dpr=1, 미적용 시 dpr를 scale에 곱함
  const s = scale * dpr;
  // 마커 슬라이더에 동그라미·숫자 모두 비례
  const sizeRatio = markerSize / MARKER_RADIUS;
  const r = markerSize * s;
  const fs = FONT_SIZE * sizeRatio * s;
  const lw = 2 * sizeRatio * s;

  // transform과 무관하게 전체 픽셀 버퍼를 클리어
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  // 원/타원 (마커와 분리, 번호 없음) — 테두리 두께는 markerSize에 비례
  shapes.forEach(shape => {
    drawEllipseShape(ctx, shape, s, markerSize);
    if (showHandles) drawShapeHandles(ctx, shape, s);
  });
  if (previewShape) drawEllipseShape(ctx, previewShape, s, markerSize);
  // 두 번 클릭 그리기: 중심점 표시
  if (ellipseCenter) {
    ctx.beginPath();
    ctx.arc(ellipseCenter.x * s, ellipseCenter.y * s, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  markers.forEach(m => {
    const x = m.x * s;
    const y = m.y * s;
    const c = COLORS[m.type] || COLORS.hold;

    ctx.font = `bold ${fs}px sans-serif`;

    if (m.type === "top" || m.type === "start") {
      const text = m.type === "top" ? "TOP" : "START";
      const tw = ctx.measureText(text).width;
      const pad = 7 * sizeRatio * s;
      const bw = tw + pad * 2, bh = fs + pad * 1.4;
      const rx2 = bw / 2, ry2 = bh / 2, rad = 8 * sizeRatio * s;
      ctx.beginPath();
      ctx.moveTo(x - rx2 + rad, y - ry2);
      ctx.arcTo(x + rx2, y - ry2, x + rx2, y + ry2, rad);
      ctx.arcTo(x + rx2, y + ry2, x - rx2, y + ry2, rad);
      ctx.arcTo(x - rx2, y + ry2, x - rx2, y - ry2, rad);
      ctx.arcTo(x - rx2, y - ry2, x + rx2, y - ry2, rad);
      ctx.closePath();
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.strokeStyle = c.stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.fillStyle = c.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y);
    } else {
      const label = String(m.label ?? m.number ?? "");
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.strokeStyle = m.type === "duo" ? "#f472b6" : c.stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
      ctx.fillStyle = c.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, y);
    }
  });
}

function getTouchDistance(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function getTouchMidpoint(t1, t2) {
  return {
    x: (t1.clientX + t2.clientX) / 2,
    y: (t1.clientY + t2.clientY) / 2,
  };
}

export default function App() {
  const [image, setImage] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [markers, setMarkers] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [previewShape, setPreviewShape] = useState(null);
  const [ellipseCenter, setEllipseCenter] = useState(null); // 두 번 클릭 그리기: 중심점
  const [nextHoldNumber, setNextHoldNumber] = useState(1);
  const [mode, setMode] = useState("hold");
  const [lockNumber, setLockNumber] = useState(false);
  const [history, setHistory] = useState([]);
  const [scale, setScale] = useState(1);
  const [markerSize, setMarkerSize] = useState(14);
  const [tab, setTab] = useState("place");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const containerRef = useRef(null);
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  // 최신 상태를 터치/마우스 핸들러에서 동기적으로 참조
  const transformRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const markersRef = useRef(markers);
  const shapesRef = useRef(shapes);
  const nextHoldNumberRef = useRef(nextHoldNumber);
  const modeRef = useRef(mode);
  const ellipseCenterRef = useRef(null);
  const pinchRef = useRef(null);
  const tapRef = useRef(null);
  const mouseDragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    transformRef.current = { zoom, pan };
  }, [zoom, pan]);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    nextHoldNumberRef.current = nextHoldNumber;
  }, [nextHoldNumber]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    ellipseCenterRef.current = ellipseCenter;
  }, [ellipseCenter]);

  // 원형 모드 이탈 시 미완성 그리기 취소
  useEffect(() => {
    if (mode !== "ellipse") {
      setEllipseCenter(null);
      setPreviewShape(null);
    }
  }, [mode]);

  // 중심 지정 후 커서 위치로 미리보기
  useEffect(() => {
    if (mode !== "ellipse" || !ellipseCenter) return;

    const updatePreview = (clientX, clientY, lockCircle) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = (clientX - rect.left) / rect.width * imgSize.w;
      const y = (clientY - rect.top) / rect.height * imgSize.h;
      setPreviewShape(ellipseFromDrag(ellipseCenter.x, ellipseCenter.y, x, y, lockCircle));
    };

    const onMouseMove = (e) => updatePreview(e.clientX, e.clientY, e.shiftKey);
    const onTouchMove = (e) => {
      if (e.touches.length === 1) {
        updatePreview(e.touches[0].clientX, e.touches[0].clientY, false);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [mode, ellipseCenter, imgSize]);

  // 원본 fit-to-screen 크기로 복귀
  const resetTransform = useCallback(() => {
    setZoom(FIT_ZOOM);
    setPan({ x: 0, y: 0 });
    transformRef.current = { zoom: FIT_ZOOM, pan: { x: 0, y: 0 } };
    pinchRef.current = null;
    tapRef.current = null;
    mouseDragRef.current = null;
    setPreviewShape(null);
    setIsDragging(false);
  }, []);

  const getNextNumberFromLabels = useCallback((markerList) => {
    let maxNumber = 0;
    for (const m of markerList) {
      if (["top", "clip", "start"].includes(m.type)) continue;
      const raw = String(m.label ?? m.number ?? "");
      const nums = raw.match(/\d+/g);
      if (!nums) continue;
      for (const n of nums) maxNumber = Math.max(maxNumber, Number(n));
    }
    return maxNumber + 1;
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const displayW = imgSize.w * scale;
    const displayH = imgSize.h * scale;

    // 1) 백킹 스토어를 devicePixelRatio 배율로 설정
    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);

    const ctx = canvas.getContext("2d");
    // 2) CSS 픽셀 좌표로 그리도록 dpr 스케일 적용
    ctx.scale(dpr, dpr);
    // 3) drawAll은 CSS scale로 그림 (ctx.scale이 dpr 반영)
    // 핸들은 원형 모드에서만 표시
    drawAll(ctx, markers, scale, markerSize, 1, shapes, previewShape, mode === "ellipse", ellipseCenter);
  }, [markers, shapes, previewShape, ellipseCenter, scale, image, markerSize, imgSize, mode]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImage(url);
      setMarkers([]);
      setShapes([]);
      setPreviewShape(null);
      setEllipseCenter(null);
      setHistory([]);
      setNextHoldNumber(1);
      resetTransform();
    };
    img.src = url;
  };

  const handleContainerResize = useCallback(() => {
    if (!containerRef.current || !imgSize.w) return;
    const maxW = containerRef.current.clientWidth;
    setScale(maxW / imgSize.w);
  }, [imgSize]);

  useEffect(() => {
    handleContainerResize();
    window.addEventListener("resize", handleContainerResize);
    return () => window.removeEventListener("resize", handleContainerResize);
  }, [handleContainerResize]);

  const makeSnapshot = useCallback(() => ({
    markers: markersRef.current.map(m => ({ ...m })),
    shapes: shapesRef.current.map(s => ({ ...s })),
    nextHoldNumber: nextHoldNumberRef.current,
  }), []);

  // getBoundingClientRect()는 CSS transform(핀치줌) 반영 → 확대 상태에서도 동일 공식으로 정확
  // allowOutside: 원 그리기 중 캔버스 밖으로 나가도 좌표 갱신(축소 가능하도록)
  const clientToImageCoords = useCallback((clientX, clientY, allowOutside = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (
      !allowOutside && (
        clientX < rect.left || clientX > rect.right ||
        clientY < rect.top || clientY > rect.bottom
      )
    ) return null;

    const x = (clientX - rect.left) / rect.width * imgSize.w;
    const y = (clientY - rect.top) / rect.height * imgSize.h;
    return { x, y };
  }, [imgSize]);

  // MARKER_RADIUS 안의 마커 히트 (나중에 그린 마커가 우선)
  const findMarkerAt = useCallback((clientX, clientY) => {
    const coords = clientToImageCoords(clientX, clientY);
    if (!coords) return null;
    const list = markersRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (Math.hypot(coords.x - m.x, coords.y - m.y) <= MARKER_RADIUS) return m;
    }
    return null;
  }, [clientToImageCoords]);

  // 원/타원 히트 (내부 또는 테두리 근처)
  const findShapeAt = useCallback((clientX, clientY) => {
    const coords = clientToImageCoords(clientX, clientY);
    if (!coords) return null;
    const pad = MARKER_RADIUS;
    const list = shapesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const shape = list[i];
      if (pointInEllipse(coords.x, coords.y, shape, pad)) return shape;
    }
    return null;
  }, [clientToImageCoords]);

  // 테두리 핸들 히트 (상·하·좌·우)
  const findHandleAt = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return null;
    // 화면 ~12px 반경을 이미지 좌표로 변환
    const hitR = (12 / rect.width) * imgSize.w;
    const coords = clientToImageCoords(clientX, clientY, true);
    if (!coords) return null;

    const list = shapesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const shape = list[i];
      for (const h of getShapeHandles(shape)) {
        if (Math.hypot(coords.x - h.x, coords.y - h.y) <= hitR) {
          return { shapeId: shape.id, handleId: h.id, origin: { cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry } };
        }
      }
    }
    return null;
  }, [clientToImageCoords, imgSize.w]);

  const moveMarkerTo = useCallback((markerId, clientX, clientY, offsetX = 0, offsetY = 0) => {
    const coords = clientToImageCoords(clientX, clientY);
    if (!coords) return;
    const x = coords.x + offsetX;
    const y = coords.y + offsetY;
    setMarkers(prev => prev.map(m =>
      m.id === markerId ? { ...m, x, y } : m
    ));
  }, [clientToImageCoords]);

  const moveShapeTo = useCallback((shapeId, clientX, clientY, offsetX = 0, offsetY = 0) => {
    const coords = clientToImageCoords(clientX, clientY);
    if (!coords) return;
    const cx = coords.x + offsetX;
    const cy = coords.y + offsetY;
    setShapes(prev => prev.map(s =>
      s.id === shapeId ? { ...s, cx, cy } : s
    ));
  }, [clientToImageCoords]);

  const resizeShapeByHandle = useCallback((shapeId, handleId, clientX, clientY, origin) => {
    const coords = clientToImageCoords(clientX, clientY, true);
    if (!coords) return;
    const { cx, cy } = origin;
    let rx = origin.rx;
    let ry = origin.ry;
    if (handleId === "e" || handleId === "w") {
      rx = Math.max(MIN_SHAPE_RADIUS, Math.abs(coords.x - cx));
    } else if (handleId === "n" || handleId === "s") {
      ry = Math.max(MIN_SHAPE_RADIUS, Math.abs(coords.y - cy));
    }
    setShapes(prev => prev.map(s =>
      s.id === shapeId ? { ...s, rx, ry } : s
    ));
  }, [clientToImageCoords]);

  // 빈 공간 탭: 1번째=중심, 2번째=가장자리(확정). Shift=정원
  const handleEllipseTap = useCallback((clientX, clientY, lockCircle = false) => {
    const coords = clientToImageCoords(clientX, clientY);
    if (!coords) return;

    const center = ellipseCenterRef.current;
    if (center) {
      const shape = ellipseFromDrag(center.x, center.y, coords.x, coords.y, lockCircle);
      if (shape.rx >= MIN_SHAPE_RADIUS && shape.ry >= MIN_SHAPE_RADIUS) {
        setHistory(prev => [...prev, makeSnapshot()]);
        setShapes(prev => [...prev, { id: Date.now(), ...shape }]);
      }
      setEllipseCenter(null);
      setPreviewShape(null);
      return;
    }

    // 첫 클릭은 빈 공간에서만 (원/핸들 위에서는 무시)
    if (findHandleAt(clientX, clientY) || findShapeAt(clientX, clientY)) return;
    setEllipseCenter({ x: coords.x, y: coords.y });
  }, [clientToImageCoords, makeSnapshot, findHandleAt, findShapeAt]);

  const placeMarkerAt = useCallback((clientX, clientY) => {
    if (!image || mode === "ellipse") return;
    const coords = clientToImageCoords(clientX, clientY);
    if (!coords) return;
    const { x, y } = coords;

    const snapshot = makeSnapshot();
    const currentMarkers = markersRef.current;
    const nHold = nextHoldNumberRef.current;

    if (mode === "duo") {
      const marker = { id: Date.now(), x, y, type: "duo", label: `${nHold}/${nHold+1}`, number: nHold };
      setHistory(prev => [...prev, snapshot]);
      setMarkers(prev => [...prev, marker]);
      setNextHoldNumber(prev => prev + 2);
      return;
    }

    let label, number;
    if (mode === "clip") {
      const cnt = currentMarkers.filter(m => m.type === "clip").length + 1;
      label = `C${cnt}`; number = cnt;
    } else if (mode === "top") {
      label = "TOP"; number = 0;
    } else if (mode === "start") {
      label = "START"; number = 0;
    } else {
      number = nHold;
      label = String(number);
    }

    const marker = { id: Date.now(), x, y, type: mode, label, number };
    setHistory(prev => [...prev, snapshot]);
    setMarkers(prev => [...prev, marker]);
    // 홀드 + 번호 고정 OFF일 때만 번호 자동 증가
    if (mode === "hold" && !lockNumber) setNextHoldNumber(n => n + 1);
  }, [image, clientToImageCoords, mode, lockNumber, makeSnapshot]);

  const beginPointerDrag = useCallback((clientX, clientY) => {
    const hitMarker = findMarkerAt(clientX, clientY);
    if (hitMarker) {
      const coords = clientToImageCoords(clientX, clientY);
      return {
        type: "marker",
        markerId: hitMarker.id,
        startX: clientX,
        startY: clientY,
        offsetX: coords ? hitMarker.x - coords.x : 0,
        offsetY: coords ? hitMarker.y - coords.y : 0,
        moved: false,
        snapshot: makeSnapshot(),
      };
    }

    // 원형 모드: 핸들=크기, 원 위=이동, 빈 공간=즉시 pan / 탭=두 번 클릭 그리기
    if (modeRef.current === "ellipse") {
      const hitHandle = findHandleAt(clientX, clientY);
      if (hitHandle) {
        return {
          type: "resize-shape",
          shapeId: hitHandle.shapeId,
          handleId: hitHandle.handleId,
          origin: hitHandle.origin,
          startX: clientX,
          startY: clientY,
          moved: false,
          snapshot: makeSnapshot(),
        };
      }

      // 중심 대기 중이 아닐 때만 원 본체를 이동 대상으로
      if (!ellipseCenterRef.current) {
        const hitShape = findShapeAt(clientX, clientY);
        if (hitShape) {
          const coords = clientToImageCoords(clientX, clientY);
          return {
            type: "shape",
            shapeId: hitShape.id,
            startX: clientX,
            startY: clientY,
            offsetX: coords ? hitShape.cx - coords.x : 0,
            offsetY: coords ? hitShape.cy - coords.y : 0,
            moved: false,
            snapshot: makeSnapshot(),
          };
        }
      }

      const { pan: p } = transformRef.current;
      return {
        type: "pan",
        startX: clientX,
        startY: clientY,
        startPan: { ...p },
        moved: false,
        ellipseTap: true, // 움직임 없으면 두 번 클릭 그리기
      };
    }

    const { pan: p } = transformRef.current;
    return {
      type: "pan",
      startX: clientX,
      startY: clientY,
      startPan: { ...p },
      moved: false,
    };
  }, [findMarkerAt, findShapeAt, findHandleAt, makeSnapshot, clientToImageCoords]);

  const handleMouseDown = (e) => {
    if (!image || e.button !== 0) return;
    e.preventDefault();
    mouseDragRef.current = beginPointerDrag(e.clientX, e.clientY);
  };

  // 커서 위치를 기준으로 사진 영역만 줌 (상단 메뉴는 영향 없음)
  const zoomAtPoint = useCallback((clientX, clientY, nextZoom) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const { zoom: z, pan: p } = transformRef.current;
    let newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));

    const viewportRect = viewport.getBoundingClientRect();
    const mx = clientX - viewportRect.left;
    const my = clientY - viewportRect.top;

    const contentX = (mx - p.x) / z;
    const contentY = (my - p.y) / z;
    const newPanX = mx - contentX * newZoom;
    const newPanY = my - contentY * newZoom;

    transformRef.current = { zoom: newZoom, pan: { x: newPanX, y: newPanY } };
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, []);

  // 뷰포트 밖으로 나가도 드래그가 끊기지 않도록 window에 연결
  useEffect(() => {
    const handleMouseMove = (e) => {
      const drag = mouseDragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;

      if (!drag.moved && Math.hypot(dx, dy) >= MOUSE_DRAG_THRESHOLD) {
        drag.moved = true;
        setIsDragging(true);
      }

      if (!drag.moved) return;

      if (drag.type === "marker") {
        moveMarkerTo(drag.markerId, e.clientX, e.clientY, drag.offsetX, drag.offsetY);
      } else if (drag.type === "resize-shape") {
        resizeShapeByHandle(drag.shapeId, drag.handleId, e.clientX, e.clientY, drag.origin);
      } else if (drag.type === "shape") {
        moveShapeTo(drag.shapeId, e.clientX, e.clientY, drag.offsetX, drag.offsetY);
      } else if (drag.type === "pan") {
        const newPan = {
          x: drag.startPan.x + dx,
          y: drag.startPan.y + dy,
        };
        transformRef.current = { ...transformRef.current, pan: newPan };
        setPan(newPan);
      }
    };

    const handleMouseUp = (e) => {
      const drag = mouseDragRef.current;
      if (!drag) return;
      mouseDragRef.current = null;
      setIsDragging(false);

      if (drag.type === "marker" || drag.type === "shape" || drag.type === "resize-shape") {
        if (drag.moved) {
          setHistory(prev => [...prev, drag.snapshot]);
        }
        return;
      }

      // 빈 공간: 움직임 없음 → 마커 배치 또는 원형 두 번 클릭, 드래그 → pan만
      if (!drag.moved) {
        if (drag.ellipseTap) {
          handleEllipseTap(e.clientX, e.clientY, e.shiftKey);
        } else {
          placeMarkerAt(e.clientX, e.clientY);
        }
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [placeMarkerAt, handleEllipseTap, moveMarkerTo, moveShapeTo, resizeShapeByHandle]);

  // 브라우저 페이지 줌(Ctrl+휠/트랙패드 핀치)이 메뉴까지 축소하지 않도록 차단
  useEffect(() => {
    const preventPageZoom = (e) => {
      if (e.ctrlKey) e.preventDefault();
    };
    document.addEventListener("wheel", preventPageZoom, { passive: false });
    return () => document.removeEventListener("wheel", preventPageZoom);
  }, []);

  // 마우스 휠/트랙패드 핀치 → 사진 영역만 줌 (상단 메뉴는 고정)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !image) return;

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const { zoom: z } = transformRef.current;
      // ctrlKey: 트랙패드 핀치 / Ctrl+휠
      const intensity = e.ctrlKey ? 0.01 : 0.0015;
      const factor = Math.exp(-e.deltaY * intensity);
      zoomAtPoint(e.clientX, e.clientY, z * factor);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [image, zoomAtPoint]);

  const beginPinch = (t1, t2) => {
    const { zoom: z, pan: p } = transformRef.current;
    pinchRef.current = {
      startDistance: getTouchDistance(t1, t2),
      startZoom: z,
      startPan: { ...p },
      startMid: getTouchMidpoint(t1, t2),
    };
    tapRef.current = null;
    mouseDragRef.current = null;
    setPreviewShape(null);
    setIsDragging(false);
  };

  const applyPinch = (t1, t2) => {
    const pinch = pinchRef.current;
    const viewport = viewportRef.current;
    if (!pinch || !viewport || pinch.startDistance <= 0) return;

    const distance = getTouchDistance(t1, t2);
    const mid = getTouchMidpoint(t1, t2);
    let newZoom = pinch.startZoom * (distance / pinch.startDistance);
    newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));

    const viewportRect = viewport.getBoundingClientRect();
    const startMx = pinch.startMid.x - viewportRect.left;
    const startMy = pinch.startMid.y - viewportRect.top;
    const mx = mid.x - viewportRect.left;
    const my = mid.y - viewportRect.top;

    // 핀치 시작 시점의 콘텐츠 좌표를 현재 중점 아래에 유지
    const contentX = (startMx - pinch.startPan.x) / pinch.startZoom;
    const contentY = (startMy - pinch.startPan.y) / pinch.startZoom;
    const newPanX = mx - contentX * newZoom;
    const newPanY = my - contentY * newZoom;

    transformRef.current = { zoom: newZoom, pan: { x: newPanX, y: newPanY } };
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleTouchStart = (e) => {
    if (!image) return;

    if (e.touches.length === 2) {
      e.preventDefault();
      beginPinch(e.touches[0], e.touches[1]);
      return;
    }

    if (e.touches.length === 1 && !pinchRef.current) {
      const t = e.touches[0];
      tapRef.current = beginPointerDrag(t.clientX, t.clientY);
    }
  };

  const handleTouchMove = (e) => {
    if (!image) return;

    if (e.touches.length === 2) {
      e.preventDefault();
      if (!pinchRef.current) beginPinch(e.touches[0], e.touches[1]);
      applyPinch(e.touches[0], e.touches[1]);
      return;
    }

    const drag = tapRef.current;
    if (e.touches.length === 1 && drag && !pinchRef.current) {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - drag.startX;
      const dy = t.clientY - drag.startY;

      if (!drag.moved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) {
        drag.moved = true;
        setIsDragging(true);
      }

      if (!drag.moved) return;

      if (drag.type === "marker") {
        moveMarkerTo(drag.markerId, t.clientX, t.clientY, drag.offsetX, drag.offsetY);
      } else if (drag.type === "resize-shape") {
        resizeShapeByHandle(drag.shapeId, drag.handleId, t.clientX, t.clientY, drag.origin);
      } else if (drag.type === "shape") {
        moveShapeTo(drag.shapeId, t.clientX, t.clientY, drag.offsetX, drag.offsetY);
      } else if (drag.type === "pan") {
        const newPan = {
          x: drag.startPan.x + dx,
          y: drag.startPan.y + dy,
        };
        transformRef.current = { ...transformRef.current, pan: newPan };
        setPan(newPan);
      }
    }
  };

  const handleTouchEnd = (e) => {
    if (!image) return;

    // 핀치 중 손가락이 하나 남으면 핀치 종료 (남은 손가락 탭으로 마커 찍지 않음)
    if (pinchRef.current) {
      e.preventDefault();
      if (e.touches.length < 2) {
        pinchRef.current = null;
        tapRef.current = null;
        setPreviewShape(null);
        setIsDragging(false);
      }
      return;
    }

    if (tapRef.current && e.changedTouches.length === 1 && e.touches.length === 0) {
      const drag = tapRef.current;
      tapRef.current = null;
      setIsDragging(false);
      e.preventDefault();

      if (drag.type === "marker" || drag.type === "shape" || drag.type === "resize-shape") {
        if (drag.moved) {
          setHistory(prev => [...prev, drag.snapshot]);
        }
        return;
      }

      // 빈 공간: 탭 → 마커/원형 두 번 클릭, 드래그 → pan만
      if (!drag.moved) {
        const t = e.changedTouches[0];
        if (drag.ellipseTap) {
          handleEllipseTap(t.clientX, t.clientY, false);
        } else {
          placeMarkerAt(t.clientX, t.clientY);
        }
      }
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const snapshot = history[history.length - 1];
    setMarkers(snapshot.markers);
    setShapes(snapshot.shapes ?? []);
    setNextHoldNumber(snapshot.nextHoldNumber);
    setPreviewShape(null);
    setHistory(h => h.slice(0, -1));
  };

  const handleDeleteMarker = (id) => {
    const snapshot = makeSnapshot();
    const nextMarkers = markers.filter(m => m.id !== id);
    setHistory(prev => [...prev, snapshot]);
    setMarkers(nextMarkers);
    setNextHoldNumber(getNextNumberFromLabels(nextMarkers));
  };

  const handleExportCSV = () => {
    const rows = [["number","x","y","type","label"]];
    markers.forEach(m => rows.push([m.label ?? m.number ?? "", Math.round(m.x), Math.round(m.y), m.type, m.label ?? ""]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "coordinates.csv"; a.click();
  };

  const handleExportPNG = () => {
    if (!imgRef.current) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = imgSize.w; offscreen.height = imgSize.h;
    const ctx = offscreen.getContext("2d");
    ctx.drawImage(imgRef.current, 0, 0);
    const mc = document.createElement("canvas");
    mc.width = imgSize.w; mc.height = imgSize.h;
    drawAll(mc.getContext("2d"), markers, 1, markerSize, 1, shapes);
    ctx.drawImage(mc, 0, 0);
    const a = document.createElement("a");
    a.href = offscreen.toDataURL("image/png"); a.download = "route_map.png"; a.click();
  };

  const nextNum = nextHoldNumber;
  const hasStart = markers.some(m => m.type === "start");
  const displayW = imgSize.w * scale;
  const displayH = imgSize.h * scale;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", background:"#0a0a0f", color:"white", fontFamily:"sans-serif", overflow:"hidden" }}>

      {/* 헤더 */}
      <div style={{ padding:"10px 14px", background:"#111", borderBottom:"1px solid #222", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, zIndex:200 }}>
        <div>
          <div style={{ fontSize:10, color:"#666", letterSpacing:2, textTransform:"uppercase" }}>Lead Route</div>
          <div style={{ fontSize:16, fontWeight:"bold" }}>Topo Maker</div>
        </div>
        <label style={{ background:"#333", border:"1px solid #444", borderRadius:8, padding:"6px 12px", fontSize:13, cursor:"pointer" }}>
          사진 열기
          <input type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageUpload} />
        </label>
      </div>

      {/* 탭 */}
      <div style={{ display:"flex", background:"#111", borderBottom:"1px solid #222", flexShrink:0, zIndex:200 }}>
        {["place","list"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex:1, padding:"8px 0", fontSize:13, fontWeight:tab===t?"bold":"normal", color:tab===t?"white":"#555", background:"none", border:"none", borderBottom:tab===t?"2px solid #3b82f6":"2px solid transparent", cursor:"pointer" }}>
            {t==="place" ? "📍 배치" : "📋 목록"}
          </button>
        ))}
      </div>

      {tab === "place" && (
        <div style={{ display:"flex", flexDirection:"column", flex:1, minHeight:0 }}>

          {/* 모드 버튼 */}
          <div style={{ display:"flex", gap:6, padding:"8px 10px", background:"#111", overflowX:"auto", flexShrink:0, zIndex:200, flexWrap:"nowrap" }}>
            {[
              { key:"hold",    label:"홀드",   activeColor:"white",   activeText:"#111" },
              { key:"start",   label:"START",  activeColor:"#22c55e", activeText:"white" },
              { key:"top",     label:"TOP",    activeColor:"#3b82f6", activeText:"white" },
              { key:"clip",    label:"클립",   activeColor:"#facc15", activeText:"#111" },
              { key:"duo",     label:"듀오",   activeColor:"#ec4899", activeText:"white" },
              { key:"ellipse", label:"○ 원형", activeColor:"#a3a3a3", activeText:"#111" },
            ].map(btn => (
              <button key={btn.key} onClick={() => setMode(btn.key)}
                style={{ flexShrink:0, padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:"bold", cursor:"pointer",
                  border: mode===btn.key ? "2px solid white" : "2px solid transparent",
                  background: mode===btn.key ? btn.activeColor : "#333",
                  color: mode===btn.key ? btn.activeText : "white",
                  opacity: mode===btn.key ? 1 : 0.55 }}>
                {btn.label}
              </button>
            ))}
            <button
              onClick={() => {
                if (lockNumber) {
                  // 고정 해제 시 현재 최대 번호 + 1로 맞춤
                  setNextHoldNumber(getNextNumberFromLabels(markersRef.current));
                }
                setLockNumber(v => !v);
              }}
              style={{
                flexShrink: 0,
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: "bold",
                cursor: "pointer",
                border: lockNumber ? "2px solid #fca5a5" : "2px solid transparent",
                background: lockNumber ? "#dc2626" : "#333",
                color: "white",
                opacity: lockNumber ? 1 : 0.55,
              }}
            >
              🔒 번호 고정
            </button>
          </div>

          {/* 홀드 모드: 마커 크기 / 원형 모드: 테두리 두께 */}
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 12px", background:"#111", borderBottom:"1px solid #1a1a1a", flexShrink:0, zIndex:200 }}>
            <span style={{ fontSize:11, color:"#666", whiteSpace:"nowrap" }}>
              {mode === "ellipse" ? "테두리 두께" : "마커 크기"}
            </span>
            <input type="range" min={8} max={24} value={markerSize} onChange={e => setMarkerSize(Number(e.target.value))} style={{ flex:1 }} />
            <span style={{ fontSize:11, color:"#888", width:28 }}>
              {mode === "ellipse" ? Math.round(ellipseStrokeWidth(markerSize)) : markerSize}
            </span>
          </div>

          {/* 안내 + 취소 버튼 */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 12px", background:"#0a0a0f", borderBottom:"1px solid #1a1a1a", flexShrink:0, zIndex:200 }}>
            <span style={{ fontSize:11, color:"#555" }}>
              {!image ? "사진을 먼저 열어주세요" :
               mode==="ellipse" ? (ellipseCenter ? "두 번째 클릭: 가장자리 지정 (Shift: 정원)" : "클릭: 중심 · 드래그: 이동/pan · 핸들: 크기") :
               mode==="duo" ? `듀오 마커 클릭: ${nextHoldNumber}/${nextHoldNumber+1}` :
               mode==="start" ? "START 홀드 클릭" :
               mode==="top" ? "TOP 홀드 클릭" :
               mode==="clip" ? `클립 C${markers.filter(m=>m.type==="clip").length+1} 위치 클릭` :
               `다음 홀드: #${nextNum}${lockNumber ? " (번호 고정)" : ""}${!hasStart ? " (START 먼저 찍으면 1번부터)" : ""}`}
            </span>
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              {Math.abs(zoom - FIT_ZOOM) > 0.001 && (
                <button onClick={resetTransform}
                  style={{ fontSize:11, padding:"3px 8px", borderRadius:6, border:"none", background:"#333", color:"#93c5fd", cursor:"pointer" }}>
                  줌 리셋
                </button>
              )}
              <button onClick={handleUndo} disabled={history.length===0}
                style={{ fontSize:12, padding:"3px 10px", borderRadius:6, border:"none",
                  background: history.length===0 ? "#1a1a1a" : "#333",
                  color: history.length===0 ? "#333" : "#facc15",
                  cursor: history.length===0 ? "default" : "pointer" }}>
                ↩ 취소
              </button>
            </div>
          </div>

          {/* 사진 영역 — 핀치줌은 여기만 적용, 상단 UI는 고정 */}
          <div
            ref={(node) => {
              viewportRef.current = node;
              containerRef.current = node;
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            onMouseDown={handleMouseDown}
            style={{
              flex: 1,
              minHeight: 0,
              position: "relative",
              background: "#0a0a0f",
              cursor: isDragging ? "grabbing" : "crosshair",
              overflow: "hidden",
              touchAction: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
          >
            {!image ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", color:"#333" }}>
                <div style={{ fontSize:32 }}>🧗</div>
                <div style={{ fontSize:13, marginTop:6 }}>루트 사진을 열면 여기에 표시됩니다</div>
              </div>
            ) : (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: displayW,
                  height: displayH,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "0 0",
                  willChange: "transform",
                }}
              >
                <img ref={imgRef} src={image} alt="route"
                  draggable={false}
                  style={{ width: displayW, height: displayH, display:"block", pointerEvents:"none" }} />
                <canvas ref={canvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: displayW,
                    height: displayH,
                    touchAction: "none",
                  }}
                />
              </div>
            )}
          </div>

          {/* 하단 저장 버튼 */}
          {image && (
            <div style={{ display:"flex", gap:8, padding:"10px 12px", background:"#111", borderTop:"1px solid #222", flexShrink:0, zIndex:200 }}>
              <button onClick={handleExportPNG}
                style={{ flex:2, background:"#3b82f6", color:"white", border:"none", borderRadius:10, padding:"10px 0", fontSize:14, fontWeight:"bold", cursor:"pointer" }}>
                PNG 저장
              </button>
              <button onClick={handleExportCSV}
                style={{ flex:1, background:"#333", color:"white", border:"none", borderRadius:10, padding:"10px 0", fontSize:13, cursor:"pointer" }}>
                CSV
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "list" && (
        <div style={{ flex:1, overflowY:"auto", padding:"10px 12px", minHeight:0 }}>
          {markers.length === 0 ? (
            <div style={{ textAlign:"center", color:"#555", fontSize:13, marginTop:40 }}>아직 마커가 없습니다</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {[...markers].reverse().map(m => (
                <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8, background:"#1a1a1a", borderRadius:8, padding:"8px 10px" }}>
                  <span style={{ fontSize:11, fontWeight:"bold", padding:"2px 8px", borderRadius:20, flexShrink:0,
                    background: m.type==="top" ? "#3b82f6" : m.type==="start" ? "#22c55e" : m.type==="clip" ? "#facc15" : m.type==="duo" ? "#ec4899" : "white",
                    color: (m.type==="clip"||m.type==="hold") ? "#111" : "white" }}>
                    {m.label}
                  </span>
                  <select value={m.type}
                    onChange={e => setMarkers(prev => prev.map(x => x.id===m.id ? {...x, type:e.target.value} : x))}
                    style={{ background:"#333", color:"white", border:"1px solid #444", borderRadius:6, fontSize:11, padding:"2px 4px" }}>
                    {["hold","start","top","clip","duo"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input value={m.label}
                    onChange={e => setMarkers(prev => prev.map(x => x.id===m.id ? {...x, label:e.target.value} : x))}
                    style={{ background:"#333", color:"white", border:"1px solid #444", borderRadius:6, fontSize:11, padding:"2px 6px", width:50 }} />
                  <span style={{ fontSize:11, color:"#aaa", flex:1 }}>({Math.round(m.x)}, {Math.round(m.y)})</span>
                  <button onClick={() => handleDeleteMarker(m.id)}
                    style={{ background:"none", border:"none", color:"#666", fontSize:14, cursor:"pointer", padding:"0 4px", flexShrink:0 }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
