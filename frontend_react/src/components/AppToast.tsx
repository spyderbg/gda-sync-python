import { classes } from '../classes';
import { clearToast, useWorkspace } from '../workspace';

export default function AppToast() {
  const { toast } = useWorkspace();
  if (!toast) return null;
  return (
    <div className="app-toast">
      <div className={classes('toast', 'show', toast.error ? 'toast-error' : 'toast-success')} role="status">
        <div className="toast-body">
          <i aria-hidden="true" className={classes('mdi', toast.error ? 'mdi-alert-circle-outline text-danger' : 'mdi-check-circle-outline text-success')} /><span>{toast.text}</span><button type="button" className="close" aria-label="Dismiss notification" onClick={clearToast}><span aria-hidden="true">&times;</span></button>
        </div>
      </div>
    </div>
  );
}
