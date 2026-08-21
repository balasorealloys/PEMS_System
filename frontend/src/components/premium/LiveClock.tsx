import { useEffect, useState } from "react";

// Live IST wall-clock for the header — a pulsing "LIVE" dot + the current time
// only (the calendar date lives in the date picker, so we don't repeat it here).
export default function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5" title="Live plant clock (IST)">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Live</span>
      <span className="text-xs font-semibold tabular-nums">{time}</span>
      <span className="text-[10px] text-muted-foreground">IST</span>
    </div>
  );
}
