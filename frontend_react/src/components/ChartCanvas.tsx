import type { ChartConfiguration, ChartType } from 'chart.js';
import { useEffect, useRef } from 'react';
import { classes } from '../classes';
import { Chart } from '../charts/chartjs';

export default function ChartCanvas({
  config,
  label,
  height,
  width,
  className,
}: {
  config: ChartConfiguration<ChartType>;
  label: string;
  height: number;
  width?: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  // The Vue watcher is not immediate: the chart is constructed with the first config.
  const skipConfigUpdate = useRef(true);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return undefined;
    const chart = new Chart(element, configRef.current);
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (skipConfigUpdate.current) {
      skipConfigUpdate.current = false;
      return;
    }
    const chart = chartRef.current;
    if (!chart) return;
    chart.data = config.data;
    chart.options = config.options ?? {};
    chart.update();
  }, [config]);

  return (
    <div className={classes('chart-container', className)} style={{ height: `${height}px`, width: width ? `${width}px` : undefined }}>
      <canvas ref={canvas} role="img" aria-label={label} />
    </div>
  );
}
