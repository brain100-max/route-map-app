import { useState, useRef, useEffect, useCallback } from "react";

const MARKER_RADIUS = 14;
const FONT_SIZE = 13;

const COLORS = {
  hold:  { fill: "rgba(255,255,255,0.85)", stroke: "white",   text: "#111" },
  start: { fill: "rgba(34,139,34,0.88)",   stroke: "white",   text: "white" },
  top:   { fill: "rgba(30,90,200,0.88)",   stroke: "white",   text: "white" },
  clip:  { fill: "rgba(255,190,0,0.88)",   stroke: "white",   text: "#111" },
  duo:   { fill: "rgba(255,255,255,0.85)", stroke: "#f472b6", text: "#111" },
};

const dpr = window.devicePixelRatio || 1;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

function drawAll(ctx, markers, scale, markerSize = MARKER_RADIUS) {
  const r = markerSize * scale;
  const fs = FONT_SIZE * scale;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // 듀오 타원 표시 제거: 듀오 라벨만 표시

  markers.forEach(m => {
    const x = m.x * scale;
    const y = m.y * scale;
    const c = COLORS[m.type] || COLORS.hold;
    const label = (m.type === "top") ? "TOP" : (m.type === "start") ? "S" : String(m.label ?? m.number);

    ctx.font = `bold ${fs}px sans-serif`;

    if (m.type === "top" || m.type === "start") {
      const text = m.type === "top" ? "TOP" : "START";
      const tw = ctx.measureText(text).width;
      const pad = 7 * scale;
      const bw = tw + pad * 2, bh = fs + pad * 1.4;
      const rx2 = bw / 2, ry2 = bh / 2, rad = 8 * scale;
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
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
      ctx.fillStyle = c.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.strokeStyle = m.type === "duo" ? "#f472b6" : c.stroke;
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
      ctx.fillStyle = c.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, y);
    }
  });
}

