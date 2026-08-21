import { useMemo, useRef, useState } from "react";
import {
  addDays, addMonths, endOfMonth, endOfQuarter, format, isAfter, isBefore, isSameDay,
  isWithinInterval, startOfMonth, startOfQuarter, startOfWeek, subDays, subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../lib/utils";
import { useScope } from "../../stores/scope";
import { useClickOutside } from "../../hooks/useClickOutside";

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

// Indian financial year (Apr 1 – Mar 31).
function fyBounds(now: Date): [Date, Date] {
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [new Date(y, 3, 1), new Date(y + 1, 2, 31)];
}

function presets(now: Date): { label: string; range: () => [Date, Date] }[] {
  return [
    { label: "Today", range: () => [now, now] },
    { label: "Last 7 Days", range: () => [subDays(now, 6), now] },
    { label: "Last 30 Days", range: () => [subDays(now, 29), now] },
    { label: "This Month", range: () => [startOfMonth(now), endOfMonth(now)] },
    { label: "Last Month", range: () => [startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1))] },
    { label: "This Quarter", range: () => [startOfQuarter(now), endOfQuarter(now)] },
    { label: "This FY", range: () => fyBounds(now) },
  ];
}

function monthGrid(month: Date): Date[] {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 }); // Mon-first
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d;
  });
}

const WD = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function Month({
  month, start, end, hover, onPick, onHover, onSelectMonth, onSelectYear,
}: {
  month: Date; start: Date | null; end: Date | null; hover: Date | null;
  onPick: (d: Date) => void; onHover: (d: Date | null) => void;
  onSelectMonth: (m: Date) => void; onSelectYear: (m: Date) => void;
}) {
  const days = monthGrid(month);
  const rangeEnd = end ?? hover;
  return (
    <div className="w-[15rem]">
      <div className="mb-2 flex items-center justify-center gap-1 text-xs font-semibold">
        <button className="rounded px-1.5 py-0.5 hover:bg-accent" title="Select whole month"
          onClick={() => onSelectMonth(month)}>{format(month, "MMMM")}</button>
        <button className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent" title="Select whole year"
          onClick={() => onSelectYear(month)}>{format(month, "yyyy")}</button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] font-medium text-muted-foreground">
        {WD.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === month.getMonth();
          const isStart = start && isSameDay(d, start);
          const isEnd = rangeEnd && isSameDay(d, rangeEnd);
          const lo = start && rangeEnd ? (isBefore(start, rangeEnd) ? start : rangeEnd) : null;
          const hi = start && rangeEnd ? (isAfter(rangeEnd, start) ? rangeEnd : start) : null;
          const inRange = lo && hi && isWithinInterval(d, { start: lo, end: hi });
          const edge = isStart || isEnd;
          return (
            <button
              key={i}
              onClick={() => onPick(d)}
              onMouseEnter={() => onHover(d)}
              className={cn(
                "mx-auto grid h-7 w-7 place-items-center rounded-md text-xs tabular-nums transition-colors",
                !inMonth && "text-muted-foreground/40",
                inRange && !edge && "bg-primary/12",
                edge && "bg-primary text-primary-foreground font-semibold",
                !edge && inMonth && "hover:bg-accent",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DateRangePicker() {
  const { range, setRange } = useScope();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [hover, setHover] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(parse(range.end)));
  const ref = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);
  useClickOutside(ref, () => setOpen(false), open);

  const openPanel = () => {
    setStart(parse(range.start));
    setEnd(parse(range.end));
    setHover(null);
    setViewMonth(startOfMonth(parse(range.end)));
    setOpen(true);
  };

  const commit = (lo: Date, hi: Date, preset: string) => {
    setRange({ start: iso(lo), end: iso(hi), preset });
    setOpen(false);
  };

  // two-click selection: 1st click = start (clears end); 2nd click = end → auto-apply
  const pick = (d: Date) => {
    if (!start || end) { setStart(d); setEnd(null); return; }
    const [lo, hi] = isBefore(d, start) ? [d, start] : [start, d];
    setEnd(hi);
    commit(lo, hi, "Custom");
  };

  const applyPreset = (label: string, [s, e]: [Date, Date]) => commit(s, e, label);

  // clicking the month title selects that whole month; the year selects the whole
  // year (Jan 1 → today for the current year, else → Dec 31).
  const selectMonth = (m: Date) => commit(startOfMonth(m), endOfMonth(m), "Custom");
  const selectYear = (m: Date) => {
    const y = m.getFullYear();
    const hi = y === now.getFullYear() ? now : new Date(y, 11, 31);
    commit(new Date(y, 0, 1), hi, "Custom");
  };

  const label = range.preset !== "Custom"
    ? range.preset
    : range.start === range.end
      ? format(parse(range.start), "dd MMM yyyy")
      : `${format(parse(range.start), "dd MMM")} – ${format(parse(range.end), "dd MMM yyyy")}`;

  // step the whole window backward / forward by its own width (1 day for a single day)
  const shift = (dir: -1 | 1) => {
    const s = parse(range.start), e = parse(range.end);
    const width = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    setRange({ start: iso(addDays(s, dir * width)), end: iso(addDays(e, dir * width)), preset: "Custom" });
  };

  return (
    <div ref={ref} className="relative flex items-center gap-0.5">
      <button title="Previous" onClick={() => shift(-1)}
        className="grid h-8 w-6 place-items-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <ChevronLeft size={15} />
      </button>
      <button
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-accent"
      >
        <CalendarDays size={15} className="text-muted-foreground" />
        {label}
      </button>
      <button title="Next" onClick={() => shift(1)}
        className="grid h-8 w-6 place-items-center rounded-lg border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <ChevronRight size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 flex overflow-hidden rounded-xl border bg-popover shadow-xl anim-scale-in">
          {/* presets */}
          <div className="w-36 border-r bg-muted/30 p-2">
            {presets(now).map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.label, p.range())}
                className={cn(
                  "block w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-accent",
                  range.preset === p.label && "bg-primary/12 text-primary",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* calendar */}
          <div className="p-3" onMouseLeave={() => setHover(null)}>
            <div className="mb-1 flex items-center justify-between">
              <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-accent" onClick={() => setViewMonth((m) => subMonths(m, 1))}>
                <ChevronLeft size={16} />
              </button>
              <button className="grid h-7 w-7 place-items-center rounded-md hover:bg-accent" onClick={() => setViewMonth((m) => addMonths(m, 1))}>
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="flex gap-5">
              <Month month={viewMonth} start={start} end={end} hover={hover} onPick={pick} onHover={setHover} onSelectMonth={selectMonth} onSelectYear={selectYear} />
              <Month month={addMonths(viewMonth, 1)} start={start} end={end} hover={hover} onPick={pick} onHover={setHover} onSelectMonth={selectMonth} onSelectYear={selectYear} />
            </div>
            <div className="mt-3 border-t pt-2 text-center text-[11px] text-muted-foreground">
              {start && !end
                ? `Start ${format(start, "dd MMM yyyy")} — click an end date`
                : "Click a start then an end date · or click a month / year heading"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
