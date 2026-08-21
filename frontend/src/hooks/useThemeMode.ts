import { useEffect, useState } from "react";

// Tracks the app theme (data-theme on <html>) and updates when it toggles.
export function useThemeMode(): "light" | "dark" {
  const read = () =>
    (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  const [mode, setMode] = useState<"light" | "dark">(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setMode(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return mode;
}
