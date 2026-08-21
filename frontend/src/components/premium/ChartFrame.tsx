import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minus, Plus, Shrink } from "lucide-react";
import { cn } from "../../lib/utils";

// Wraps any chart with an optional view-toggle slot, zoom +/- and Fullscreen-API
// fullscreen. `children` is a render function so the content can size to the frame.
export default function ChartFrame({
  title, icon, right, viewToggle, defaultHeight = 340, zoomable = true, className, children,
}: {
  title?: ReactNode; icon?: ReactNode; right?: ReactNode; viewToggle?: ReactNode;
  defaultHeight?: number; zoomable?: boolean; className?: string;
  children: (ctx: { fullscreen: boolean; height: number; zoom: number }) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [vh, setVh] = useState(0);

  useEffect(() => {
    const onFs = () => {
      const active = document.fullscreenElement === ref.current;
      setFs(active);
      setVh(active ? window.innerHeight : 0);
      if (!active) setZoom(1);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // pinch (two-finger touch) + ctrl-wheel (trackpad pinch) zoom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !zoomable) return;
    const clamp = (z: number) => Math.min(2.5, Math.max(0.5, +z.toFixed(2)));
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    let pinch = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;                     // trackpad pinch → ctrl+wheel
      e.preventDefault();
      setZoom((z) => clamp(z - e.deltaY * 0.01));
    };
    const onStart = (e: TouchEvent) => { if (e.touches.length === 2) pinch = dist(e.touches); };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault();
      const d = dist(e.touches);
      setZoom((z) => clamp(z * (d / pinch)));
      pinch = d;
    };
    const onEnd = () => { pinch = 0; };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [zoomable]);

  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else ref.current?.requestFullscreen?.();
  }, []);

  const height = fs ? Math.max(vh - 96, 320) : defaultHeight;
  const btn = "grid h-7 w-7 place-items-center rounded-md hover:bg-accent transition-colors";

  return (
    <div ref={ref} className={cn("border bg-card", fs ? "flex h-screen flex-col rounded-none p-3" : "rounded-2xl", className)}>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>
        <div className="flex items-center gap-2">
          {viewToggle}
          {right}
          {zoomable && (
            <div className="flex items-center rounded-lg border">
              <button className={btn} title="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}><Minus size={14} /></button>
              <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <button className={btn} title="Zoom in" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}><Plus size={14} /></button>
            </div>
          )}
          <button className={cn(btn, "border")} title={fs ? "Exit fullscreen" : "Fullscreen"} onClick={toggleFs}>
            {fs ? <Shrink size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>
      <div ref={scrollRef} className={cn("p-2 touch-pan-y", fs ? "min-h-0 flex-1 overflow-auto" : "overflow-auto")}>
        <div style={zoomable && zoom !== 1
          ? { transform: `scale(${zoom})`, transformOrigin: "top left", width: `${100 / zoom}%` }
          : undefined}>
          {children({ fullscreen: fs, height, zoom })}
        </div>
      </div>
    </div>
  );
}
