import { useState, useRef, useEffect, useCallback } from "react";

const MARKER_RADIUS = 14;
const FONT_SIZE = 39; 
const MIN_ZOOM = 0.3;
const FIT_ZOOM = 1;
const MAX_ZOOM = 5;
const TAP_MOVE_THRESHOLD = 10;
const MOUSE_DRAG_THRESHOLD = 5;
const MIN_SHAPE_RADIUS = 4;
const HANDLE_SCREEN_RADIUS = 5;
const LABEL_MIN_FONT_SIZE = 16;
const LABEL_MAX_FONT_SIZE = 56;
const DEFAULT_LABEL_FONT_SIZE = 28;
const LABEL_PADDING_X = 15;
const LABEL_PADDING_Y = 9;
const LABEL_LINE_HEIGHT = 1.25;
const LABEL_BORDER_RADIUS = 14;
const MARKER_MODES = ["hold", "start", "top", "clip", "duo"];
const MARKER_PICKER_ORDER = ["hold", "duo", "top", "start", "clip"];
const SHAPE_MODES = ["safex", "arrow", "ellipse"];
const SHAPE_PICKER_ORDER = ["safex", "arrow", "ellipse"];
const MARKER_MODE_META = {
  hold: { label: "홀드", icon: "⚪", color: "#ffffff", text: "#111111" },
  start: { label: "START", icon: "🟢", color: "#22c55e", text: "#ffffff" },
  top: { label: "TOP", icon: "🔵", color: "#3b82f6", text: "#ffffff" },
  clip: { label: "클립", icon: "🟡", color: "#facc15", text: "#111111" },
  duo: { label: "듀오", icon: "🩷", color: "#ec4899", text: "#ffffff" },
};
const SHAPE_MODE_META = {
  safex: { label: "안전홀드", icon: "✖", color: "#2563eb", text: "#ffffff" },
  arrow: { label: "선", icon: "➖", color: "#ff4500", text: "#ffffff" },
  ellipse: { label: "원형", icon: "⭕", color: "#a3a3a3", text: "#111111" },
};

const COLORS = {
  hold:  { text: "#000000", stroke: "#ff0000" }, 
  start: { text: "#22c55e", stroke: "#22c55e" }, 
  top:   { text: "#3b82f6", stroke: "#3b82f6" }, 
  clip:  { text: "#facc15", stroke: "#000000" }, 
  duo:   { text: "#000000", stroke: "#ffffff" }, 
};

const TEXT_STYLE_META = {
  black: { label: "검정 글씨", fill: "#000000", stroke: "#ffffff" },
  white: { label: "흰 글씨", fill: "#ffffff", stroke: "#000000" },
};

function getMarkerTextStyle(marker) {
  return marker?.textStyle === "white" ? "white" : "black";
}

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

const escapeCSV = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function ellipseFromDrag(cx, cy, x1, y1, lockCircle = false) {
  let rx = Math.abs(x1 - cx); let ry = Math.abs(y1 - cy);
  if (lockCircle) { const r = Math.max(rx, ry); rx = r; ry = r; }
  return { cx, cy, rx, ry };
}

function safeXFromDrag(cx, cy, x1, y1) {
  return { cx, cy, size: Math.max(Math.abs(x1 - cx), Math.abs(y1 - cy)) };
}

function safeXToEllipseLike(shape) {
  const fallbackSize = Math.max(Number(shape?.rx) || 0, Number(shape?.ry) || 0);
  const size = Math.max(MIN_SHAPE_RADIUS, Number(shape?.size) || fallbackSize || MIN_SHAPE_RADIUS);
  return { cx: shape.cx, cy: shape.cy, rx: size, ry: size };
}

