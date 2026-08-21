import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { Tone } from "../../design-system/status";
import AnimatedCounter from "./AnimatedCounter";
import Sparkline from "./Sparkline";
import MetricBadge from "./MetricBadge";

// Tone → accent colour (icon tint, sparkline, top hairline).
const ACCENT: Record<Tone, string> = {
  info: "#2563EB", success: "#10B981", warning: "#F59E0B", danger: "#EF4444", neutral: "#64748B",
};

export default function KPICard({
  label, value, unit, decimals = 0, prefix = "", tone = "info", icon,
  delta, deltaSuffix, deltaGoodWhenUp = true, spark, footnote, pending = false, className,
}: {
  label: string;
  value: number | string;
  unit?: string;
  decimals?: number;
  prefix?: string;
  tone?: Tone;
  icon?: ReactNode;
  delta?: number | null;
  deltaSuffix?: string;
  deltaGoodWhenUp?: boolean;
  spark?: (number | null)[];
  footnote?: ReactNode;
  pending?: boolean;
  className?: string;
}) {
  const accent = ACCENT[tone];
  const numeric = typeof value === "number";
  return (
    <div className={cn(
      "group relative overflow-hidden rounded-2xl border bg-card p-4 shadow-sm",
      "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
      pending && "opacity-70", className,
    )}>
      {/* top accent hairline */}
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent, opacity: 0.85 }} />
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon && (
          <span className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: accent }}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-bold tracking-tight tabular-nums">
          {numeric
            ? <AnimatedCounter value={value} decimals={decimals} prefix={prefix} />
            : <>{prefix}{value}</>}
        </span>
        {unit && <span className="text-sm font-semibold text-muted-foreground">{unit}</span>}
      </div>
      <div className="mt-1.5 flex min-h-4 items-center gap-2 text-xs text-muted-foreground">
        {delta !== undefined && <MetricBadge pct={delta} suffix={deltaSuffix} goodWhenUp={deltaGoodWhenUp} />}
        {footnote}
      </div>
      {spark && spark.filter((v) => v != null).length > 1 && (
        <div className="mt-2 -mb-1">
          <Sparkline data={spark} color={accent} width={240} height={32} />
        </div>
      )}
    </div>
  );
}
