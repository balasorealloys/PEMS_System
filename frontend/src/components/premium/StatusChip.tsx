import { cn } from "../../lib/utils";
import type { Tone } from "../../design-system/status";

// Small pill for state (ok / warn / danger / info / neutral), optional pulsing dot.
const TONE: Record<Tone, string> = {
  success: "text-emerald-700 bg-emerald-500/12 ring-emerald-500/25 dark:text-emerald-300",
  warning: "text-amber-700 bg-amber-500/12 ring-amber-500/25 dark:text-amber-300",
  danger: "text-red-700 bg-red-500/12 ring-red-500/25 dark:text-red-300",
  info: "text-blue-700 bg-blue-500/12 ring-blue-500/25 dark:text-blue-300",
  neutral: "text-slate-600 bg-slate-500/12 ring-slate-500/20 dark:text-slate-300",
};
const DOT: Record<Tone, string> = {
  success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-red-500",
  info: "bg-blue-500", neutral: "bg-slate-400",
};

export default function StatusChip({
  children, tone = "neutral", dot = false, pulse = false, className,
}: {
  children: React.ReactNode; tone?: Tone; dot?: boolean; pulse?: boolean; className?: string;
}) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
      TONE[tone], className,
    )}>
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", DOT[tone])} />}
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", DOT[tone])} />
        </span>
      )}
      {children}
    </span>
  );
}
