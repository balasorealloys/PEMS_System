import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts/core";
import type { EChartsOption } from "echarts";
import {
  BarChart, LineChart, PieChart, SankeyChart, GaugeChart, ScatterChart,
} from "echarts/charts";
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  MarkLineComponent, MarkPointComponent, DataZoomComponent, VisualMapComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { axisColors } from "../../design-system/charts";
import { useThemeMode } from "../../hooks/useThemeMode";

// Register only what we use (echarts 6 is tree-shakeable; the root bundle does not
// auto-register sankey in this build).
echarts.use([
  BarChart, LineChart, PieChart, SankeyChart, GaugeChart, ScatterChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  MarkLineComponent, MarkPointComponent, DataZoomComponent, VisualMapComponent,
  CanvasRenderer,
]);

// Theme-aware ECharts wrapper driving echarts directly (ref + ResizeObserver).
// Pass a partial option; base styling (transparent bg, themed axes/tooltip/font)
// is merged in and refreshed on theme toggle.
export default function EChart({
  option, height = 300, className, onEvents,
}: {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  onEvents?: Record<string, (params: unknown) => void>;
}) {
  const mode = useThemeMode();
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const merged = useMemo<EChartsOption>(() => {
    const c = axisColors(mode);
    return {
      backgroundColor: "transparent",
      textStyle: { fontFamily: "Inter, ui-sans-serif, sans-serif", color: c.text },
      tooltip: {
        backgroundColor: c.tooltipBg, borderColor: c.tooltipBorder, borderWidth: 1,
        textStyle: { color: c.text, fontSize: 12 },
        extraCssText: "border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);",
        ...(option.tooltip as object),
      },
      ...option,
    };
  }, [option, mode]);

  // init once
  useEffect(() => {
    if (!elRef.current) return;
    const chart = echarts.init(elRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(elRef.current);
    return () => { ro.disconnect(); chart.dispose(); chartRef.current = null; };
  }, []);

  // apply option
  useEffect(() => {
    chartRef.current?.setOption(merged, true);
  }, [merged]);

  // bind events
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onEvents) return;
    for (const [name, handler] of Object.entries(onEvents)) chart.on(name, handler as (p: unknown) => void);
    return () => { for (const name of Object.keys(onEvents)) chart.off(name); };
  }, [onEvents]);

  return <div ref={elRef} className={className} style={{ height, width: "100%" }} />;
}
