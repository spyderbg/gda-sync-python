import { classes } from '../classes';
import { statusBadges, statusNames } from '../format';
import type { AssetStatus } from '../types';

const icons: Record<AssetStatus, string> = { new: 'mdi-plus-circle-outline', modified: 'mdi-pencil-circle-outline', synced: 'mdi-check' };

export default function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <span className={classes('badge', 'status-badge', statusBadges[status])}><i aria-hidden="true" className={classes('mdi', icons[status])} />{statusNames[status]}</span>
  );
}
