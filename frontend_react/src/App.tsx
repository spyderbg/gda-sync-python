import { useEffect } from 'react';
import AppDialogs from './components/AppDialogs';
import AppToast from './components/AppToast';
import StartupState from './components/StartupState';
import { useBackendLifetime } from './hooks/useBackendLifetime';
import AppFooter from './layout/AppFooter';
import AppHeader from './layout/AppHeader';
import AppSidebar from './layout/AppSidebar';
import AssetsLibraryView from './views/AssetsLibraryView';
import BackupsView from './views/BackupsView';
import DashboardView from './views/DashboardView';
import SettingsView from './views/SettingsView';
import SyncHistoryView from './views/SyncHistoryView';
import SyncInProgressView from './views/SyncInProgressView';
import SyncView from './views/SyncView';
import { LIBRARY_VIEWS, load, store, useWorkspace } from './workspace';

export default function App() {
  const { stopped, loadError, data, ui, isLibraryView } = useWorkspace();
  useBackendLifetime(!stopped);

  useEffect(() => {
    const loading = new AbortController();
    void load(loading.signal);
    return () => loading.abort();
  }, []);

  useEffect(() => {
    const visibleSearch = () => [...document.querySelectorAll<HTMLInputElement>('[data-asset-search]')].find(input => input.offsetParent !== null);
    async function focusSearch() {
      if (!visibleSearch()) {
        if (!LIBRARY_VIEWS.includes(store.ui.view)) store.ui.view = 'library';
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      visibleSearch()?.focus();
    }
    function onKeydown(event: KeyboardEvent) {
      const field = ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName);
      if (((event.ctrlKey || event.metaKey) && event.key === 'k') || (event.key === '/' && !field)) {
        event.preventDefault();
        void focusSearch();
      }
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, []);

  if (stopped) return <StartupState kind="closed" />;
  if (loadError) return <StartupState kind="error" />;
  if (!data) return <StartupState kind="loading" />;
  return (
    <div className="container-scroller">
      <AppHeader />
      <div className="container-fluid page-body-wrapper">
        <AppSidebar />
        <div className="main-panel">
          <div className="content-wrapper">
            {ui.view === 'dashboard' ? <DashboardView />
              : ui.view === 'pending' ? <SyncView />
                : isLibraryView ? <AssetsLibraryView />
                  : ui.view === 'rssSync' ? <SyncInProgressView />
                    : ui.view === 'history' ? <SyncHistoryView />
                      : ui.view === 'backups' ? <BackupsView />
                        : ui.view === 'settings' ? <SettingsView />
                          : null}
          </div>
          <AppFooter />
        </div>
      </div>
      <AppToast />
      <AppDialogs />
    </div>
  );
}
