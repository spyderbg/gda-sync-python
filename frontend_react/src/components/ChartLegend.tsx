import { classes } from '../classes';

export default function ChartLegend({ items, className }: { items: { label: string; color: string }[]; className?: string }) {
  return (
    <div className={classes('chartjs-legend', className)}>
      <ul>
        {items.map(item => (
          <li key={item.label}><span style={{ backgroundColor: item.color }} />{item.label}</li>
        ))}
      </ul>
    </div>
  );
}
