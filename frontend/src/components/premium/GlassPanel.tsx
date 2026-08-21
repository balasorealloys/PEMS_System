import { cn } from "../../lib/utils";

// Frosted translucent surface — use for overlays, popovers, floating toolbars.
export default function GlassPanel({
  children, className, ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/40 bg-white/70 shadow-lg backdrop-blur-xl",
        "dark:border-white/10 dark:bg-slate-900/60",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