function pointInEllipse(px, py, shape, pad = 0) {
  const rx = shape.rx + pad; const ry = shape.ry + pad;
  if (rx <= 0 || ry <= 0) return false;
  const nx = (px - shape.cx) / rx; const ny = (py - shape.cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function getShapeHandles(shape) {
  const { cx, cy, rx, ry } = shape;
  return [
    { id: "n", x: cx, y: cy - ry }, { id: "e", x: cx + rx, y: cy },
    { id: "s", x: cx, y: cy + ry }, { id: "w", x: cx - rx, y: cy },
  ];
}

function drawEllipseShape(ctx, shape, s, strokeWidth = 1.5) {
  if (!shape || shape.rx <= 0 || shape.ry <= 0) return;
  ctx.beginPath(); ctx.ellipse(shape.cx * s, shape.cy * s, shape.rx * s, shape.ry * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = "transparent"; ctx.fill(); ctx.strokeStyle = "#111"; ctx.lineWidth = strokeWidth; ctx.stroke();
}

function drawArrowShape(ctx, arrow, s, strokeWidth = 2) {
  if (!arrow) return;
  const x1 = arrow.x1 * s; const y1 = arrow.y1 * s; const x2 = arrow.x2 * s; const y2 = arrow.y2 * s;
  const snap = (v) => Math.round(v) + 0.5;
  const sx1 = snap(x1); const sy1 = snap(y1); const sx2 = snap(x2); const sy2 = snap(y2);

  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";

  const innerWidth = Math.max(1, strokeWidth * s);

  ctx.beginPath();
  ctx.moveTo(sx1, sy1);
  ctx.lineTo(sx2, sy2);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = innerWidth;
  ctx.stroke();
}

function drawSafeXShape(ctx, shape, s) {
  if (!shape) return;
  const fallbackSize = Math.max(Number(shape.rx) || 0, Number(shape.ry) || 0);
  const half = Math.max(MIN_SHAPE_RADIUS, Number(shape.size) || fallbackSize || 0);
  if (half <= 0) return;
  const dynamicStroke = Math.max(3, half * s * 0.14);
  const left = (shape.cx - half) * s;
  const right = (shape.cx + half) * s;
  const top = (shape.cy - half) * s;
  const bottom = (shape.cy + half) * s;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const outer = Math.max(1.5, dynamicStroke + 2);
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, bottom);
  ctx.moveTo(right, top);
  ctx.lineTo(left, bottom);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = outer * s;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, bottom);
  ctx.moveTo(right, top);
  ctx.lineTo(left, bottom);
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = dynamicStroke;
  ctx.stroke();
}

function drawShapeHandles(ctx, shape, s) {
  getShapeHandles(shape).forEach(h => {
    ctx.beginPath(); ctx.arc(h.x * s, h.y * s, HANDLE_SCREEN_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.stroke();
  });
}

function getLabelLines(text) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  return normalized.split("\n");
}

function getLabelMeasureCtx() {
  if (!getLabelMeasureCtx.cached) {
    const canvas = document.createElement("canvas");
    getLabelMeasureCtx.cached = canvas.getContext("2d");
  }
  return getLabelMeasureCtx.cached;
}

function measureLabel(label, fontScale = 1, customCtx = null) {
  const measureCtx = customCtx || getLabelMeasureCtx();
  const baseFontSize = Math.max(LABEL_MIN_FONT_SIZE, Number(label.fontSize) || DEFAULT_LABEL_FONT_SIZE);
  const fontSize = baseFontSize * fontScale;
  const lines = getLabelLines(label.text);
  measureCtx.font = `600 ${fontSize}px sans-serif`;
  const maxTextWidth = lines.reduce((max, line) => Math.max(max, measureCtx.measureText(line || " ").width), 0);
  const lineHeight = fontSize * LABEL_LINE_HEIGHT;
  const textBlockHeight = lineHeight * Math.max(1, lines.length);
  const width = maxTextWidth + LABEL_PADDING_X * 2 * fontScale;
  const height = textBlockHeight + LABEL_PADDING_Y * 2 * fontScale;
  return { fontSize, lines, lineHeight, textBlockHeight, width, height };
}

function drawLabelCard(ctx, label, scaleFactor, selected, customCtx = null) {
  const metrics = measureLabel(label, scaleFactor, customCtx);
  const x = label.x * scaleFactor;
  const y = label.y * scaleFactor;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = Math.max(3, 8 * scaleFactor);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(x, y, metrics.width, metrics.height, LABEL_BORDER_RADIUS * scaleFactor);
  ctx.fill();
  ctx.shadowColor = "transparent";

  if (selected) {
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = Math.max(1.5, 2 * scaleFactor);
    ctx.stroke();
  }

  ctx.fillStyle = "#111111";
  ctx.font = `600 ${metrics.fontSize}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const centerX = x + metrics.width / 2;
  const firstLineY = y + metrics.height / 2 - (metrics.textBlockHeight / 2) + (metrics.lineHeight / 2);
  metrics.lines.forEach((line, idx) => {
    ctx.fillText(
      line || " ",
      centerX,
      firstLineY + idx * metrics.lineHeight
    );
  });
  ctx.restore();
}

function drawAll(ctx, markers, scale, markerSize = MARKER_RADIUS, dpr = 1, shapes = [], previewShape = null, selectedShapeId = null, ellipseCenter = null, ellipseStrokeWidth = 1.5, arrows = [], previewArrow = null, arrowCenter = null, arrowStrokeWidth = 1.5, safeXShapes = [], previewSafeXShape = null, selectedSafeXShapeId = null, safeXCenter = null, applyMinFontSize = false, labels = [], selectedLabelId = null, labelMeasureCtx = null) {
  const s = scale * dpr; const sizeRatio = markerSize / MARKER_RADIUS;
  const rawFs = FONT_SIZE * sizeRatio * s;
  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const isMobile = applyMinFontSize && (window.innerWidth < 900 || isTouchDevice);
  const minFs = isMobile ? markerSize * 0.7 : markerSize * 1.2;
  const fs = applyMinFontSize ? Math.max(minFs, rawFs) : rawFs;
  const markerStrokeWidth = (duo) => {
    const base = (duo ? 4 : 3) * sizeRatio * s;
    if (!applyMinFontSize) return base;
    return isMobile ? base * 0.6 : base;
  };
  const startTopBase = 2 * sizeRatio * s;
  const startTopStrokeWidth = !applyMinFontSize ? startTopBase : (isMobile ? Math.max(1, startTopBase * 0.6) : startTopBase);

  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();

  markers.forEach(m => {
    const x = m.x * s; const y = m.y * s; const c = COLORS[m.type] || COLORS.hold;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";

    if (m.type === "top" || m.type === "start") {
      const text = m.type === "top" ? "TOP" : "START"; 
      
      // 1. TOP은 기존 크기(0.9배), START는 원 안에 들어가도록 더 작게(0.6배) 폰트 크기 분기
      const fontScale = m.type === "top" ? 0.9 : 0.6;
      ctx.font = `bold ${fs * fontScale}px sans-serif`; 
      
      // 2. 두 마커의 원 반지름(크기)을 fs * 1.0으로 완벽히 통일
      const circleRadius = fs * 1.0; 

      ctx.beginPath(); 
      ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#3b82f6"; // 파랑 채움
      ctx.fill(); 
      
      ctx.strokeStyle = "#ffffff"; // 흰색 테두리
      ctx.lineWidth = startTopStrokeWidth; 
      ctx.stroke();

      // 3. 흰색 글씨로 그리기 (까만색을 원하시면 "#000000"으로 변경)
      ctx.fillStyle = "#ffffff"; 
      ctx.fillText(text, x, y);
    }
    else {
      const label = String(m.label ?? m.number ?? "");
      ctx.font = `bold ${fs}px sans-serif`;

      const textStyle = getMarkerTextStyle(m);
      if (m.type === "hold" || m.type === "duo") {
        ctx.strokeStyle = TEXT_STYLE_META[textStyle].stroke;
      } else {
        ctx.strokeStyle = m.type === "hold" ? "#ffffff" : m.type === "duo" ? "#ffffff" : "#000000";
      }
      ctx.lineWidth = markerStrokeWidth(m.type === "duo");

      ctx.strokeText(label, x, y);
      ctx.fillStyle = (m.type === "hold" || m.type === "duo") ? TEXT_STYLE_META[textStyle].fill : c.text;
      ctx.fillText(label, x, y);
    }
  });

  shapes.forEach(shape => { drawEllipseShape(ctx, shape, s, ellipseStrokeWidth); if (shape.id === selectedShapeId) drawShapeHandles(ctx, shape, s); });
  if (previewShape) drawEllipseShape(ctx, previewShape, s, ellipseStrokeWidth);
  if (ellipseCenter) {
    const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const centerRadius = isMobile ? 2.5 : 4;
    const centerStroke = isMobile ? 1 : 1.5;
    ctx.beginPath(); ctx.arc(ellipseCenter.x * s, ellipseCenter.y * s, centerRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#111"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = centerStroke; ctx.stroke();
  }

  arrows.forEach(arrow => { drawArrowShape(ctx, arrow, s, arrowStrokeWidth); });
  if (previewArrow) drawArrowShape(ctx, previewArrow, s, arrowStrokeWidth);
  if (arrowCenter) {
    const startRadius = 2;
    const startBorderWidth = 1;
    ctx.beginPath(); ctx.arc(arrowCenter.x * s, arrowCenter.y * s, startRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4500"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = startBorderWidth; ctx.stroke();
  }

  safeXShapes.forEach(shape => {
    drawSafeXShape(ctx, shape, s);
  });
  if (previewSafeXShape) drawSafeXShape(ctx, previewSafeXShape, s);
  if (safeXCenter) {
    const isMobile = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const centerRadius = isMobile ? 2.5 : 4;
    const centerStroke = isMobile ? 1 : 1.5;
    ctx.beginPath(); ctx.arc(safeXCenter.x * s, safeXCenter.y * s, centerRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#2563eb"; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = centerStroke; ctx.stroke();
  }

  labels.forEach(label => {
    drawLabelCard(ctx, label, s, label.id === selectedLabelId, labelMeasureCtx);
  });
}

function getTouchDistance(t1, t2) { const dx = t1.clientX - t2.clientX; const dy = t1.clientY - t2.clientY; return Math.hypot(dx, dy); }
function getTouchMidpoint(t1, t2) { return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }; }

const showLockNumberFeature = false; // 🔒 번호 고정: 당분간 미사용, 로직은 유지하고 UI만 숨김

export default function App() {
  const [image, setImage] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [markers, setMarkers] = useState([]);
  const [shapes, setShapes] = useState([]);
  const [arrows, setArrows] = useState([]);
  const [safeXShapes, setSafeXShapes] = useState([]);
  const [labels, setLabels] = useState([]);
  const [previewShape, setPreviewShape] = useState(null);
  const [previewArrow, setPreviewArrow] = useState(null);
  const [previewSafeXShape, setPreviewSafeXShape] = useState(null);
  const [ellipseCenter, setEllipseCenter] = useState(null);
  const [arrowCenter, setArrowCenter] = useState(null);
  const [safeXCenter, setSafeXCenter] = useState(null);
  const [selectedShapeOrArrow, setSelectedShapeOrArrow] = useState(null);
  const [selectedLabelId, setSelectedLabelId] = useState(null);
  const [nextHoldNumber, setNextHoldNumber] = useState(1);
  const [mode, setMode] = useState("hold");
  const [markerMode, setMarkerMode] = useState("hold");
  const [lockNumber, setLockNumber] = useState(false);
  const [history, setHistory] = useState([]);
  const [scale, setScale] = useState(1);
  const [markerSize, setMarkerSize] = useState(14);
  const [labelFontSize, setLabelFontSize] = useState(DEFAULT_LABEL_FONT_SIZE);
  const [ellipseStrokeWidth, setEllipseStrokeWidth] = useState(1.5);
  const [arrowStrokeWidth, setArrowStrokeWidth] = useState(1.5);
  const [safeXSize, setSafeXSize] = useState(30);
  const [tab, setTab] = useState("place");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [showMarkerSheet, setShowMarkerSheet] = useState(false);
  const [showShapeSheet, setShowShapeSheet] = useState(false);
  const [labelEditor, setLabelEditor] = useState({ open: false, id: null, x: 0, y: 0, text: "" });
  const [currentTextStyle, setCurrentTextStyle] = useState("black");
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [markerPopup, setMarkerPopup] = useState({ open: false, markerId: null, x: 0, y: 0 });

  const containerRef = useRef(null); const viewportRef = useRef(null); const canvasRef = useRef(null); const imgRef = useRef(null);
  const transformRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const markersRef = useRef(markers); const shapesRef = useRef(shapes); const arrowsRef = useRef(arrows); const safeXShapesRef = useRef(safeXShapes); const labelsRef = useRef(labels);
  const nextHoldNumberRef = useRef(nextHoldNumber); const modeRef = useRef(mode);
  const ellipseCenterRef = useRef(null); const arrowCenterRef = useRef(null); const safeXCenterRef = useRef(null);
  const pinchRef = useRef(null); const tapRef = useRef(null); const mouseDragRef = useRef(null);
  const labelLongPressRef = useRef(null);
  const markerLongPressRef = useRef(null);
  const labelFontSliderDragRef = useRef(false);
  const safeXSizeSliderDragRef = useRef(false);
  const markerPopupRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  // 배치 화면(캔버스)이 언마운트되는 탭으로 전환될 때, 완료되지 않은 드래그/탭 제스처가
  // ref에 남아 이후 엉뚱한 이벤트에서 소비되지 않도록 정리한다.
  useEffect(() => {
    if (tab !== "place") {
      mouseDragRef.current = null;
      tapRef.current = null;
      setMarkerPopup({ open: false, markerId: null, x: 0, y: 0 });
    }
  }, [tab]);

  useEffect(() => {
    if (tab !== "place" || !image) setShowExportSheet(false);
  }, [tab, image]);

  useEffect(() => { transformRef.current = { zoom, pan }; }, [zoom, pan]);
  useEffect(() => { markersRef.current = markers; }, [markers]);
  useEffect(() => {
    if (!selectedMarkerId) return;
    if (!markers.some(marker => marker.id === selectedMarkerId)) {
      setSelectedMarkerId(null);
    }
  }, [markers, selectedMarkerId]);
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { arrowsRef.current = arrows; }, [arrows]);
  useEffect(() => { safeXShapesRef.current = safeXShapes; }, [safeXShapes]);
  useEffect(() => { labelsRef.current = labels; }, [labels]);
  useEffect(() => { nextHoldNumberRef.current = nextHoldNumber; }, [nextHoldNumber]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { ellipseCenterRef.current = ellipseCenter; }, [ellipseCenter]);
  useEffect(() => { arrowCenterRef.current = arrowCenter; }, [arrowCenter]);
  useEffect(() => { safeXCenterRef.current = safeXCenter; }, [safeXCenter]);
  useEffect(() => {
    if (!selectedLabelId) return;
    const selected = labels.find(label => label.id === selectedLabelId);
    if (!selected) return;
    const selectedSize = Math.max(LABEL_MIN_FONT_SIZE, Number(selected.fontSize) || DEFAULT_LABEL_FONT_SIZE);
    if (selectedSize !== labelFontSize) setLabelFontSize(selectedSize);
  }, [selectedLabelId, labels, labelFontSize]);
  useEffect(() => {
    if (selectedShapeOrArrow?.type !== "safex") {
      safeXSizeSliderDragRef.current = false;
      return;
    }
    const selected = safeXShapes.find(shape => shape.id === selectedShapeOrArrow.id);
    if (!selected) return;
    const nextSize = Math.max(MIN_SHAPE_RADIUS, Number(selected.size) || Math.max(Number(selected.rx) || 0, Number(selected.ry) || 0) || safeXSize);
    if (nextSize !== safeXSize) setSafeXSize(nextSize);
  }, [selectedShapeOrArrow, safeXShapes, safeXSize]);
  useEffect(() => {
    if (mode !== "label" || !selectedLabelId) labelFontSliderDragRef.current = false;
  }, [mode, selectedLabelId]);

  useEffect(() => {
    if (mode !== "ellipse") { setEllipseCenter(null); setPreviewShape(null); }
    if (mode !== "arrow") { setArrowCenter(null); setPreviewArrow(null); }
    if (mode !== "safex") { setSafeXCenter(null); setPreviewSafeXShape(null); }
    if (MARKER_MODES.includes(mode)) setMarkerMode(mode);
    setSelectedShapeOrArrow(null);
    setSelectedMarkerId(null);
    setShowMarkerSheet(false);
    setShowShapeSheet(false);
    setMarkerPopup({ open: false, markerId: null, x: 0, y: 0 });
  }, [mode]);

  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image);
    };
  }, [image]);

  useEffect(() => {
    if (mode !== "ellipse" || !ellipseCenter) return;
    const updatePreview = (clientX, clientY, lockCircle) => {
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect(); if (rect.width <= 0) return;
      setPreviewShape(ellipseFromDrag(ellipseCenter.x, ellipseCenter.y, (clientX - rect.left) / rect.width * imgSize.w, (clientY - rect.top) / rect.height * imgSize.h, lockCircle));
    };
    const onMouseMove = (e) => updatePreview(e.clientX, e.clientY, e.shiftKey);
    window.addEventListener("mousemove", onMouseMove); return () => window.removeEventListener("mousemove", onMouseMove);
  }, [mode, ellipseCenter, imgSize]);

  useEffect(() => {
    if (!markerPopup.open || !markerPopupRef.current) return;
    const popupRect = markerPopupRef.current.getBoundingClientRect();
    const margin = 8;
    const maxX = window.innerWidth - popupRect.width - margin;
    const maxY = window.innerHeight - popupRect.height - margin;
    const nextX = Math.min(Math.max(markerPopup.x, margin), Math.max(margin, maxX));
    const nextY = Math.min(Math.max(markerPopup.y, margin), Math.max(margin, maxY));
    if (nextX !== markerPopup.x || nextY !== markerPopup.y) {
      setMarkerPopup(prev => ({ ...prev, x: nextX, y: nextY }));
    }
  }, [markerPopup.open, markerPopup.x, markerPopup.y]);

  useEffect(() => {
    if (mode !== "arrow" || !arrowCenter) return;
    const updatePreview = (clientX, clientY) => {
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect(); if (rect.width <= 0) return;
      setPreviewArrow({ x1: arrowCenter.x, y1: arrowCenter.y, x2: (clientX - rect.left) / rect.width * imgSize.w, y2: (clientY - rect.top) / rect.height * imgSize.h });
    };
    const onMouseMove = (e) => updatePreview(e.clientX, e.clientY);
    window.addEventListener("mousemove", onMouseMove); return () => window.removeEventListener("mousemove", onMouseMove);
  }, [mode, arrowCenter, imgSize]);

  useEffect(() => {
    if (mode !== "safex" || !safeXCenter) return;
    const updatePreview = (clientX, clientY) => {
      const canvas = canvasRef.current; if (!canvas) return;
      const rect = canvas.getBoundingClientRect(); if (rect.width <= 0) return;
      setPreviewSafeXShape(safeXFromDrag(safeXCenter.x, safeXCenter.y, (clientX - rect.left) / rect.width * imgSize.w, (clientY - rect.top) / rect.height * imgSize.h));
    };
    const onMouseMove = (e) => updatePreview(e.clientX, e.clientY);
    window.addEventListener("mousemove", onMouseMove); return () => window.removeEventListener("mousemove", onMouseMove);
  }, [mode, safeXCenter, imgSize]);

  const resetTransform = useCallback(() => {
    setZoom(FIT_ZOOM); setPan({ x: 0, y: 0 }); transformRef.current = { zoom: FIT_ZOOM, pan: { x: 0, y: 0 } };
    pinchRef.current = null; tapRef.current = null; mouseDragRef.current = null; setPreviewShape(null); setPreviewArrow(null); setPreviewSafeXShape(null); setIsDragging(false);
  }, []);

  const reindexMarkers = useCallback((currentList) => {
    let holdCount = 1; let clipCount = 1;
    const updated = currentList.map(m => {
      if (m.type === "hold") { const num = holdCount; holdCount += 1; return { ...m, number: num, label: String(num) }; }
      else if (m.type === "duo") { const num = holdCount; holdCount += 2; return { ...m, number: num, label: `${num}/${num + 1}` }; }
      else if (m.type === "clip") { const num = clipCount; clipCount += 1; return { ...m, number: num, label: `C${num}` }; }
      return m;
    });
    return { updatedList: updated, nextHold: holdCount };
  }, []);

  const getNextHoldFromList = useCallback((list) => {
    let max = 0;
    list.forEach(m => {
      if (m.type === "hold") max = Math.max(max, Number(m.number) || 0);
      if (m.type === "duo") max = Math.max(max, (Number(m.number) || 0) + 1);
    });
    return max + 1;
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current; const dpr = window.devicePixelRatio || 1;
    const displayW = imgSize.w * scale; const displayH = imgSize.h * scale;
    canvas.width = Math.round(displayW * dpr); canvas.height = Math.round(displayH * dpr);
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    drawAll(
      ctx,
      markers,
      scale,
      markerSize,
      1,
      shapes,
      previewShape,
      selectedShapeOrArrow?.type === "shape" ? selectedShapeOrArrow.id : null,
      ellipseCenter,
      ellipseStrokeWidth,
      arrows,
      previewArrow,
      arrowCenter,
      arrowStrokeWidth,
      safeXShapes,
      previewSafeXShape,
      selectedShapeOrArrow?.type === "safex" ? selectedShapeOrArrow.id : null,
      safeXCenter,
      true,
      labels,
      selectedLabelId
    );
  }, [markers, shapes, previewShape, ellipseCenter, scale, image, markerSize, ellipseStrokeWidth, arrowStrokeWidth, imgSize, mode, arrows, previewArrow, arrowCenter, safeXShapes, previewSafeXShape, safeXCenter, selectedShapeOrArrow, tab, labels, selectedLabelId]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight }); setImage(url); setMarkers([]); setShapes([]); setArrows([]); setSafeXShapes([]); setLabels([]); setPreviewShape(null); setPreviewArrow(null); setPreviewSafeXShape(null); setEllipseCenter(null); setArrowCenter(null); setSafeXCenter(null); setSelectedLabelId(null); setSelectedMarkerId(null); setHistory([]); setNextHoldNumber(1); resetTransform();
    };
    img.src = url;
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file || !image) {
      if (!image) alert("⚠️ 먼저 루트 사진을 업로드한 후에 CSV 데이터를 불러와주세요!");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/);
        if (lines.length <= 1) return;

        const importedMarkers = [];
        const importedShapes = [];
        const importedArrows = [];

        for (let i = 1; i < lines.length; i++) {
          let line = lines[i].trim();
          if (!line) continue;

          if (line.startsWith('"') && line.endsWith('"')) {
            line = line.substring(1, line.length - 1);
          }

          const cells = line.split(/","|,/).map(c => c.replace(/^"|"$/g, "").trim());
          if (cells.length < 4) continue; 

          const dataType = cells[3];

          if (dataType === "ellipse_shape") {
            const cx = parseFloat(cells[0]); const cy = parseFloat(cells[1]); const rx = parseFloat(cells[2]); const ry = parseFloat(cells[4]);
            if ([cx, cy, rx, ry].some(Number.isNaN)) continue;
            importedShapes.push({ id: generateUUID(), cx, cy, rx, ry });
          } 
          else if (dataType === "arrow_shape") {
            const x1 = parseFloat(cells[0]); const y1 = parseFloat(cells[1]); const x2 = parseFloat(cells[2]); const y2 = parseFloat(cells[4]);
            if ([x1, y1, x2, y2].some(Number.isNaN)) continue;
            importedArrows.push({ id: generateUUID(), x1, y1, x2, y2 });
          } 
          else {
            const number = parseInt(cells[0]) || 0; const x = parseFloat(cells[1]); const y = parseFloat(cells[2]); const label = cells[4] || "";
            if (!isNaN(x) && !isNaN(y)) {
              const marker = { id: generateUUID(), x, y, type: dataType, label, number };
              if (dataType === "hold" || dataType === "duo") marker.textStyle = "black";
              importedMarkers.push(marker);
            }
          }
        }

        setHistory(prev => [...prev, makeSnapshot()]);
        
        if (lockNumber) {
          setMarkers(importedMarkers); setShapes(importedShapes); setArrows(importedArrows); setSafeXShapes([]);
          setNextHoldNumber(getNextHoldFromList(importedMarkers));
          alert(`🎉 복원 성공!\n- 마커: ${importedMarkers.length}개\n- 원형 도형: ${importedShapes.length}개\n- 화살표: ${importedArrows.length}개`);
        } else {
          const { updatedList, nextHold } = reindexMarkers(importedMarkers);
          setMarkers(updatedList); setShapes(importedShapes); setArrows(importedArrows); setSafeXShapes([]); setNextHoldNumber(nextHold);
          alert(`🎉 복원 성공!\n- 마커: ${updatedList.length}개\n- 원형 도형: ${importedShapes.length}개\n- 화살표: ${importedArrows.length}개`);
        }

      } catch (err) {
        alert("❌ CSV 파일을 읽는 도중 오류가 발생했습니다.");
      }
    };
    reader.readAsText(file); e.target.value = "";
  };

  const handleContainerResize = useCallback(() => {
    if (!containerRef.current || imgSize.w <= 1) return;
    const width = containerRef.current.clientWidth; if (width <= 0) return; 
    setScale(width / imgSize.w);
  }, [imgSize.w]);

  useEffect(() => {
    handleContainerResize(); window.addEventListener("resize", handleContainerResize);
    return () => window.removeEventListener("resize", handleContainerResize);
  }, [handleContainerResize]);

  const makeSnapshot = useCallback(() => ({
    markers: markersRef.current.map(m => ({ ...m })),
    shapes: shapesRef.current.map(s => ({ ...s })),
    arrows: arrowsRef.current.map(a => ({ ...a })),
    safeXShapes: safeXShapesRef.current.map(x => ({ ...x })),
    labels: labelsRef.current.map(l => ({ ...l })),
    nextHoldNumber: nextHoldNumberRef.current,
  }), []);

  const clientToImageCoords = useCallback((clientX, clientY, allowOutside = false) => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!allowOutside && (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom)) return null;
    return { x: (clientX - rect.left) / rect.width * imgSize.w, y: (clientY - rect.top) / rect.height * imgSize.h };
  }, [imgSize]);

  const findMarkerAt = useCallback((clientX, clientY) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return null;
    const list = markersRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]; if (Math.hypot(coords.x - m.x, coords.y - m.y) <= MARKER_RADIUS * 2.5) return m; 
    }
    return null;
  }, [clientToImageCoords]);

  const findShapeAt = useCallback((clientX, clientY) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return null;
    const list = shapesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const shape = list[i]; if (pointInEllipse(coords.x, coords.y, shape, MARKER_RADIUS)) return shape;
    }
    return null;
  }, [clientToImageCoords]);

  const findSafeXShapeAt = useCallback((clientX, clientY) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return null;
    const list = safeXShapesRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const shape = list[i]; if (pointInEllipse(coords.x, coords.y, safeXToEllipseLike(shape), MARKER_RADIUS)) return shape;
    }
    return null;
  }, [clientToImageCoords]);

  const findArrowAt = useCallback((clientX, clientY) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return null;
    const list = arrowsRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const a = list[i]; const l2 = Math.pow(a.x1 - a.x2, 2) + Math.pow(a.y1 - a.y2, 2); if (l2 === 0) continue;
      let t = ((coords.x - a.x1) * (a.x2 - a.x1) + (coords.y - a.y1) * (a.y2 - a.y1)) / l2; t = Math.max(0, Math.min(1, t));
      if (Math.hypot(coords.x - (a.x1 + t * (a.x2 - a.x1)), coords.y - (a.y1 + t * (a.y2 - a.y1))) <= 20) return a;
    }
    return null;
  }, [clientToImageCoords]);

  const findLabelAt = useCallback((clientX, clientY) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return null;
    const list = labelsRef.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const label = list[i];
      const metrics = measureLabel(label);
      if (
        coords.x >= label.x &&
        coords.x <= label.x + metrics.width &&
        coords.y >= label.y &&
        coords.y <= label.y + metrics.height
      ) {
        return label;
      }
    }
    return null;
  }, [clientToImageCoords]);

  const findHandleAt = useCallback((clientX, clientY) => {
    if (selectedShapeOrArrow?.type !== "shape") return null;
    const canvas = canvasRef.current; if (!canvas) return null;
    const rect = canvas.getBoundingClientRect(); if (rect.width <= 0) return null;
    const hitR = (16 / rect.width) * imgSize.w; const coords = clientToImageCoords(clientX, clientY, true); if (!coords) return null;
    const shape = shapesRef.current.find(s => s.id === selectedShapeOrArrow.id); if (!shape) return null;
    for (const h of getShapeHandles(shape)) { if (Math.hypot(coords.x - h.x, coords.y - h.y) <= hitR) return { shapeId: shape.id, shapeType: selectedShapeOrArrow.type, handleId: h.id, origin: { cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry } }; }
    return null;
  }, [clientToImageCoords, imgSize.w, selectedShapeOrArrow]);

  const moveMarkerTo = useCallback((markerId, clientX, clientY, offsetX = 0, offsetY = 0) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return;
    setMarkers(prev => prev.map(m => m.id === markerId ? { ...m, x: coords.x + offsetX, y: coords.y + offsetY } : m));
  }, [clientToImageCoords]);

  const moveShapeTo = useCallback((shapeId, clientX, clientY, offsetX = 0, offsetY = 0) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return;
    setShapes(prev => prev.map(s => s.id === shapeId ? { ...s, cx: coords.x + offsetX, cy: coords.y + offsetY } : s));
  }, [clientToImageCoords]);

  const moveSafeXShapeTo = useCallback((shapeId, clientX, clientY, offsetX = 0, offsetY = 0) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return;
    setSafeXShapes(prev => prev.map(s => s.id === shapeId ? { ...s, cx: coords.x + offsetX, cy: coords.y + offsetY } : s));
  }, [clientToImageCoords]);

  const moveArrowTo = useCallback((arrowId, clientX, clientY, offsetX1 = 0, offsetY1 = 0, offsetX2 = 0, offsetY2 = 0) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return;
    setArrows(prev => prev.map(a => a.id === arrowId ? { ...a, x1: coords.x + offsetX1, y1: coords.y + offsetY1, x2: coords.x + offsetX2, y2: coords.y + offsetY2 } : a));
  }, [clientToImageCoords]);

  const moveLabelTo = useCallback((labelId, clientX, clientY, offsetX = 0, offsetY = 0) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return;
    setLabels(prev => prev.map(l => l.id === labelId ? { ...l, x: coords.x + offsetX, y: coords.y + offsetY } : l));
  }, [clientToImageCoords]);

  const openLabelEditorForNew = useCallback((x, y) => {
    setLabelEditor({ open: true, id: null, x, y, text: "" });
  }, []);

  const openLabelEditorForExisting = useCallback((label) => {
    if (!label) return;
    setSelectedLabelId(label.id);
    setLabelEditor({ open: true, id: label.id, x: label.x, y: label.y, text: label.text ?? "" });
  }, []);

  const saveLabelEditor = useCallback(() => {
    const trimmed = String(labelEditor.text ?? "").trim();
    setLabelEditor(prev => ({ ...prev, open: false }));
    if (!trimmed) return;
    const snapshot = makeSnapshot();
    setHistory(prev => [...prev, snapshot]);
    if (labelEditor.id) {
      setLabels(prev => prev.map(label => label.id === labelEditor.id ? { ...label, text: labelEditor.text } : label));
      setSelectedLabelId(labelEditor.id);
      return;
    }
    const newLabelId = generateUUID();
    setLabels(prev => [...prev, {
      id: newLabelId,
      x: labelEditor.x,
      y: labelEditor.y,
      text: labelEditor.text,
      fontSize: labelFontSize,
    }]);
    setSelectedLabelId(newLabelId);
  }, [labelEditor, makeSnapshot, labelFontSize]);

  const handleLabelFontSizeChange = useCallback((value) => {
    const nextSize = Number(value);
    setLabelFontSize(nextSize);
    if (!selectedLabelId) return;
    if (!labelFontSliderDragRef.current) {
      setHistory(prev => [...prev, makeSnapshot()]);
      labelFontSliderDragRef.current = true;
    }
    setLabels(prev => prev.map(label => label.id === selectedLabelId ? { ...label, fontSize: nextSize } : label));
  }, [selectedLabelId, makeSnapshot]);

  const handleLabelFontSizeCommit = useCallback(() => {
    labelFontSliderDragRef.current = false;
  }, []);

  const handleSafeXSizeChange = useCallback((value) => {
    const nextSize = Number(value);
    setSafeXSize(nextSize);
    if (selectedShapeOrArrow?.type !== "safex") return;
    if (!safeXSizeSliderDragRef.current) {
      setHistory(prev => [...prev, makeSnapshot()]);
      safeXSizeSliderDragRef.current = true;
    }
    setSafeXShapes(prev => prev.map(shape => shape.id === selectedShapeOrArrow.id ? { ...shape, size: nextSize } : shape));
  }, [selectedShapeOrArrow, makeSnapshot]);

  const handleSafeXSizeCommit = useCallback(() => {
    safeXSizeSliderDragRef.current = false;
  }, []);

  const resizeShapeByHandle = useCallback((shapeId, shapeType, handleId, clientX, clientY, origin) => {
    const coords = clientToImageCoords(clientX, clientY, true); if (!coords) return;
    const { cx, cy } = origin; let rx = origin.rx; let ry = origin.ry;
    if (handleId === "e" || handleId === "w") rx = Math.max(MIN_SHAPE_RADIUS, Math.abs(coords.x - cx));
    else if (handleId === "n" || handleId === "s") ry = Math.max(MIN_SHAPE_RADIUS, Math.abs(coords.y - cy));
    if (shapeType === "safex") {
      const sizeByX = Math.max(MIN_SHAPE_RADIUS, Math.abs(coords.x - cx));
      const sizeByY = Math.max(MIN_SHAPE_RADIUS, Math.abs(coords.y - cy));
      const size = handleId === "n" || handleId === "s" ? sizeByY : sizeByX;
      setSafeXShapes(prev => prev.map(s => s.id === shapeId ? { ...s, size } : s));
      setSafeXSize(size);
      return;
    }
    setShapes(prev => prev.map(s => s.id === shapeId ? { ...s, rx, ry } : s));
  }, [clientToImageCoords]);

  const handleEllipseTap = useCallback((clientX, clientY, lockCircle = false) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return;
    setSelectedMarkerId(null);
    const center = ellipseCenterRef.current;
    if (center) {
      const shape = ellipseFromDrag(center.x, center.y, coords.x, coords.y, lockCircle);
      if (shape.rx >= MIN_SHAPE_RADIUS && shape.ry >= MIN_SHAPE_RADIUS) {
        setHistory(prev => [...prev, makeSnapshot()]); setShapes(prev => [...prev, { id: generateUUID(), ...shape }]);
      }
      setEllipseCenter(null); setPreviewShape(null); return;
    }
    const clickedShape = findShapeAt(clientX, clientY); if (clickedShape) { setSelectedShapeOrArrow({ type: "shape", id: clickedShape.id }); setSelectedLabelId(null); return; }
    if (findHandleAt(clientX, clientY)) return; setEllipseCenter({ x: coords.x, y: coords.y });
  }, [clientToImageCoords, makeSnapshot, findHandleAt, findShapeAt]);

  const handleArrowTap = useCallback((clientX, clientY) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return;
    setSelectedMarkerId(null);
    const center = arrowCenterRef.current;
    if (center) {
      if (Math.hypot(coords.x - center.x, coords.y - center.y) > 5) {
        setHistory(prev => [...prev, makeSnapshot()]); setArrows(prev => [...prev, { id: generateUUID(), x1: center.x, y1: center.y, x2: coords.x, y2: coords.y }]);
      }
      setArrowCenter(null); setPreviewArrow(null); return;
    }
    const clickedArrow = findArrowAt(clientX, clientY); if (clickedArrow) { setSelectedShapeOrArrow({ type: "arrow", id: clickedArrow.id }); setSelectedLabelId(null); return; }
    setArrowCenter({ x: coords.x, y: coords.y });
  }, [clientToImageCoords, makeSnapshot, findArrowAt]);

  const handleSafeXTap = useCallback((clientX, clientY) => {
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return;
    setSelectedMarkerId(null);
    const clickedShape = findSafeXShapeAt(clientX, clientY); if (clickedShape) { setSelectedShapeOrArrow({ type: "safex", id: clickedShape.id }); setSelectedLabelId(null); return; }
    const snapshot = makeSnapshot();
    const nextId = generateUUID();
    const size = Math.max(MIN_SHAPE_RADIUS, Number(safeXSize) || MIN_SHAPE_RADIUS);
    setHistory(prev => [...prev, snapshot]);
    setSafeXShapes(prev => [...prev, { id: nextId, cx: coords.x, cy: coords.y, size }]);
    setSelectedShapeOrArrow({ type: "safex", id: nextId });
    setSelectedLabelId(null);
  }, [clientToImageCoords, makeSnapshot, findSafeXShapeAt, safeXSize]);

  const handleLabelTap = useCallback((clientX, clientY) => {
    setSelectedMarkerId(null);
    const clickedLabel = findLabelAt(clientX, clientY);
    if (clickedLabel) {
      setSelectedLabelId(clickedLabel.id);
      setSelectedShapeOrArrow(null);
      return;
    }
    const coords = clientToImageCoords(clientX, clientY);
    if (!coords) return;
    setSelectedLabelId(null);
    setSelectedShapeOrArrow(null);
    openLabelEditorForNew(coords.x, coords.y);
  }, [findLabelAt, clientToImageCoords, openLabelEditorForNew]);

  const placeMarkerAt = useCallback((clientX, clientY) => {
    if (!image || mode === "ellipse" || mode === "arrow" || mode === "safex" || mode === "label") return;
    const coords = clientToImageCoords(clientX, clientY); if (!coords) return;
    setSelectedLabelId(null);
    setSelectedShapeOrArrow(null);
    setSelectedMarkerId(null);
    const { x, y } = coords; const snapshot = makeSnapshot();
    const nHold = nextHoldNumberRef.current;

    let marker;
    if (mode === "duo") marker = { id: generateUUID(), x, y, type: "duo", label: `${nHold}/${nHold+1}`, number: nHold, textStyle: currentTextStyle };
    else if (mode === "clip") marker = { id: generateUUID(), x, y, type: "clip", label: "C", number: 0 };
    else if (mode === "top") marker = { id: generateUUID(), x, y, type: "top", label: "TOP", number: 0 };
    else if (mode === "start") marker = { id: generateUUID(), x, y, type: "start", label: "START", number: 0 };
    else marker = { id: generateUUID(), x, y, type: "hold", label: String(nHold), number: nHold, textStyle: currentTextStyle };

    setHistory(prev => [...prev, snapshot]);
    setMarkers(prev => {
      const newList = [...prev, marker];
      if (lockNumber) {
        if (mode === "duo") setNextHoldNumber(nHold + 2);
        else if (mode === "hold") setNextHoldNumber(nHold + 1);
        return newList;
      }
      const { updatedList, nextHold } = reindexMarkers(newList);
      setNextHoldNumber(nextHold);
      return updatedList;
    });
  }, [image, clientToImageCoords, mode, lockNumber, makeSnapshot, reindexMarkers, currentTextStyle]);

  const insertMarkerAt = useCallback((targetIndex) => {
    if (!image) return; 
    const snapshot = makeSnapshot();
    const currentList = [...markersRef.current];

    // 1. 삽입될 위치의 앞쪽 마커와 뒤쪽 마커를 가져옵니다.
    const prevMarker = currentList[targetIndex - 1];
    const nextMarker = currentList[targetIndex];

    // 2. 두 마커의 중간 좌표를 계산합니다. (앞뒤 마커가 모두 존재할 때)
    let newX = imgSize.w / 2;
    let newY = imgSize.h / 2;

    if (prevMarker && nextMarker) {
      newX = (prevMarker.x + nextMarker.x) / 2;
      newY = (prevMarker.y + nextMarker.y) / 2;
    } else if (prevMarker) { // 혹시 앞쪽 마커만 존재할 경우 근처에 배치
      newX = prevMarker.x + 20;
      newY = prevMarker.y + 20;
    } else if (nextMarker) { // 혹시 뒤쪽 마커만 존재할 경우 근처에 배치
      newX = nextMarker.x - 20;
      newY = nextMarker.y - 20;
    }

    // 3. 계산된 중간 좌표(newX, newY)로 새 홀드를 생성합니다.
    const nHold = nextHoldNumberRef.current;
    const newMarker = { id: generateUUID(), x: newX, y: newY, type: "hold", label: String(nHold), number: nHold, textStyle: currentTextStyle };
    
    setHistory(prev => [...prev, snapshot]);
    setMarkers(prev => {
      const listToUpdate = [...prev]; 
      listToUpdate.splice(targetIndex, 0, newMarker);
      if (lockNumber) {
        setNextHoldNumber(nHold + 1);
        return listToUpdate;
      }
      const { updatedList, nextHold } = reindexMarkers(listToUpdate);
      setNextHoldNumber(nextHold);
      return updatedList;
    });
    setTab("place");
  }, [image, imgSize, makeSnapshot, reindexMarkers, lockNumber, currentTextStyle]);

  const handleDeleteMarker = (id) => {
    const snapshot = makeSnapshot(); const nextMarkers = markersRef.current.filter(m => m.id !== id);
    setHistory(prev => [...prev, snapshot]);
    if (selectedMarkerId === id) setSelectedMarkerId(null);
    if (markerPopup.markerId === id) closeMarkerPopup();
    if (lockNumber) {
      setMarkers(nextMarkers);
    } else {
      const { updatedList, nextHold = 1 } = reindexMarkers(nextMarkers);
      setMarkers(updatedList); setNextHoldNumber(updatedList.length === 0 ? 1 : nextHold);
    }
  };

  const handleMarkerTypeChange = (id, newType) => {
    const snap = makeSnapshot();
    const next = markers.map(x => {
      if (x.id !== id) return x;
      if ((newType === "hold" || newType === "duo") && x.type !== "hold" && x.type !== "duo") {
        return { ...x, type: newType, textStyle: "black" };
      }
      return { ...x, type: newType };
    });
    setHistory(prev => [...prev, snap]);
    if (lockNumber) {
      setMarkers(next);
    } else {
      const { updatedList, nextHold } = reindexMarkers(next);
      setMarkers(updatedList);
      setNextHoldNumber(nextHold);
    }
  };

  const closeMarkerPopup = useCallback(() => {
    if (markerLongPressRef.current) {
      clearTimeout(markerLongPressRef.current);
      markerLongPressRef.current = null;
    }
    setMarkerPopup({ open: false, markerId: null, x: 0, y: 0 });
  }, []);

  const openMarkerPopupAt = useCallback((markerId, clientX, clientY) => {
    const margin = 8;
    const estimatedWidth = 220;
    const estimatedHeight = 260;
    const x = Math.min(Math.max(clientX - estimatedWidth / 2, margin), Math.max(margin, window.innerWidth - estimatedWidth - margin));
    const y = Math.min(Math.max(clientY - estimatedHeight - 14, margin), Math.max(margin, window.innerHeight - estimatedHeight - margin));
    setMarkerPopup({ open: true, markerId, x, y });
  }, []);

  const handleMarkerTextStyleChange = useCallback((markerId, nextStyle) => {
    if (!markerId) return;
    const target = markersRef.current.find(marker => marker.id === markerId);
    if (!target || (target.type !== "hold" && target.type !== "duo")) return;
    if (getMarkerTextStyle(target) === nextStyle) return;
    const snapshot = makeSnapshot();
    setHistory(prev => [...prev, snapshot]);
    setMarkers(prev => prev.map(marker => marker.id === markerId ? { ...marker, textStyle: nextStyle } : marker));
  }, [makeSnapshot]);

  const insertMarkerAfterId = useCallback((markerId) => {
    const idx = markersRef.current.findIndex(marker => marker.id === markerId);
    if (idx < 0) return;
    insertMarkerAt(idx + 1);
  }, [insertMarkerAt]);

  const insertMarkerBeforeId = useCallback((markerId) => {
    const idx = markersRef.current.findIndex(marker => marker.id === markerId);
    if (idx < 0) return;
    insertMarkerAt(idx);
  }, [insertMarkerAt]);

  const handleDeleteSelectedShapeOrArrow = () => {
    if (!selectedShapeOrArrow && !selectedLabelId) return;
    const snapshot = makeSnapshot();
    setHistory(prev => [...prev, snapshot]);
    if (selectedLabelId) {
      setLabels(prev => prev.filter(label => label.id !== selectedLabelId));
      setSelectedLabelId(null);
      return;
    }
    if (selectedShapeOrArrow.type === "shape") setShapes(prev => prev.filter(s => s.id !== selectedShapeOrArrow.id));
    else if (selectedShapeOrArrow.type === "arrow") setArrows(prev => prev.filter(a => a.id !== selectedShapeOrArrow.id));
    else if (selectedShapeOrArrow.type === "safex") setSafeXShapes(prev => prev.filter(s => s.id !== selectedShapeOrArrow.id));
    setSelectedShapeOrArrow(null);
  };

  const beginPointerDrag = useCallback((clientX, clientY) => {
    const hitLabel = findLabelAt(clientX, clientY);
    if (hitLabel) {
      const coords = clientToImageCoords(clientX, clientY);
      return {
        type: "label",
        labelId: hitLabel.id,
        startX: clientX,
        startY: clientY,
        offsetX: coords ? hitLabel.x - coords.x : 0,
        offsetY: coords ? hitLabel.y - coords.y : 0,
        moved: false,
        snapshot: makeSnapshot(),
      };
    }
    const hitMarker = findMarkerAt(clientX, clientY);
    if (hitMarker) {
      const coords = clientToImageCoords(clientX, clientY);
      return { type: "marker", markerId: hitMarker.id, startX: clientX, startY: clientY, offsetX: coords ? hitMarker.x - coords.x : 0, offsetY: coords ? hitMarker.y - coords.y : 0, moved: false, snapshot: makeSnapshot() };
    }
    if (modeRef.current === "ellipse") {
      const hitHandle = findHandleAt(clientX, clientY); if (hitHandle) return { type: "resize-shape", shapeId: hitHandle.shapeId, shapeType: hitHandle.shapeType, handleId: hitHandle.handleId, origin: hitHandle.origin, startX: clientX, startY: clientY, moved: false, snapshot: makeSnapshot() };
      if (!ellipseCenterRef.current) {
        const hitShape = findShapeAt(clientX, clientY); if (hitShape) { const coords = clientToImageCoords(clientX, clientY); return { type: "shape", shapeId: hitShape.id, startX: clientX, startY: clientY, offsetX: coords ? hitShape.cx - coords.x : 0, offsetY: coords ? hitShape.cy - coords.y : 0, moved: false, snapshot: makeSnapshot() }; }
      }
      return { type: "pan", startX: clientX, startY: clientY, startPan: { ...transformRef.current.pan }, moved: false, ellipseTap: true };
    }
    if (modeRef.current === "safex") {
      const hitShape = findSafeXShapeAt(clientX, clientY); if (hitShape) { const coords = clientToImageCoords(clientX, clientY); return { type: "safex", shapeId: hitShape.id, startX: clientX, startY: clientY, offsetX: coords ? hitShape.cx - coords.x : 0, offsetY: coords ? hitShape.cy - coords.y : 0, moved: false, snapshot: makeSnapshot() }; }
      return { type: "pan", startX: clientX, startY: clientY, startPan: { ...transformRef.current.pan }, moved: false, safeXTap: true };
    }
    if (modeRef.current === "arrow") {
      if (!arrowCenterRef.current) {
        const hitArrow = findArrowAt(clientX, clientY);
        if (hitArrow) {
          const coords = clientToImageCoords(clientX, clientY);
          return {
            type: "arrow", arrowId: hitArrow.id, startX: clientX, startY: clientY,
            offsetX1: coords ? hitArrow.x1 - coords.x : 0, offsetY1: coords ? hitArrow.y1 - coords.y : 0,
            offsetX2: coords ? hitArrow.x2 - coords.x : 0, offsetY2: coords ? hitArrow.y2 - coords.y : 0,
            moved: false, snapshot: makeSnapshot(),
          };
        }
      }
      return { type: "pan", startX: clientX, startY: clientY, startPan: { ...transformRef.current.pan }, moved: false, arrowTap: true };
    }
    if (modeRef.current === "label") {
      return { type: "pan", startX: clientX, startY: clientY, startPan: { ...transformRef.current.pan }, moved: false, labelTap: true };
    }
    return { type: "pan", startX: clientX, startY: clientY, startPan: { ...transformRef.current.pan }, moved: false };
  }, [findLabelAt, findMarkerAt, findShapeAt, findSafeXShapeAt, findHandleAt, findArrowAt, makeSnapshot, clientToImageCoords]);

  const handleMouseDown = (e) => {
    if (!image || e.button !== 0 || markerPopup.open) return;
    clearMarkerLongPress();
    setShowMarkerSheet(false);
    setShowShapeSheet(false);
    e.preventDefault(); mouseDragRef.current = beginPointerDrag(e.clientX, e.clientY);
  };

  const handleCanvasDoubleClick = (e) => {
    if (!image) return;
    const hitLabel = findLabelAt(e.clientX, e.clientY);
    if (!hitLabel) return;
    e.preventDefault();
    openLabelEditorForExisting(hitLabel);
  };

  const handleCanvasContextMenu = (e) => {
    if (!image) return;
    e.preventDefault();
    const hitMarker = findMarkerAt(e.clientX, e.clientY);
    if (!hitMarker || (hitMarker.type !== "hold" && hitMarker.type !== "duo")) {
      closeMarkerPopup();
      return;
    }
    clearMarkerLongPress();
    setSelectedMarkerId(hitMarker.id);
    setSelectedShapeOrArrow(null);
    setSelectedLabelId(null);
    openMarkerPopupAt(hitMarker.id, e.clientX, e.clientY);
  };

  const zoomAtPoint = useCallback((clientX, clientY, nextZoom) => {
    const viewport = viewportRef.current; if (!viewport) return;
    const { zoom: z, pan: p } = transformRef.current; let newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const viewportRect = viewport.getBoundingClientRect(); const mx = clientX - viewportRect.left; const my = clientY - viewportRect.top;
    transformRef.current = { zoom: newZoom, pan: { x: mx - ((mx - p.x) / z) * newZoom, y: my - ((my - p.y) / z) * newZoom } }; setZoom(newZoom); setPan(transformRef.current.pan);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      const drag = mouseDragRef.current; if (!drag) return;
      const dx = e.clientX - drag.startX; const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) >= MOUSE_DRAG_THRESHOLD) { drag.moved = true; setIsDragging(true); }
      if (!drag.moved) return;
      if (drag.type === "label") moveLabelTo(drag.labelId, e.clientX, e.clientY, drag.offsetX, drag.offsetY);
      else if (drag.type === "marker") moveMarkerTo(drag.markerId, e.clientX, e.clientY, drag.offsetX, drag.offsetY);
      else if (drag.type === "resize-shape") resizeShapeByHandle(drag.shapeId, drag.shapeType, drag.handleId, e.clientX, e.clientY, drag.origin);
      else if (drag.type === "shape") moveShapeTo(drag.shapeId, e.clientX, e.clientY, drag.offsetX, drag.offsetY);
      else if (drag.type === "safex") moveSafeXShapeTo(drag.shapeId, e.clientX, e.clientY, drag.offsetX, drag.offsetY);
      else if (drag.type === "arrow") moveArrowTo(drag.arrowId, e.clientX, e.clientY, drag.offsetX1, drag.offsetY1, drag.offsetX2, drag.offsetY2);
      else if (drag.type === "pan") { const newPan = { x: drag.startPan.x + dx, y: drag.startPan.y + dy }; transformRef.current = { ...transformRef.current, pan: newPan }; setPan(newPan); }
    };
    const handleMouseUp = (e) => {
      const drag = mouseDragRef.current;
      if (!drag) return; mouseDragRef.current = null; setIsDragging(false);
      if (drag.type === "label") {
        if (drag.moved) setHistory(prev => [...prev, drag.snapshot]);
        else {
          setSelectedLabelId(drag.labelId);
          setSelectedShapeOrArrow(null);
          setSelectedMarkerId(null);
        }
        return;
      }
      if (drag.type === "marker") {
        if (drag.moved) {
          setHistory(prev => [...prev, drag.snapshot]);
        } else {
          const selectedMarker = markersRef.current.find(marker => marker.id === drag.markerId);
          if (selectedMarker && (selectedMarker.type === "hold" || selectedMarker.type === "duo")) {
            setSelectedMarkerId(drag.markerId);
            setSelectedShapeOrArrow(null);
            setSelectedLabelId(null);
          }
        }
        return;
      }
      if (drag.type === "resize-shape") { if (drag.moved) setHistory(prev => [...prev, drag.snapshot]); return; }
      if (drag.type === "shape") {
        if (drag.moved) setHistory(prev => [...prev, drag.snapshot]);
        else {
          setSelectedShapeOrArrow({ type: "shape", id: drag.shapeId });
          setSelectedLabelId(null);
          setSelectedMarkerId(null);
        }
        return;
      }
      if (drag.type === "safex") {
        if (drag.moved) setHistory(prev => [...prev, drag.snapshot]);
        else {
          setSelectedShapeOrArrow({ type: "safex", id: drag.shapeId });
          setSelectedLabelId(null);
          setSelectedMarkerId(null);
        }
        return;
      }
      if (drag.type === "arrow") {
        if (drag.moved) setHistory(prev => [...prev, drag.snapshot]);
        else {
          setSelectedShapeOrArrow({ type: "arrow", id: drag.arrowId });
          setSelectedLabelId(null);
          setSelectedMarkerId(null);
        }
        return;
      }
      if (!drag.moved) {
        if (drag.ellipseTap) handleEllipseTap(e.clientX, e.clientY, e.shiftKey);
        else if (drag.arrowTap) handleArrowTap(e.clientX, e.clientY);
        else if (drag.safeXTap) handleSafeXTap(e.clientX, e.clientY);
        else if (drag.labelTap) handleLabelTap(e.clientX, e.clientY);
        else placeMarkerAt(e.clientX, e.clientY);
      }
    };
    window.addEventListener("mousemove", handleMouseMove); window.addEventListener("mouseup", handleMouseUp);
    return () => { window.removeEventListener("mousemove", handleMouseMove); window.removeEventListener("mouseup", handleMouseUp); };
  }, [placeMarkerAt, handleEllipseTap, handleArrowTap, handleSafeXTap, handleLabelTap, moveLabelTo, moveMarkerTo, moveShapeTo, moveSafeXShapeTo, moveArrowTo, resizeShapeByHandle]);

  useEffect(() => {
    const preventPageZoom = (e) => { if (e.ctrlKey) e.preventDefault(); }; document.addEventListener("wheel", preventPageZoom, { passive: false });
    return () => document.removeEventListener("wheel", preventPageZoom);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current; if (!viewport || !image) return;
    const handleWheel = (e) => { e.preventDefault(); e.stopPropagation(); zoomAtPoint(e.clientX, e.clientY, transformRef.current.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); };
    viewport.addEventListener("wheel", handleWheel, { passive: false }); return () => viewport.removeEventListener("wheel", handleWheel);
  }, [image, zoomAtPoint]);

  const clearLabelLongPress = useCallback(() => {
    if (!labelLongPressRef.current) return;
    clearTimeout(labelLongPressRef.current);
    labelLongPressRef.current = null;
  }, []);

  const clearMarkerLongPress = useCallback(() => {
    if (!markerLongPressRef.current) return;
    clearTimeout(markerLongPressRef.current);
    markerLongPressRef.current = null;
  }, []);

  useEffect(() => () => {
    clearLabelLongPress();
    clearMarkerLongPress();
  }, [clearLabelLongPress, clearMarkerLongPress]);

  const handleTouchStart = (e) => {
    if (!image || markerPopup.open) return;
    e.preventDefault();
    clearMarkerLongPress();
    setShowMarkerSheet(false);
    setShowShapeSheet(false);
    if (e.touches.length === 2) { clearLabelLongPress(); e.preventDefault(); beginPinch(e.touches[0], e.touches[1]); return; }
    if (e.touches.length === 1 && !pinchRef.current) {
      const touch = e.touches[0];
      const drag = beginPointerDrag(touch.clientX, touch.clientY);
      tapRef.current = drag;
      if (drag?.type === "label") {
        clearLabelLongPress();
        labelLongPressRef.current = setTimeout(() => {
          if (tapRef.current && tapRef.current.type === "label" && !tapRef.current.moved) {
            const targetLabel = labelsRef.current.find(label => label.id === tapRef.current.labelId);
            if (targetLabel) openLabelEditorForExisting(targetLabel);
            tapRef.current = null;
            setIsDragging(false);
          }
        }, 550);
      }
      if (drag?.type === "marker") {
        const marker = markersRef.current.find(item => item.id === drag.markerId);
        if (marker && (marker.type === "hold" || marker.type === "duo")) {
          const pressX = touch.clientX;
          const pressY = touch.clientY;
          markerLongPressRef.current = setTimeout(() => {
            const activeDrag = tapRef.current;
            if (!activeDrag || activeDrag.type !== "marker" || activeDrag.markerId !== drag.markerId || activeDrag.moved) return;
            tapRef.current = null;
            setIsDragging(false);
            setSelectedMarkerId(drag.markerId);
            setSelectedShapeOrArrow(null);
            setSelectedLabelId(null);
            openMarkerPopupAt(drag.markerId, pressX, pressY);
          }, 500);
        }
      }
    }
  };

  const handleTouchMove = (e) => {
    if (!image) return; if (e.touches.length === 2) { clearLabelLongPress(); clearMarkerLongPress(); e.preventDefault(); applyPinch(e.touches[0], e.touches[1]); return; }
    const drag = tapRef.current;
    if (e.touches.length === 1 && drag && !pinchRef.current) {
      e.preventDefault(); const t = e.touches[0]; const dx = t.clientX - drag.startX; const dy = t.clientY - drag.startY;
      const moveThreshold = (drag.arrowTap || drag.ellipseTap || drag.safeXTap) ? 24 : TAP_MOVE_THRESHOLD;
      if (!drag.moved && Math.hypot(dx, dy) > moveThreshold) { drag.moved = true; clearLabelLongPress(); clearMarkerLongPress(); setIsDragging(true); }
      if (!drag.moved) return;
      
      if (drag.type === "label") {
        moveLabelTo(drag.labelId, t.clientX, t.clientY, drag.offsetX, drag.offsetY);
      }
      else if (drag.type === "marker") { 
        moveMarkerTo(drag.markerId, t.clientX, t.clientY, drag.offsetX, drag.offsetY); 
      }
      else if (drag.type === "resize-shape") resizeShapeByHandle(drag.shapeId, drag.shapeType, drag.handleId, t.clientX, t.clientY, drag.origin);
      else if (drag.type === "shape") moveShapeTo(drag.shapeId, t.clientX, t.clientY, drag.offsetX, drag.offsetY);
      else if (drag.type === "safex") moveSafeXShapeTo(drag.shapeId, t.clientX, t.clientY, drag.offsetX, drag.offsetY);
      else if (drag.type === "arrow") moveArrowTo(drag.arrowId, t.clientX, t.clientY, drag.offsetX1, drag.offsetY1, drag.offsetX2, drag.offsetY2);
      else if (drag.type === "pan") { const newPan = { x: drag.startPan.x + dx, y: drag.startPan.y + dy }; transformRef.current = { ...transformRef.current, pan: newPan }; setPan(newPan); }
    }
  };

  const handleTouchEnd = (e) => {
    clearLabelLongPress();
    clearMarkerLongPress();
    if (!image) return; 
    if (pinchRef.current) { 
      e.preventDefault(); 
      if (e.touches.length < 2) {
        pinchRef.current = null; tapRef.current = null; setPreviewShape(null); setPreviewArrow(null); setPreviewSafeXShape(null); setIsDragging(false); 
      }
      return; 
    }
    if (tapRef.current && e.changedTouches.length === 1) {
      const drag = tapRef.current; tapRef.current = null; setIsDragging(false); e.preventDefault();
      if (drag.type === "label") {
        if (drag.moved) setHistory(prev => [...prev, drag.snapshot]);
        else {
          setSelectedLabelId(drag.labelId);
          setSelectedShapeOrArrow(null);
          setSelectedMarkerId(null);
        }
        return;
      }
      if (drag.type === "marker") {
        if (drag.moved) {
          setHistory(prev => [...prev, drag.snapshot]);
        } else {
          const selectedMarker = markersRef.current.find(marker => marker.id === drag.markerId);
          if (selectedMarker && (selectedMarker.type === "hold" || selectedMarker.type === "duo")) {
            setSelectedMarkerId(drag.markerId);
            setSelectedShapeOrArrow(null);
            setSelectedLabelId(null);
          }
        }
        return;
      }
      if (drag.type === "resize-shape") { if (drag.moved) setHistory(prev => [...prev, drag.snapshot]); return; }
      if (drag.type === "shape") {
        if (drag.moved) setHistory(prev => [...prev, drag.snapshot]);
        else {
          setSelectedShapeOrArrow({ type: "shape", id: drag.shapeId });
          setSelectedLabelId(null);
          setSelectedMarkerId(null);
        }
        return;
      }
      if (drag.type === "safex") {
        if (drag.moved) setHistory(prev => [...prev, drag.snapshot]);
        else {
          setSelectedShapeOrArrow({ type: "safex", id: drag.shapeId });
          setSelectedLabelId(null);
          setSelectedMarkerId(null);
        }
        return;
      }
      if (drag.type === "arrow") {
        if (drag.moved) setHistory(prev => [...prev, drag.snapshot]);
        else {
          setSelectedShapeOrArrow({ type: "arrow", id: drag.arrowId });
          setSelectedLabelId(null);
          setSelectedMarkerId(null);
        }
        return;
      }
      if (!drag.moved) {
        const t = e.changedTouches[0];
        if (drag.ellipseTap) handleEllipseTap(t.clientX, t.clientY, false);
        else if (drag.arrowTap) handleArrowTap(t.clientX, t.clientY);
        else if (drag.safeXTap) handleSafeXTap(t.clientX, t.clientY);
        else if (drag.labelTap) handleLabelTap(t.clientX, t.clientY);
        else placeMarkerAt(t.clientX, t.clientY);
      }
    }
  };

  const beginPinch = (t1, t2) => {
    pinchRef.current = { startDistance: getTouchDistance(t1, t2), startZoom: transformRef.current.zoom, startPan: { ...transformRef.current.pan }, startMid: getTouchMidpoint(t1, t2) };
    clearLabelLongPress();
    clearMarkerLongPress();
    tapRef.current = null; mouseDragRef.current = null; setPreviewShape(null); setPreviewArrow(null); setPreviewSafeXShape(null); setIsDragging(false);
  };

  const applyPinch = (t1, t2) => {
    const pinch = pinchRef.current; if (!pinch || pinch.startDistance <= 0) return;
    let newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.startZoom * (getTouchDistance(t1, t2) / pinch.startDistance)));
    const mid = getTouchMidpoint(t1, t2);
    const viewportRect = viewportRef.current.getBoundingClientRect();
    const midLocalX = mid.x - viewportRect.left;
    const midLocalY = mid.y - viewportRect.top;
    const current = transformRef.current;

    // 현재 두 손가락 중심점 아래의 이미지 좌표를 고정(anchor)한 채 확대/축소
    const anchorX = (midLocalX - current.pan.x) / current.zoom;
    const anchorY = (midLocalY - current.pan.y) / current.zoom;
    const newPan = {
      x: midLocalX - anchorX * newZoom,
      y: midLocalY - anchorY * newZoom
    };

    transformRef.current = { zoom: newZoom, pan: newPan }; setZoom(newZoom); setPan(newPan);
  };

  const handleUndo = () => {
    if (history.length === 0) return; const snapshot = history[history.length - 1];
    setMarkers(snapshot.markers); setShapes(snapshot.shapes ?? []); setArrows(snapshot.arrows ?? []); setSafeXShapes(snapshot.safeXShapes ?? []); setLabels(snapshot.labels ?? []); setNextHoldNumber(snapshot.nextHoldNumber);
    setPreviewShape(null); setPreviewArrow(null); setPreviewSafeXShape(null); setHistory(h => h.slice(0, -1)); setSelectedShapeOrArrow(null); setSelectedLabelId(null); setSelectedMarkerId(null); closeMarkerPopup();
  };

  const handleExportCSV = () => {
    const rows = [["number_or_cx_or_x1","x_or_cy_or_y1","y_or_rx_or_x2","type","label_or_ry_or_y2"]]; 
    markers.forEach(m => rows.push([m.label ?? m.number ?? "", Math.round(m.x), Math.round(m.y), m.type, m.label ?? ""]));
    shapes.forEach(s => rows.push([Math.round(s.cx), Math.round(s.cy), Math.round(s.rx), "ellipse_shape", Math.round(s.ry)]));
    arrows.forEach(a => rows.push([Math.round(a.x1), Math.round(a.y1), Math.round(a.x2), "arrow_shape", Math.round(a.y2)]));

    const csvContent = "\uFEFF" + rows.map(r => r.map(escapeCSV).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); const url = URL.createObjectURL(blob);
    a.href = url; a.download = "coordinates.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const handleExportPNG = () => {
    if (!imgRef.current) return; const offscreen = document.createElement("canvas"); offscreen.width = imgSize.w; offscreen.height = imgSize.h;
    const ctx = offscreen.getContext("2d"); ctx.drawImage(imgRef.current, 0, 0);
    const overlay = document.createElement("canvas"); overlay.width = imgSize.w; overlay.height = imgSize.h;
    drawAll(overlay.getContext("2d"), markers, 1, markerSize, 1, shapesRef.current, null, false, null, scale > 0 ? ellipseStrokeWidth / scale : ellipseStrokeWidth, arrowsRef.current, null, null, scale > 0 ? arrowStrokeWidth / scale : arrowStrokeWidth, safeXShapesRef.current, null, null, null, false, labelsRef.current, null);
    ctx.drawImage(overlay, 0, 0); 
    const a = document.createElement("a"); const url = offscreen.toDataURL("image/png");
    a.href = url; a.download = "route_map.png"; a.click();
  };

  const handleExportJPG = () => {
    if (!imgRef.current) return; const offscreen = document.createElement("canvas"); offscreen.width = imgSize.w; offscreen.height = imgSize.h;
    const ctx = offscreen.getContext("2d"); ctx.drawImage(imgRef.current, 0, 0);
    const overlay = document.createElement("canvas"); overlay.width = imgSize.w; overlay.height = imgSize.h;
    drawAll(overlay.getContext("2d"), markers, 1, markerSize, 1, shapesRef.current, null, false, null, scale > 0 ? ellipseStrokeWidth / scale : ellipseStrokeWidth, arrowsRef.current, null, null, scale > 0 ? arrowStrokeWidth / scale : arrowStrokeWidth, safeXShapesRef.current, null, null, null, false, labelsRef.current, null);
    ctx.drawImage(overlay, 0, 0); 
    const a = document.createElement("a"); const url = offscreen.toDataURL("image/jpeg", 0.92);
    a.href = url; a.download = "route_map.jpg"; a.click();
  };

  const handleExportPDF = () => {
    if (!imgRef.current) return;
    const exportCanvas = document.createElement("canvas"); exportCanvas.width = imgSize.w; exportCanvas.height = imgSize.h;
    const ctx = exportCanvas.getContext("2d"); ctx.drawImage(imgRef.current, 0, 0);
    const overlay = document.createElement("canvas"); overlay.width = imgSize.w; overlay.height = imgSize.h;
    drawAll(overlay.getContext("2d"), markers, 1, markerSize, 1, shapesRef.current, null, false, null, scale > 0 ? ellipseStrokeWidth / scale : ellipseStrokeWidth, arrowsRef.current, null, null, scale > 0 ? arrowStrokeWidth / scale : arrowStrokeWidth, safeXShapesRef.current, null, null, null, false, labelsRef.current, null);
    ctx.drawImage(overlay, 0, 0);
    const dataUrl = exportCanvas.toDataURL("image/png");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("⚠️ 브라우저 팝업이 차단되었습니다! 주소창 우측에서 팝업 허용 후 다시 시도해주세요."); return;
    }
    printWindow.document.write(`
      <html>
        <head>
          <title>Lead Route - Topo Map</title>
          <style>
            @page { size: A4 portrait; margin: 0; }
            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: #fff; height: 100vh; }
            img { max-width: 100%; max-height: 100vh; object-fit: contain; page-break-inside: avoid; }
          </style>
        </head>
        <body><img src="${dataUrl}" onload="window.print(); window.close();" /></body>
      </html>
    `);
    printWindow.document.close();
  };

  const displayW = imgSize.w * scale; const displayH = imgSize.h * scale;
  const currentMarkerKey = markerMode;
  const currentMarkerMeta = MARKER_MODE_META[currentMarkerKey];
  const currentShapeKey = SHAPE_MODES.includes(mode) ? mode : "safex";
  const currentShapeMeta = SHAPE_MODE_META[currentShapeKey];
  const selectedLabel = selectedLabelId ? labels.find(label => label.id === selectedLabelId) : null;
  const selectedLabelSize = selectedLabel ? Math.max(LABEL_MIN_FONT_SIZE, Number(selectedLabel.fontSize) || DEFAULT_LABEL_FONT_SIZE) : null;
  const selectedMarker = selectedMarkerId ? markers.find(marker => marker.id === selectedMarkerId) : null;
  const popupMarker = markerPopup.markerId ? markers.find(marker => marker.id === markerPopup.markerId) : null;

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={{
        display:"flex",
        flexDirection:"column",
        height:"100dvh",
        background:"#0a0a0f",
        color:"white",
        fontFamily:"sans-serif",
        overflow:"hidden",
        userSelect:"none",
        WebkitUserSelect:"none",
        msUserSelect:"none",
        WebkitTouchCallout:"none",
      }}
    >
      {/* 헤더 */}
      <div style={{ padding:"10px 14px", background:"#111", borderBottom:"1px solid #222", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, zIndex:200 }}>
        <div>
          <div style={{ fontSize:10, color:"#666", letterSpacing:2, textTransform:"uppercase" }}>Lead Route</div>
          <div style={{ fontSize:16, fontWeight:"bold" }}>Topo Maker</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {image && (
            <label style={{ background:"#1e293b", border:"1px solid #334155", color: "#93c5fd", borderRadius:8, padding:"6px 12px", fontSize:13, cursor:"pointer", fontWeight: "bold" }}>
              📋 CSV 불러오기
              <input type="file" accept=".csv" style={{ display:"none" }} onChange={handleCSVImport} />
            </label>
          )}
          <button onClick={() => setShowHelp(true)} style={{ background:"#333", border:"1px solid #444", borderRadius:8, padding:"6px 12px", fontSize:13, color:"white", cursor:"pointer" }}>
            ❓ 도움말
          </button>
          <label style={{ background:"#333", border:"1px solid #444", borderRadius:8, padding:"6px 12px", fontSize:13, cursor:"pointer" }}>
            사진 열기 <input type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageUpload} />
          </label>
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display:"flex", background:"#111", borderBottom:"1px solid #222", flexShrink:0, zIndex:200 }}>
        {["place","list"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flex:1, padding:"8px 0", fontSize:13, fontWeight:tab===t?"bold":"normal", color:tab===t?"white":"#555", background:"none", border:"none", borderBottom:tab===t?"2px solid #3b82f6":"2px solid transparent", cursor:"pointer" }}>
            {t==="place" ? "📍 배치" : "📋 목록"}
          </button>
        ))}
      </div>

      {tab === "place" && (
        <div style={{ display:"flex", flexDirection:"column", flex:1, minHeight:0 }}>
          {/* 모드 버튼 */}
          <div style={{ display:"flex", gap:6, padding:"8px 10px", background:"#111", overflowX:"auto", flexShrink:0, zIndex:200, flexWrap:"nowrap" }}>
            <button
              onClick={() => setShowMarkerSheet(true)}
              style={{
                flexShrink:0,
                padding:"6px 12px",
                borderRadius:8,
                fontSize:12,
                fontWeight:"bold",
                cursor:"pointer",
                border: MARKER_MODES.includes(mode) ? "2px solid white" : "2px solid transparent",
                background: currentMarkerMeta.color,
                color: currentMarkerMeta.text,
                opacity: MARKER_MODES.includes(mode) ? 1 : 0.85,
              }}
            >
              {currentMarkerMeta.icon} {currentMarkerMeta.label} ▼
            </button>
            <button
              onClick={() => setShowShapeSheet(true)}
              style={{
                flexShrink:0,
                padding:"6px 12px",
                borderRadius:8,
                fontSize:12,
                fontWeight:"bold",
                cursor:"pointer",
                border: SHAPE_MODES.includes(mode) ? "2px solid white" : "2px solid transparent",
                background: currentShapeMeta.color,
                color: currentShapeMeta.text,
                opacity: SHAPE_MODES.includes(mode) ? 1 : 0.85,
              }}
            >
              {currentShapeMeta.icon} {currentShapeMeta.label} ▼
            </button>
            <button onClick={() => setMode("label")} style={{ flexShrink:0, padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:"bold", cursor:"pointer", border: mode==="label" ? "2px solid white" : "2px solid transparent", background: mode==="label" ? "#f59e0b" : "#333", color: mode==="label" ? "#111" : "white", opacity: mode==="label" ? 1 : 0.75 }}>
              🏷 제목
            </button>
            {showLockNumberFeature && (
              <button onClick={() => { if (lockNumber) setNextHoldNumber(getNextHoldFromList(markersRef.current)); setLockNumber(v => !v); }} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: "bold", cursor: "pointer", border: lockNumber ? "2px solid #fca5a5" : "2px solid transparent", background: lockNumber ? "#dc2626" : "#333", color: "white", opacity: lockNumber ? 1 : 0.55 }}>
                🔒 번호 고정
              </button>
            )}
          </div>

          {/* 슬라이더 */}
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 12px", background:"#111", borderBottom:"1px solid #1a1a1a", flexShrink:0, zIndex:200 }}>
            {mode === "ellipse" ? (
              <>
                <span style={{ fontSize:11, color:"#666", whiteSpace:"nowrap" }}>원형 테두리 두께</span>
                <input type="range" min={1} max={8} step={0.5} value={ellipseStrokeWidth} onChange={e => setEllipseStrokeWidth(Number(e.target.value))} style={{ flex:1 }} />
                <span style={{ fontSize:11, color:"#888", width:28 }}>{ellipseStrokeWidth}</span>
              </>
            ) : mode === "arrow" ? (
              <>
                <span style={{ fontSize:11, color:"#666", whiteSpace:"nowrap" }}>화살표 테두리 두께</span>
                <input type="range" min={1} max={8} step={0.5} value={arrowStrokeWidth} onChange={e => setArrowStrokeWidth(Number(e.target.value))} style={{ flex:1 }} />
                <span style={{ fontSize:11, color:"#888", width:28 }}>{arrowStrokeWidth}</span>
              </>
            ) : mode === "safex" ? (
              <>
                <span style={{ fontSize:11, color:"#666", whiteSpace:"nowrap" }}>안전 X 크기</span>
                <input
                  type="range"
                  min={MIN_SHAPE_RADIUS}
                  max={220}
                  value={safeXSize}
                  onChange={e => handleSafeXSizeChange(e.target.value)}
                  onMouseUp={handleSafeXSizeCommit}
                  onTouchEnd={handleSafeXSizeCommit}
                  style={{ flex:1 }}
                />
                <span style={{ fontSize:11, color:"#888", width:36 }}>{Math.round(safeXSize)}</span>
              </>
            ) : mode === "label" ? (
              <>
                <span style={{ fontSize:11, color:"#666", whiteSpace:"nowrap" }}>Label 폰트 크기</span>
                <input
                  type="range"
                  min={LABEL_MIN_FONT_SIZE}
                  max={LABEL_MAX_FONT_SIZE}
                  value={labelFontSize}
                  onChange={e => handleLabelFontSizeChange(e.target.value)}
                  onMouseUp={handleLabelFontSizeCommit}
                  onTouchEnd={handleLabelFontSizeCommit}
                  style={{ flex:1 }}
                />
                <span style={{ fontSize:11, color:"#888", width:36 }}>{labelFontSize}px</span>
              </>
            ) : (
              <>
                <span style={{ fontSize:11, color:"#666", whiteSpace:"nowrap" }}>글자 크기 배율</span>
                <input type="range" min={4} max={25} value={markerSize} onChange={e => setMarkerSize(Number(e.target.value))} style={{ flex:1 }} />
                <span style={{ fontSize:11, color:"#888", width:28 }}>{markerSize}</span>
              </>
            )}
          </div>

          {/* 안내 메시지 */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 12px", background:"#0a0a0f", borderBottom:"1px solid #1a1a1a", flexShrink:0, zIndex:200 }}>
            <span style={{ fontSize:11, color:"#93c5fd", fontWeight: "bold" }}>
              {/* ⚡ [피드백 반영] 유저 가이드 텍스트 최적화 완료 */}
              {!image ? "사진을 먼저 열어주세요" : selectedLabelId ? `🚨 선택됨: [Label]   ${selectedLabelSize ?? labelFontSize}px` : selectedMarker ? `🚨 선택됨: [${selectedMarker.type === "duo" ? `Duo #${selectedMarker.label}` : `Hold #${selectedMarker.number}`}]` : selectedShapeOrArrow ? `🚨 선택됨: [${selectedShapeOrArrow.type === "shape" ? "원형" : selectedShapeOrArrow.type === "safex" ? "안전 홀드(X)" : "화살표"}]` : mode==="ellipse" ? "클릭: 중심 / 원 선택 후 삭제 가능" : mode==="arrow" ? "클릭: 시작점 ➡️ 끝점 / 선택 시 삭제" : mode==="safex" ? "클릭 즉시 안전 X 생성 / 드래그·슬라이더로 수정" : mode==="label" ? "터치: Label 생성 / 더블클릭·길게누르기: 편집" : `다음 홀드: #${nextHoldNumber}`}
            </span>
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              {(selectedShapeOrArrow || selectedLabelId) && (
                <button onClick={handleDeleteSelectedShapeOrArrow} style={{ fontSize:11, padding:"4px 10px", borderRadius:6, border:"none", background:"#ef4444", color:"white", fontWeight:"bold", cursor:"pointer" }}>🗑️ 선택 삭제</button>
              )}
              {Math.abs(zoom - FIT_ZOOM) > 0.001 && (
                <button onClick={resetTransform} style={{ fontSize:11, padding:"4px 8px", borderRadius:6, border:"none", background:"#333", color:"#93c5fd", cursor:"pointer" }}>줌 리셋</button>
              )}
              <button onClick={handleUndo} disabled={history.length===0} style={{ fontSize:12, padding:"4px 10px", borderRadius:6, border:"none", background: history.length===0 ? "#1a1a1a" : "#333", color: history.length===0 ? "#333" : "#facc15", cursor: history.length===0 ? "default" : "pointer" }}>↩ 취소</button>
            </div>
          </div>

          {/* 사진 영역 */}
          <div ref={(node) => { viewportRef.current = node; containerRef.current = node; }} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd} onMouseDown={handleMouseDown} onDoubleClick={handleCanvasDoubleClick} onContextMenu={handleCanvasContextMenu} style={{ flex: 1, minHeight: 0, position: "relative", background: "#0a0a0f", cursor: isDragging ? "grabbing" : "crosshair", overflow: "hidden", touchAction: "none", WebkitUserSelect: "none", userSelect: "none", WebkitTouchCallout: "none" }}>
            {!image ? (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", color:"#333" }}>
                <div style={{ fontSize:32 }}>🧗</div> <div style={{ fontSize:13, marginTop:6 }}>루트 사진을 열면 여기에 표시됩니다</div>
              </div>
            ) : (
              <div style={{ position: "absolute", top: 0, left: 0, width: displayW, height: displayH, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0", willChange: "transform" }}>
                <img ref={imgRef} src={image} alt="route" draggable={false} style={{ width: displayW, height: displayH, display:"block", pointerEvents:"none", userSelect:"none", WebkitUserSelect:"none", WebkitTouchCallout:"none" }} />
                <canvas ref={canvasRef} style={{ position: "absolute", top: 0, left: 0, width: displayW, height: displayH, touchAction: "none", userSelect:"none", WebkitUserSelect:"none", WebkitTouchCallout:"none" }} />
              </div>
            )}
          </div>

          {/* 하단 저장 버튼 그룹 */}
          {image && (
            <div style={{ display:"flex", gap:8, padding:"10px 12px", background:"#111", borderTop:"1px solid #222", flexShrink:0, zIndex:200 }}>
              <button onClick={() => setShowExportSheet(true)} style={{ flex:1, background:"#3b82f6", color:"white", border:"1px solid #2563eb", borderRadius:10, padding:"10px 0", fontSize:14, fontWeight:"bold", cursor:"pointer" }}>📤 내보내기</button>
            </div>
          )}
        </div>
      )}

      {/* 목록 탭 */}
      {tab === "list" && (
        <div style={{ flex:1, overflowY:"auto", padding:"10px 12px", minHeight:0 }}>
          {markers.length === 0 ? (
            <div style={{ textAlign:"center", color:"#555", fontSize:13, marginTop:40 }}>아직 마커가 없습니다</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {markers.map((m, idx) => (
                <div key={m.id} style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, background:"#1a1a1a", borderRadius:8, padding:"8px 10px" }}>
                    <span style={{ fontSize:11, fontWeight:"bold", padding:"2px 8px", borderRadius:20, flexShrink:0, minWidth:24, textAlign:"center", background: m.type==="top" ? "#3b82f6" : m.type==="start" ? "#22c55e" : m.type==="clip" ? "#facc15" : m.type==="duo" ? "#ec4899" : "white", color: (m.type==="clip"||m.type==="hold") ? "#111" : "white" }}>
                      {m.label}
                    </span>
                    <select
                      value={m.type}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleMarkerTypeChange(m.id, e.target.value);
                      }}
                      style={{ background:"#333", color:"white", border:"1px solid #444", borderRadius:6, fontSize:11, padding:"2px 4px" }}
                    >
                      {["hold","start","top","clip","duo"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {(m.type === "hold" || m.type === "duo") ? (
                      <select
                        value={getMarkerTextStyle(m)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleMarkerTextStyleChange(m.id, e.target.value);
                        }}
                        style={{ background:"#333", color:"white", border:"1px solid #444", borderRadius:6, fontSize:11, padding:"2px 4px" }}
                      >
                        <option value="black">검정</option>
                        <option value="white">흰색</option>
                      </select>
                    ) : (
                      <span style={{ fontSize:11, color:"#555", minWidth:36, textAlign:"center" }}>-</span>
                    )}
                    <span style={{ fontSize:11, color:"#666", flex:1, textAlign:"right" }}>({Math.round(m.x)}, {Math.round(m.y)})</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteMarker(m.id);
                      }}
                      style={{ background:"none", border:"none", color:"#ef4444", fontSize:14, cursor:"pointer", padding:"0 6px", flexShrink:0 }}
                    >✕</button>
                  </div>
                  {idx < markers.length - 1 && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        insertMarkerAt(idx + 1);
                      }}
                      style={{ alignSelf: "center", width: "85%", padding: "4px 0", fontSize: 11, fontWeight: "bold", background: "rgba(59, 130, 246, 0.15)", color: "#93c5fd", border: "1px dashed rgba(59, 130, 246, 0.4)", borderRadius: 6, cursor: "pointer" }}
                    >
                      ➕ 이 사이에 새 홀드 삽입
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {labelEditor.open && (
        <div onClick={() => setLabelEditor(prev => ({ ...prev, open: false }))} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:1080, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width:"100%", maxWidth:460, background:"#111", border:"1px solid #333", borderRadius:12, padding:12, display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ fontSize:13, color:"#93c5fd", fontWeight:"bold" }}>{labelEditor.id ? "Label 수정" : "Label 입력"}</div>
            <textarea
              autoFocus
              value={labelEditor.text}
              onChange={(e) => setLabelEditor(prev => ({ ...prev, text: e.target.value }))}
              placeholder={"예시)\n2026 경기도 유스 볼더리그\n\nU15 Girls\n\nQualification\n\nRoute A"}
              rows={7}
              style={{ width:"100%", resize:"vertical", minHeight:120, borderRadius:8, border:"1px solid #444", background:"#18181b", color:"#fff", padding:"10px", fontSize:13, lineHeight:1.4, boxSizing:"border-box" }}
            />
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={() => setLabelEditor(prev => ({ ...prev, open: false }))} style={{ background:"#27272a", color:"#d4d4d8", border:"1px solid #3f3f46", borderRadius:8, padding:"8px 12px", fontSize:12, fontWeight:"bold", cursor:"pointer" }}>취소</button>
              <button onClick={saveLabelEditor} style={{ background:"#2563eb", color:"#fff", border:"1px solid #1d4ed8", borderRadius:8, padding:"8px 12px", fontSize:12, fontWeight:"bold", cursor:"pointer" }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {showMarkerSheet && (
        <div onClick={() => setShowMarkerSheet(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1090, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width:"100%", maxWidth:520, background:"#111", borderTopLeftRadius:16, borderTopRightRadius:16, borderTop:"1px solid #333", padding:"14px 12px calc(12px + env(safe-area-inset-bottom)) 12px", display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:14, fontWeight:"bold", color:"#e5e7eb", textAlign:"center", marginBottom:2 }}>마커 종류 선택</div>
            {MARKER_PICKER_ORDER.map((markerKey) => {
              const markerMeta = MARKER_MODE_META[markerKey];
              const isSelected = currentMarkerKey === markerKey;
              return (
                <button
                  key={markerKey}
                  onClick={() => {
                    setMarkerMode(markerKey);
                    setMode(markerKey);
                    setShowMarkerSheet(false);
                  }}
                  style={{
                    width:"100%",
                    minHeight:46,
                    borderRadius:12,
                    border:isSelected ? "1px solid #60a5fa" : "1px solid #374151",
                    background:isSelected ? "rgba(59,130,246,0.22)" : "#1f2937",
                    color:"#fff",
                    fontSize:16,
                    fontWeight:"bold",
                    cursor:"pointer",
                    display:"flex",
                    alignItems:"center",
                    justifyContent:"space-between",
                    padding:"0 14px",
                  }}
                >
                  <span>{markerMeta.icon} {markerMeta.label}</span>
                  <span style={{ color:isSelected ? "#93c5fd" : "#6b7280", fontSize:14 }}>{isSelected ? "선택됨" : ""}</span>
                </button>
              );
            })}
            <button onClick={() => setShowMarkerSheet(false)} style={{ marginTop:4, minHeight:44, background:"#27272a", color:"#d4d4d8", border:"1px solid #3f3f46", borderRadius:10, padding:"11px 0", fontSize:14, fontWeight:"bold", cursor:"pointer" }}>취소</button>
          </div>
        </div>
      )}

      {showShapeSheet && (
        <div onClick={() => setShowShapeSheet(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:1090, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width:"100%", maxWidth:520, background:"#111", borderTopLeftRadius:16, borderTopRightRadius:16, borderTop:"1px solid #333", padding:"14px 12px calc(12px + env(safe-area-inset-bottom)) 12px", display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ fontSize:14, fontWeight:"bold", color:"#e5e7eb", textAlign:"center", marginBottom:2 }}>도형 선택</div>
            {SHAPE_PICKER_ORDER.map((shapeKey) => {
              const shapeMeta = SHAPE_MODE_META[shapeKey];
              const isSelected = mode === shapeKey;
              return (
                <button
                  key={shapeKey}
                  onClick={() => {
                    setMode(shapeKey);
                    setShowShapeSheet(false);
                  }}
                  style={{
                    width:"100%",
                    minHeight:46,
                    borderRadius:12,
                    border:isSelected ? "1px solid #60a5fa" : "1px solid #374151",
                    background:isSelected ? "rgba(59,130,246,0.22)" : "#1f2937",
                    color:"#fff",
                    fontSize:16,
                    fontWeight:"bold",
                    cursor:"pointer",
                    display:"flex",
                    alignItems:"center",
                    justifyContent:"space-between",
                    padding:"0 14px",
                  }}
                >
                  <span>{shapeMeta.icon} {shapeMeta.label}</span>
                  <span style={{ color:isSelected ? "#93c5fd" : "#6b7280", fontSize:14 }}>{isSelected ? "선택됨" : ""}</span>
                </button>
              );
            })}
            <button onClick={() => setShowShapeSheet(false)} style={{ marginTop:4, minHeight:44, background:"#27272a", color:"#d4d4d8", border:"1px solid #3f3f46", borderRadius:10, padding:"11px 0", fontSize:14, fontWeight:"bold", cursor:"pointer" }}>취소</button>
          </div>
        </div>
      )}

      {markerPopup.open && popupMarker && (popupMarker.type === "hold" || popupMarker.type === "duo") && (
        <div
          onClick={closeMarkerPopup}
          onTouchStart={closeMarkerPopup}
          onContextMenu={(e) => e.preventDefault()}
          style={{ position:"fixed", inset:0, background:"transparent", zIndex:1110 }}
        >
          <div
            ref={markerPopupRef}
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            style={{
              position:"fixed",
              left: markerPopup.x,
              top: markerPopup.y,
              minWidth:220,
              maxWidth:240,
              background:"#111827",
              border:"1px solid #334155",
              borderRadius:12,
              boxShadow:"0 10px 26px rgba(0,0,0,0.42)",
              padding:10,
              display:"flex",
              flexDirection:"column",
              gap:8,
            }}
          >
            <div style={{ fontSize:12, color:"#bfdbfe", fontWeight:"bold" }}>
              {popupMarker.type === "duo" ? `Duo #${popupMarker.label}` : `Hold #${popupMarker.number}`}
            </div>
            <div style={{ display:"flex", gap:6 }}>
              {(["black", "white"]).map(styleKey => {
                const styleMeta = TEXT_STYLE_META[styleKey];
                const isActive = getMarkerTextStyle(popupMarker) === styleKey;
                return (
                  <button
                    key={`popup-${styleKey}`}
                    onClick={() => {
                      handleMarkerTextStyleChange(popupMarker.id, styleKey);
                      setCurrentTextStyle(styleKey);
                      closeMarkerPopup();
                    }}
                    style={{
                      flex:1,
                      fontSize:11,
                      padding:"6px 0",
                      borderRadius:8,
                      cursor:"pointer",
                      border: isActive ? "2px solid #60a5fa" : "1px solid #475569",
                      background: styleKey === "black" ? "#f8fafc" : "#0f172a",
                      color: styleMeta.fill,
                      fontWeight:"bold",
                    }}
                  >
                    {styleKey === "black" ? "검정 글씨" : "흰 글씨"}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                insertMarkerBeforeId(popupMarker.id);
                closeMarkerPopup();
              }}
              style={{ background:"#1e293b", color:"#93c5fd", border:"1px dashed #3b82f6", borderRadius:8, padding:"7px 0", fontSize:11, fontWeight:"bold", cursor:"pointer" }}
            >
              ➕ 앞에 삽입
            </button>
            <button
              onClick={() => {
                insertMarkerAfterId(popupMarker.id);
                closeMarkerPopup();
              }}
              style={{ background:"#1e293b", color:"#93c5fd", border:"1px dashed #3b82f6", borderRadius:8, padding:"7px 0", fontSize:11, fontWeight:"bold", cursor:"pointer" }}
            >
              ➕ 뒤에 삽입
            </button>
            <button
              onClick={() => {
                handleDeleteMarker(popupMarker.id);
                closeMarkerPopup();
              }}
              style={{ background:"#7f1d1d", color:"#fecaca", border:"1px solid #dc2626", borderRadius:8, padding:"7px 0", fontSize:11, fontWeight:"bold", cursor:"pointer" }}
            >
              🗑️ 삭제
            </button>
            <button
              onClick={closeMarkerPopup}
              style={{ background:"#27272a", color:"#d4d4d8", border:"1px solid #3f3f46", borderRadius:8, padding:"7px 0", fontSize:11, fontWeight:"bold", cursor:"pointer" }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {showHelp && (
        <div onClick={() => setShowHelp(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div onClick={e => e.stopPropagation()} style={{ position:"relative", background:"#111", borderRadius:12, padding:20, maxWidth:420, maxHeight:"80vh", overflowY:"auto", color:"white", border:"1px solid #333", textAlign: "left"}}>
            <button onClick={() => setShowHelp(false)} style={{ position:"absolute", top:12, right:12, background:"none", border:"none", color:"#aaa", fontSize:18, cursor:"pointer", lineHeight:1 }}>✕</button>
            <div style={{ fontSize:16, fontWeight:"bold", marginBottom:14, color:"#3b82f6" }}>❓ 도움말</div>

            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:"bold", color:"#93c5fd", marginBottom:6 }}>기본 기능</div>
              <ul style={{ margin:0, paddingLeft:18, fontSize:12, color:"#ddd", lineHeight:1.7 }}>
                <li>사진 열기: 상단 "사진 열기" 버튼으로 루트 사진 업로드</li>
                <li>배치 모드: 홀드/START/TOP/클립/듀오/원형/화살표 중 선택 후 사진 위 클릭</li>
                {showLockNumberFeature && (
                  <li>🔒 번호 고정: 켜두면 홀드 번호가 자동 증가하지 않고 고정됨 (파라클라이밍용)</li>
                )}
                <li>슬라이더: 홀드 모드에서는 글자 크기, 원형/화살표 모드에서는 각각 테두리 두께 조절</li>
                <li>↩ 취소: 방금 작업 되돌리기</li>
                <li>줌 리셋: 확대/축소를 원래대로</li>
                <li>PNG/JPG/PDF/CSV 저장 및 CSV 불러오기 지원</li>
              </ul>
            </div>

            <div>
              <div style={{ fontSize:13, fontWeight:"bold", color:"#93c5fd", marginBottom:6 }}>번호 삽입 기능</div>
              <ul style={{ margin:0, paddingLeft:18, fontSize:12, color:"#ddd", lineHeight:1.7 }}>
                <li>홀드를 클릭하면 번호가 1부터 자동으로 매겨짐</li>
                <li>목록 탭(📋 목록)에서 각 홀드 사이의 "➕ 이 사이에 새 홀드 삽입" 버튼을 누르면 중간에 새 홀드를 끼워넣을 수 있음</li>
                <li>삽입하면 뒤쪽 번호들이 자동으로 다시 매겨짐(재인덱싱)</li>
                <li>듀오 홀드(듀오 모드로 찍은 짝)는 재인덱싱 시에도 항상 쌍으로 유지됨</li>
                <li>목록 탭에서 홀드 타입(hold/start/top/clip/duo)도 바로 변경 가능</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {showExportSheet && (
        <div onClick={() => setShowExportSheet(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:1100, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width:"100%", maxWidth:520, background:"#111", borderTopLeftRadius:16, borderTopRightRadius:16, borderTop:"1px solid #333", padding:"12px 12px calc(12px + env(safe-area-inset-bottom)) 12px", display:"flex", flexDirection:"column", gap:8 }}>
            <button onClick={() => { setShowExportSheet(false); handleExportPNG(); }} style={{ background:"#1f2937", color:"white", border:"1px solid #374151", borderRadius:10, padding:"12px 0", fontSize:14, fontWeight:"bold", cursor:"pointer" }}>🖼 PNG 저장</button>
            <button onClick={() => { setShowExportSheet(false); handleExportJPG(); }} style={{ background:"#1f2937", color:"white", border:"1px solid #374151", borderRadius:10, padding:"12px 0", fontSize:14, fontWeight:"bold", cursor:"pointer" }}>📷 JPG 저장</button>
            <button onClick={() => { setShowExportSheet(false); handleExportPDF(); }} style={{ background:"#1f2937", color:"white", border:"1px solid #374151", borderRadius:10, padding:"12px 0", fontSize:14, fontWeight:"bold", cursor:"pointer" }}>📄 PDF 저장</button>
            <button onClick={() => { setShowExportSheet(false); handleExportCSV(); }} style={{ background:"#1f2937", color:"white", border:"1px solid #374151", borderRadius:10, padding:"12px 0", fontSize:14, fontWeight:"bold", cursor:"pointer" }}>📊 CSV 저장</button>
            <button onClick={() => setShowExportSheet(false)} style={{ marginTop:4, background:"#27272a", color:"#d4d4d8", border:"1px solid #3f3f46", borderRadius:10, padding:"11px 0", fontSize:13, fontWeight:"bold", cursor:"pointer" }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}