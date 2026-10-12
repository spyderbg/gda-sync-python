import { classes } from '../classes';
import { useWorkspace } from '../workspace';

// A sync view without a result explains why there is no report to show.
const MESSAGES = {
  unknown: { icon: 'mdi-help-circle-outline', title: 'The GDA sync status could not be read', text: 'Reload the page. If this keeps happening, check that the application is still running.' },
  creating: { icon: 'mdi-loading mdi-spin', title: 'Creating the first GDA sync report…', text: 'The comparison runs in the background. The report appears here when it ends.' },
  none: { icon: 'mdi-file-search-outline', title: 'No GDA sync report yet', text: 'This workspace has not been compared with its GDA folder. Click Rescan to run the first GDA sync and create its report.' },
  failed: { icon: 'mdi-file-alert-outline', title: 'No successful GDA sync yet', text: 'Every run of this workspace so far has failed, so there is no result to show. See the error on this page, then click Rescan.' },
} as const;

export default function ReportNotice() {
  const { reportState } = useWorkspace();
  if (reportState === 'ready') return null;
  const message = MESSAGES[reportState];
  return (
    <div className="card report-notice grid-margin" role="status">
      <div className="card-body">
        <i aria-hidden="true" className={classes('mdi', 'report-notice-icon', message.icon, 'text-muted')} />
        <h4>{message.title}</h4>
        <p className="text-muted">{message.text}</p>
      </div>
    </div>
  );
}
