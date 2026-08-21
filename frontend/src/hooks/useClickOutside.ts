import { useEffect, type RefObject } from "react";

// Calls `handler` when a pointerdown / Escape happens outside `ref`. Active only when `when`.
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>, handler: () => void, when = true,
) {
  useEffect(() => {
    if (!when) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handler(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, handler, when]);
}
