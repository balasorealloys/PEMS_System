import { cn } from "../../lib/utils";

// Premium surface card with an optional header (title + icon + right-slot).
export function Card({ className, hover = false, ...rest }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card text-card-foreground shadow-sm",
        hover && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHead({
  title, icon, right, className,
}: {
  title: React.ReactNode; icon?: React.ReactNode; right?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-5 pt-4 pb-3", className)}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        {title}
      </div>
      {right}
    </div>
  );
}

export function CardBody({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...rest} />;
}
