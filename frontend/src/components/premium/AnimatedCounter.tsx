import { useEffect, useRef, useState } from "react";

// Smoothly tweens a number to its new value (ease-out). Honors prefers-reduced-motion.
export default function AnimatedCounter({
  value, decimals = 0, duration = 900, prefix = "", suffix = "", className,
}: {
  value: number; decimals?: number; duration?: number;
  prefix?: string; suffix?: string; className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) { setDisplay(to); fromRef.current = to; return; }

    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs == null) startTs = ts;
      const t = Math.min((ts - startTs) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  const text = display.toLocaleString("en-IN", {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
  return <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>{prefix}{text}{suffix}</span>;
}
