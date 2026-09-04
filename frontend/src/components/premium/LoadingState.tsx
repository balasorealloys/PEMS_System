import { Loader2 } from "lucide-react";

/** Consistent in-page loading placeholder — a spinner + label, used wherever a
 * page/section is waiting on its first fetch (as opposed to `pending` KPI cards,
 * which already show their own inline "…" state). */
export default function LoadingState({ label = "Loading…", className = "" }: {
  label?: string; className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground ${className}`}>
      <Loader2 size={20} className="animate-spin text-primary" />
      <span>{label}</span>
    </div>
  );
}
