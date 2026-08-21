import { useId } from "react";

// Dependency-free inline SVG sparkline with a soft gradient fill.
export default function Sparkline({
  data, color = "#2563EB", width = 120, height = 34, strokeWidth = 1.75, fill = true,
}: {
  data: (number | null)[]; color?: string; width?: number; height?: number;
  strokeWidth?: number; fill?: boolean;
}) {
  const id = useId();
  const pts = data.filter((v): v is number => v != null);
  if (pts.length < 2) return <svg width={width} height={height} aria-hidden />;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = width / (pts.length - 1);
  const x = (i: number) => i * step;
  const y = (v: number) => height - ((v - min) / span) * (height - strokeWidth) - strokeWidth / 2;

  const line = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`sl-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#sl-${id})`} stroke="none" />}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