export default function App() {
  const [image, setImage] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 1, h: 1 });
  const [markers, setMarkers] = useState([]);
  const [nextHoldNumber, setNextHoldNumber] = useState(1);
  const [mode, setMode] = useState("hold");
  const [history, setHistory] = useState([]);
  const [scale, setScale] = useState(1);
  const [markerSize, setMarkerSize] = useState(14);
  const [tab, setTab] = useState("place");

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  // 다음 홀드 번호는 markers를 매번 다시 세지 않고 상태로 관리한다.
  // 일반 홀드: +1, 듀오홀드: +2, START/TOP/clip: 번호 증가 없음
  const getNextNumberFromLabels = useCallback((markerList) => {
    let maxNumber = 0;

    for (const m of markerList) {
      if (["top", "clip", "start"].includes(m.type)) continue;

      const raw = String(m.label ?? m.number ?? "");
      const nums = raw.match(/\d+/g);
      if (!nums) continue;

      for (const n of nums) {
        maxNumber = Math.max(maxNumber, Number(n));
      }
    }

    return maxNumber + 1;
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !image) return;
    const ctx = canvasRef.current.getContext("2d");
    drawAll(ctx, markers, scale, markerSize);
  }, [markers, scale, image, markerSize]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      setImage(url);
      setMarkers([]);
      setHistory([]);
      setNextHoldNumber(1);
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

  const makeSnapshot = () => ({
    markers: [...markers],
    nextHoldNumber,
  });

  const handleCanvasClick = (e) => {
    if (!image) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / scale;
    const y = (clientY - rect.top) / scale;
    const snapshot = makeSnapshot();

    if (mode === "duo") {
      const n = nextHoldNumber;
      const marker = {
        id: Date.now(),
        x,
        y,
        type: "duo",
        label: `${n}/${n + 1}`,
        number: n,
      };

      setHistory(prev => [...prev, snapshot]);
      setMarkers(prev => [...prev, marker]);
      setNextHoldNumber(prev => prev + 2);
      return;
    }

    let label, number;
    if (mode === "clip") {
      const cnt = markers.filter(m => m.type === "clip").length + 1;
      label = `C${cnt}`;
      number = cnt;
    } else if (mode === "top") {
      label = "TOP";
      number = 0;
    } else if (mode === "start") {
      label = "START";
      number = 0;
    } else {
      number = nextHoldNumber;
      label = String(number);
    }

    const marker = { id: Date.now(), x, y, type: mode, label, number };
    setHistory(prev => [...prev, snapshot]);
    setMarkers(prev => [...prev, marker]);

    if (mode === "hold") {
      setNextHoldNumber(n => n + 1);
    }
  };

  const handleUndo = () => {
    if (history.length === 0) return;

    const snapshot = history[history.length - 1];
    setMarkers(snapshot.markers);
    setNextHoldNumber(snapshot.nextHoldNumber);
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
    markers.forEach((m) => rows.push([m.label ?? m.number ?? "", Math.round(m.x), Math.round(m.y), m.type, m.label ?? ""]));
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
    drawAll(mc.getContext("2d"), markers, 1, markerSize);
    ctx.drawImage(mc, 0, 0);
    const a = document.createElement("a");
    a.href = offscreen.toDataURL("image/png"); a.download = "route_map.png"; a.click();
  };

  const nextNum = nextHoldNumber;
  const hasStart = markers.some(m => m.type === "start");

  const modeButtons = [
    { key: "hold",  label: "홀드",   color: mode==="hold"  ? "bg-white text-gray-900" : "bg-gray-700 text-white" },
    { key: "start", label: "START", color: mode==="start" ? "bg-green-500 text-white" : "bg-gray-700 text-white" },
    { key: "top",   label: "TOP",   color: mode==="top"   ? "bg-blue-600 text-white"  : "bg-gray-700 text-white" },
    { key: "clip",  label: "클립",   color: mode==="clip"  ? "bg-yellow-400 text-gray-900" : "bg-gray-700 text-white" },
    { key: "duo",   label: "듀오",   color: mode==="duo"   ? "bg-pink-500 text-white"  : "bg-gray-700 text-white" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:"#0a0a0f", color:"white", fontFamily:"sans-serif" }}>

      {/* 헤더 */}
      <div style={{ padding:"10px 14px", background:"#111", borderBottom:"1px solid #222", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:200 }}>
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
      <div style={{ display:"flex", background:"#111", borderBottom:"1px solid #222", position:"sticky", top:50, zIndex:200 }}>
        {["place","list"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex:1, padding:"8px 0", fontSize:13, fontWeight:tab===t?"bold":"normal", color:tab===t?"white":"#555", background:"none", border:"none", borderBottom:tab===t?"2px solid #3b82f6":"2px solid transparent", cursor:"pointer" }}>
            {t==="place" ? "📍 배치" : "📋 목록"}
          </button>
        ))}
      </div>

      {tab === "place" && (<>

        {/* 모드 버튼 */}
        <div style={{ display:"flex", gap:6, padding:"8px 10px", background:"#111", overflowX:"auto", position:"sticky", top:84, zIndex:200, flexWrap:"nowrap" }}>
          {modeButtons.map(btn => (
            <button key={btn.key} onClick={() => setMode(btn.key)}
              style={{ flexShrink:0, padding:"6px 12px", borderRadius:8, fontSize:12, fontWeight:"bold", cursor:"pointer", border: mode===btn.key ? "2px solid white" : "2px solid transparent",
                background: btn.key==="hold" && mode===btn.key ? "white" :
                            btn.key==="start" && mode===btn.key ? "#22c55e" :
                            btn.key==="top" && mode===btn.key ? "#3b82f6" :
                            btn.key==="clip" && mode===btn.key ? "#facc15" :
                            btn.key==="duo" && mode===btn.key ? "#ec4899" : "#333",
                color: (btn.key==="hold"||btn.key==="clip") && mode===btn.key ? "#111" : "white",
                opacity: mode===btn.key ? 1 : 0.55 }}>
              {btn.label}
            </button>
          ))}
        </div>

        {/* 마커 크기 슬라이더 */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 12px", background:"#111", borderBottom:"1px solid #1a1a1a", position:"sticky", top:130, zIndex:200 }}>
          <span style={{ fontSize:11, color:"#666", whiteSpace:"nowrap" }}>마커 크기</span>
          <input type="range" min={8} max={24} value={markerSize}
            onChange={e => setMarkerSize(Number(e.target.value))}
            style={{ flex:1 }} />
          <span style={{ fontSize:11, color:"#888", width:20 }}>{markerSize}</span>
        </div>

        {/* 안내 + 취소 버튼 */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 12px", background:"#0a0a0f", borderBottom:"1px solid #1a1a1a", position:"sticky", top:166, zIndex:200 }}>
          <span style={{ fontSize:11, color:"#555" }}>
            {!image ? "사진을 먼저 열어주세요" :
             mode==="duo" ? `듀오 마커 클릭: ${nextHoldNumber}/${nextHoldNumber + 1}` :
             mode==="start" ? "START 홀드 클릭" :
             mode==="top" ? "TOP 홀드 클릭" :
             mode==="clip" ? `클립 C${markers.filter(m=>m.type==="clip").length+1} 위치 클릭` :
             `다음 홀드: #${nextNum}${!hasStart ? " (START 먼저 찍으면 1번부터)" : ""}`}
          </span>
          <button onClick={handleUndo} disabled={history.length===0}
            style={{ fontSize:12, padding:"3px 10px", borderRadius:6, border:"none", background: history.length===0 ? "#1a1a1a" : "#333", color: history.length===0 ? "#333" : "#facc15", cursor: history.length===0 ? "default" : "pointer" }}>
            ↩ 취소
          </button>
        </div>

        {/* 캔버스 영역 */}
        <div ref={containerRef} style={{ position:"relative", background:"#0a0a0f", cursor:"crosshair", overflowX:"auto", overflowY:"auto", minHeight: image ? undefined : 200 }}>
          {!image ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:200, color:"#333" }}>
              <div style={{ fontSize:32 }}>🧗</div>
              <div style={{ fontSize:13, marginTop:6 }}>루트 사진을 열면 여기에 표시됩니다</div>
            </div>
          ) : (
            <>
              <img ref={imgRef} src={image} alt="route"
                style={{ width: imgSize.w * scale, height: imgSize.h * scale, display:"block",touchAction:"pinch-zoom" }} />
              <canvas ref={canvasRef}
                ref={canvasRef}
                width={imgSize.w * scale * (window.devicePixelRatio || 1)}
                height={imgSize.h * scale * (window.devicePixelRatio || 1)}
                onClick={handleCanvasClick}
                onTouchStart={e => {
                  if (e.touches.length === 1) {
                    e.preventDefault();
                    handleCanvasClick(e);
                  }
                }}
                style={{ 
                  position:"absolute", top:0, left:0, 
                  width: imgSize.w * scale, 
                  height: imgSize.h * scale, 
                  touchAction:"pan-x pan-y pinch-zoom" 
                }}
                onClick={handleCanvasClick}
                onTouchStart={e => {
                  if (e.touches.length === 1) {
                    e.preventDefault();
                    handleCanvasClick(e);
                  }
                }}
                style={{ position:"absolute", top:0, left:0, width: imgSize.w * scale, height: imgSize.h * scale, touchAction:"pan-x pan-y pinch-zoom" }} />
            </>
          )}
        </div>

        {/* 하단 저장 버튼 */}
        {image && (
          <div style={{ display:"flex", gap:8, padding:"10px 12px", background:"#111", borderTop:"1px solid #222", position:"sticky", bottom:0, zIndex:200 }}>
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

      </>)}

{tab === "list" && (
    <div style={{ flex:1, overflowY:"auto", padding:"10px 12px" }}>
      {markers.length === 0 ? (
        <div style={{ textAlign:"center", color:"#555", fontSize:13, marginTop:40 }}>아직 마커가 없습니다</div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
          {[...markers].reverse().map(m => (
            <div key={m.id} style={{ display:"flex", alignItems:"center", gap:8, background:"#1a1a1a", borderRadius:8, padding:"8px 10px" }}>
              
              {/* 색상 뱃지 */}
              <span style={{ fontSize:11, fontWeight:"bold", padding:"2px 8px", borderRadius:20, flexShrink:0,
                background: m.type==="top" ? "#3b82f6" : m.type==="start" ? "#22c55e" : m.type==="clip" ? "#facc15" : m.type==="duo" ? "#ec4899" : "white",
                color: (m.type==="clip"||m.type==="hold") ? "#111" : "white" }}>
                {m.label}
              </span>

              {/* type 드롭다운 */}
              <select value={m.type}
                onChange={e => setMarkers(prev => prev.map(x => x.id===m.id ? {...x, type:e.target.value} : x))}
                style={{ background:"#333", color:"white", border:"1px solid #444", borderRadius:6, fontSize:11, padding:"2px 4px" }}>
                {["hold","start","top","clip","duo"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {/* 번호 수정 */}
              <input value={m.label} onChange={e => setMarkers(prev => prev.map(x => x.id===m.id ? {...x, label:e.target.value} : x))}
                style={{ background:"#333", color:"white", border:"1px solid #444", borderRadius:6, fontSize:11, padding:"2px 6px", width:50 }} />

              {/* 좌표 */}
              <span style={{ fontSize:11, color:"#aaa", flex:1 }}>({Math.round(m.x)}, {Math.round(m.y)})</span>

              {/* 삭제 */}
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
