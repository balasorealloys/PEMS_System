import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "../../lib/utils";

// Delta indicator: coloured arrow + percentage. `goodWhenUp` flips the colour semantics
// (e.g. cost going down is good).
export default function MetricBadge({
  pct, suffix, goodWhenUp = true, className,
}: {
  pct: number | null; suffix?: string; goodWhenUp?: boolean; className?: string;
}) {
  if (pct == null) return <span className={cn("text-xs text-muted-foreground", className)}>— {suffix}</span>;
  const up = pct > 0;
  const flat = pct === 0;
  const good = flat ? true : up === goodWhenUp;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
      flat ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      className,
    )}>
      <Icon size={13} strokeWidth={2.5} />
      {Math.abs(pct).toFixed(1)}%
      {suffix && <span className="font-normal text-muted-foreground"> {suffix}</span>}
    </span>
  );
}
