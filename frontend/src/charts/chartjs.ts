import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler, LinearScale, LineController,
  LineElement, PointElement, RadarController, RadialLinearScale, Tooltip,
} from 'chart.js';

Chart.register(
  ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, LinearScale, LineController,
  LineElement, PointElement, RadarController, RadialLinearScale, Tooltip,
);

// StarAdmin typography and text color ($type-1, $text-muted); tooltips use the theme's dark color.
Chart.defaults.font.family = "'Roboto Variable', 'Roboto', sans-serif";
Chart.defaults.color = '#858585';
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.plugins.tooltip.backgroundColor = '#252c46';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 4;

export type ThemeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'danger' | 'dark';

const FALLBACK: Record<ThemeColor, string> = {
  primary: '#2196f3', secondary: '#dde4eb', success: '#19d895', info: '#8862e0', warning: '#ffaf00', danger: '#ff6258', dark: '#252c46',
};

/** A theme color from the Bootstrap custom properties compiled from the template's $theme-colors. */
export function themeColor(name: ThemeColor) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || FALLBACK[name];
}

export { Chart };
