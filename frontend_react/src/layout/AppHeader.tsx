import { classes } from '../classes';
import { navigate, useWorkspace } from '../workspace';

export default function AppHeader() {
  const { config, ui } = useWorkspace();
  const title = ui.view === 'dashboard' ? 'Dashboard' : config.name;
  return (
    <header className="app-header navbar default-layout col-lg-12 col-12 p-0 fixed-top d-flex flex-row">
      <div className="text-center navbar-brand-wrapper d-flex align-items-top justify-content-center">
        <a className="navbar-brand brand-logo" href="#" aria-current={ui.view === 'dashboard' ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate('dashboard'); }}>
          <img className="brand-mark" src="/app-icon.png" alt="" /><span className="brand-text">EGT GDA Sync</span>
        </a>
        <a className="navbar-brand brand-logo-mini" href="#" aria-label="Toggle navigation" aria-expanded={ui.sidebarOpen} aria-controls="sidebar" onClick={event => { event.preventDefault(); ui.sidebarOpen = !ui.sidebarOpen; }}>
          <img className="brand-mark" src="/app-icon.png" alt="" />
        </a>
      </div>
      <div className="navbar-menu-wrapper d-flex align-items-center">
        <span className="navbar-game-title" title={title}>{title}</span>
        {/* Settings belong to one workspace, so the dashboard does not offer them. */}
        {ui.view !== 'dashboard' ? (
          <button type="button" className={classes('header-settings', { active: ui.view === 'settings' })} aria-label="Workspace settings" title="Workspace settings" aria-current={ui.view === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')}>
            <i aria-hidden="true" className="mdi mdi-cog-outline" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
