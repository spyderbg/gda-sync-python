import { classes } from '../classes';

export default function StartupState({ kind }: { kind: 'loading' | 'error' | 'closed' }) {
  const reload = () => window.location.reload();
  return (
    <div className="container-scroller">
      <div className="container-fluid page-body-wrapper full-page-wrapper">
        <div className="content-wrapper d-flex align-items-center text-center error-page startup-page">
          <div className="row flex-grow">
            <div className="col-lg-6 mx-auto text-white">
              <div className="startup-mark"><i aria-hidden="true" className={classes('mdi', kind === 'loading' ? 'mdi-sync mdi-spin' : kind === 'error' ? 'mdi-lan-disconnect' : 'mdi-check-all')} /></div>
              {kind === 'closed' ? (
                <>
                  <h1>Workspace closed.</h1>
                  <p>Your files, settings, and history are saved on your machine.<br />Launch EGT GDA Sync to pick up where you left off.</p>
                </>
              ) : kind === 'error' ? (
                <>
                  <h1>Couldn’t connect to your workspace</h1>
                  <button type="button" className="btn btn-light btn-lg" onClick={reload}><i aria-hidden="true" className="mdi mdi-refresh" />Try again</button>
                </>
              ) : (
                <>
                  <h1>Opening your workspace</h1>
                  <p>Getting your assets ready…</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
