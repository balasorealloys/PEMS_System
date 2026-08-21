import { useRef, useState } from "react";
import { Check, ChevronDown, Factory } from "lucide-react";
import { cn } from "../../lib/utils";
import { useScope, type PlantKey } from "../../stores/scope";
import { useClickOutside } from "../../hooks/useClickOutside";

const PLANTS: { key: PlantKey; label: string }[] = [
  { key: "all", label: "All Plants" },
  { key: "balasore", label: "Balasore" },
  { key: "jajpur", label: "Jajpur" },
];

export default function PlantSelector() {
  const { plant, setPlant } = useScope();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const current = PLANTS.find((p) => p.key === plant) ?? PLANTS[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
      >
        <Factory size={15} className="text-muted-foreground" />
        {current.label}
        <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-40 overflow-hidden rounded-xl border bg-popover p-1 shadow-lg anim-scale-in">
          {PLANTS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPlant(p.key); setOpen(false); }}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors hover:bg-accent",
                p.key === plant && "text-primary",
              )}
            >
              {p.label}
              {p.key === plant && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
