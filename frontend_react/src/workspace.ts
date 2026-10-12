// Application state shared by the layout and the views, and the actions that talk to the backend.
import { useSyncExternalStore } from 'react';
import { commonAction, plural, resourceAction, viewSaves, type GdaCandidate } from './format';
import type { Asset, AssetSection, LibraryResponse, RestoreResult, RssFileDetails, RssResource, RssSyncHistory, RssSyncStatus, Session, SyncResult, View, ViewLayout, WorkspaceConfig } from './types';

const INVALID_SESSION = 'Invalid session. Reload the application.';
const RSS_POLL_MS = 1000;
export const LIBRARY_VIEWS: View[] = ['library', 'pending'];
export const PAGE_NAMES: Record<View, string> = {
  dashboard: 'Dashboard', library: 'Asset library', pending: 'Sync', rssSync: 'Sync in progress', history: 'Sync history', backups: 'Backups',
  settings: 'Workspace settings',
};

type Busy = '' | 'scan' | 'sync' | 'report' | 'settings' | 'shutdown' | 'delete-report' | 'restore';

export interface AppStore {
  data: LibraryResponse | null;
  rssSync: RssSyncStatus | null;
  session: { token: string; version: string; platform: string };
  loadError: string;
  stopped: boolean;
  busy: Busy;
  applying: ReturnType<typeof commonAction>;
  toast: { text: string; error?: boolean } | null;
  ui: {
    view: View;
    category: AssetSection | 'all';
    query: string;
    layout: 'grid' | 'list';
    inspecting: string | null;
    resourceActions: RssResource[] | null;
    resourceChoices: Record<string, GdaCandidate>;
    help: boolean;
    shutdownConfirm: boolean;
    sidebarOpen: boolean;
  };
}

const listeners = new Set<() => void>();
let version = 0;
let depth = 0;
let dirty = false;

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion() {
  return version;
}

function emit() {
  if (depth > 0) {
    dirty = true;
    return;
  }
  dirty = false;
  version += 1;
  for (const listener of [...listeners]) listener();
}

function batch(run: () => void) {
  depth += 1;
  try {
    run();
  } finally {
    depth -= 1;
    if (depth === 0 && dirty) emit();
  }
}

function watchable<T extends object>(target: T, onSet?: (key: PropertyKey, value: unknown, previous: unknown) => void): T {
  return new Proxy(target, {
    set(obj, key, value) {
      const record = obj as Record<PropertyKey, unknown>;
      const previous = record[key];
      if (Object.is(previous, value)) return true;
      record[key] = value;
      onSet?.(key, value, previous);
      emit();
      return true;
    },
  });
}

const uiState: AppStore['ui'] = {
  view: 'dashboard',
  category: 'all',
  query: '',
  layout: 'grid',
  inspecting: null,
  resourceActions: null,
  resourceChoices: {},
  help: false,
  shutdownConfirm: false,
  sidebarOpen: false,
};

const ui = watchable(uiState, (key, value) => {
  // Searching from any page shows the matching assets.
  if (key === 'query' && typeof value === 'string' && value && !LIBRARY_VIEWS.includes(uiState.view)) uiState.view = 'library';
});

const raw: AppStore = {
  data: null,
  rssSync: null,
  session: { token: '', version: '', platform: '' },
  loadError: '',
  stopped: false,
  busy: '',
  applying: null,
  toast: null,
  ui,
};

let toastTimer: number | undefined;
let rssTimer: number | undefined;

function scheduleToast(value: AppStore['toast']) {
  clearTimeout(toastTimer);
  if (value) toastTimer = window.setTimeout(() => { store.toast = null; }, value.error ? 9000 : 4500);
}

function handleRss(status: RssSyncStatus | null, previous: RssSyncStatus | null) {
  clearTimeout(rssTimer);
  if (status?.running) rssTimer = window.setTimeout(() => { void refreshRssSync(); }, RSS_POLL_MS);
  else if (status && previous?.running && previous.workspaceId === status.workspaceId && status.lastRun) {
    const { lastRun, summary } = status;
    if (lastRun.state === 'failed') notify(`GDA sync failed: ${lastRun.error}`, true);
    else if (summary) notify(`GDA sync finished: ${summary.identical} in sync, ${summary.missing} missing, ${summary.different} different, ${summary.invalid} invalid, ${summary.supplementary ?? 0} supplementary.`);
  }
}

export const store = watchable(raw, (key, value, previous) => {
  if (key === 'toast') scheduleToast(value as AppStore['toast']);
  if (key === 'rssSync') handleRss(value as RssSyncStatus | null, previous as RssSyncStatus | null);
});

function reportState(): 'unknown' | 'creating' | 'none' | 'failed' | 'ready' {
  const status = store.rssSync;
  if (!status) return 'unknown';
  if (status.summary) return 'ready';
  if (status.running) return 'creating';
  return status.reportPath ? 'failed' : 'none';
}

/** The assets of a library section; a report from before version 6 counts only types, so its textures are its images. */
export function countSection(section: AssetSection) {
  const summary = store.data?.assetReport?.summary;
  if (!summary) return 0;
  if (summary.sections) return summary.sections[section] ?? 0;
  return section === 'image' ? summary.types.texture ?? 0 : section === 'sequence' ? 0 : summary.types[section] ?? 0;
}

/** Live store values. Assign fields of the returned `ui` object from event handlers; each assignment redraws the app. */
export function useWorkspace() {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  const assetReport = store.data?.assetReport ?? null;
  return {
    data: store.data,
    rssSync: store.rssSync,
    activeSyncCount: store.rssSync?.running ? 1 : 0,
    reportState: reportState(),
    session: store.session,
    loadError: store.loadError,
    stopped: store.stopped,
    busy: store.busy,
    applying: store.applying,
    toast: store.toast,
    ui: store.ui,
    config: store.data?.config as WorkspaceConfig,
    workspaces: store.data?.config.workspaces || [],
    assetReport,
    assetCount: assetReport?.summary?.assets ?? 0,
    totalSize: assetReport?.summary?.size ?? 0,
    isLibraryView: LIBRARY_VIEWS.includes(store.ui.view),
    countSection,
  };
}

export function notify(text: string, isError = false) {
  store.toast = { text, error: isError };
}

export function clearToast() {
  store.toast = null;
}

function applySession(value: Session) {
  store.session.token = value.token;
  store.session.version = value.version;
  store.session.platform = value.platform;
  emit();
}

function applyLibrary(library: LibraryResponse) {
  batch(() => {
    store.data = library;
    store.rssSync = library.rssSync;
  });
}

async function refreshRssSync() {
  try {
    store.rssSync = await getJSON<RssSyncStatus>('/api/rss-sync');
  } catch {
    rssTimer = window.setTimeout(() => { void refreshRssSync(); }, RSS_POLL_MS * 3);
  }
}

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body as T;
}

export async function load(signal: AbortSignal) {
  try {
    const [value, library] = await Promise.all([getJSON<Session>('/api/session', signal), getJSON<LibraryResponse>('/api/library', signal)]);
    applySession(value);
    applyLibrary(library);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') store.loadError = (e as Error).message;
  }
}

async function api<T>(path: string, method = 'POST', body?: unknown): Promise<T> {
  const send = (token: string) => fetch(`/api/${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'x-gda-token': token },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let response = await send(store.session.token);
  let value = await response.json();
  if (response.status === 403 && value.error === INVALID_SESSION) {
    // A backend restart rotates its token. Retry only a rejected, unapplied request.
    const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
    if (sessionResponse.ok) {
      applySession(await sessionResponse.json());
      response = await send(store.session.token);
      value = await response.json();
    }
  }
  if (!response.ok) throw new Error(value.error || 'Request failed');
  return value as T;
}

export function navigate(view: View, category: AssetSection | 'all' = 'all') {
  batch(() => {
    store.ui.view = view;
    store.ui.category = category;
    store.ui.query = '';
    store.ui.inspecting = null;
    store.ui.sidebarOpen = false;
  });
}

/** Show an asset of the dashboard, a GDA file, in the asset library: the game's assets with its name. */
export function inspect(asset: Asset) {
  if (!LIBRARY_VIEWS.includes(store.ui.view)) navigate('library');
  store.ui.query = asset.name;
}

export async function rescan() {
  store.busy = 'scan';
  try {
    const library = await api<LibraryResponse>('scan');
    applyLibrary(library);
    notify('GDA sync started. The Sync page shows its report when it ends.');
  } catch (e) { notify((e as Error).message, true); } finally { store.busy = ''; }
}

/** Write a new asset report of the active workspace's game, which the asset library then shows. */
export async function generateAssetReport() {
  store.busy = 'report';
  try {
    const library = await api<LibraryResponse>('asset-report');
    applyLibrary(library);
    const summary = library.assetReport.summary;
    if (summary) notify(`Asset report generated: ${summary.assets} assets, ${summary.missing} missing, ${summary.invalid} invalid, ${summary.supplementary} supplementary.`);
  } catch (e) { notify((e as Error).message, true); } finally { store.busy = ''; }
}

/** What confirming a resource does: its action, or a sync for a missing image that a GDA image was chosen for. */
export const pendingAction = (row: RssResource) => resourceAction(row) ?? (store.ui.resourceChoices[row.id] ? 'sync' : null);

/** Ask to copy a GDA file of each "different" resource of the GDA sync report over the game resource: the chosen GDA
 * image of an image (choices, by row id), which can also sync a missing one, otherwise the closest GDA file. */
export function requestResourceSync(rows: RssResource[], choices: Record<string, GdaCandidate> = {}) {
  batch(() => {
    store.ui.resourceChoices = choices;
    store.ui.resourceActions = rows.filter(row => pendingAction(row) === 'sync');
  });
}

/** Ask to apply the action of each resource of the GDA sync report that has one: sync a different resource, from its
 * chosen GDA image when it has one, remove the declarations of an invalid one, or delete a supplementary one. */
export function requestResourceActions(rows: RssResource[], choices: Record<string, GdaCandidate> = {}) {
  batch(() => {
    store.ui.resourceChoices = choices;
    store.ui.resourceActions = rows.filter(row => pendingAction(row));
  });
}

export async function confirmResourceActions() {
  if (!store.ui.resourceActions) return;
  const rows = store.ui.resourceActions;
  // The GDA image each image is synced from, by row id.
  const gdaFiles = Object.fromEntries(rows.filter(row => store.ui.resourceChoices[row.id]).map(row => [row.id, store.ui.resourceChoices[row.id].absolutePath]));
  const actions = new Set(rows.map(pendingAction));
  store.ui.resourceActions = null;
  store.busy = 'sync';
  store.applying = actions.size > 1 ? 'mixed' : [...actions][0] ?? null;
  try {
    // Copies alone go to the endpoint that can only copy. Otherwise each resource names the status it was chosen with,
    // so the backend refuses one that a newer report gives another status, and another action.
    const result = store.applying === 'sync'
      ? await api<SyncResult>('rss-sync/copy', 'POST', { ids: rows.map(row => row.id), gdaFiles })
      : await api<SyncResult>('rss-sync/apply', 'POST', {
        resources: rows.map(row => ({ id: row.id, category: row.category, ...(gdaFiles[row.id] ? { gdaFile: gdaFiles[row.id] } : {}) })),
      });
    applyLibrary(result.library);
    // An image sequence is one resource, however many of its files were copied or deleted.
    const synced = result.resources ?? result.copied.length;
    const done = [
      synced ? `${synced} resource${plural(synced)} synced` : '',
      result.removed ? `${result.removed} invalid resource${plural(result.removed)} removed from the descriptors` : '',
      result.deleted ? `${result.deleted} supplementary resource${plural(result.deleted)} deleted` : '',
    ].filter(Boolean).join(', ');
    const [failure] = result.failures;
    if (failure) notify(`${done || 'Nothing changed'}; ${result.failures.length} failed. ${failure.name}: ${failure.message}`, true);
    else notify(`${done ? `${done[0].toUpperCase()}${done.slice(1)}.` : 'These resources are already in sync.'} Comparing again to update the report.`);
  } catch (e) { notify((e as Error).message, true); } finally { store.busy = ''; store.applying = null; }
}

export async function openFolder(folder: 'source' | 'destination') {
  try {
    await api('open-folder', 'POST', { folder });
    notify(`Opened ${folder === 'source' ? 'GDA' : 'Game'} folder.`);
  } catch (e) { notify((e as Error).message, true); }
}

/** The size, time and image dimensions of files the GDA sync report names, by their absolute paths, and a font's names,
 * glyph count and coverage of each of the given declared character lists. */
export async function resourceDetails(files: string[], chars: string[] = []) {
  return (await api<{ files: Record<string, RssFileDetails> }>('rss-sync/details', 'POST', { files, chars })).files;
}

/** Open the folder a report file is in, or with isFolder, the report folder it names. */
export async function openResourceFolder(file: string, isFolder = false) {
  try {
    await api('rss-sync/open-folder', 'POST', { file, isFolder });
    notify('Opened folder.');
  } catch (e) { notify((e as Error).message, true); }
}

/** Copy an operation's backups back where they were: the given files, or all of them. The files there now are backed
 * up first. Returns what was restored, or null when nothing could be. */
export async function restoreBackup(id: string, files?: string[]) {
  store.busy = 'restore';
  try {
    const result = await api<RestoreResult>('backups/restore', 'POST', { id, ...(files ? { files } : {}) });
    applyLibrary(result.library);
    const parts = [
      result.restored.length ? `Restored ${result.restored.length} file${plural(result.restored.length)}.` : 'Nothing to restore.',
      result.skipped.length ? `${result.skipped.length} already the same as the backup.` : '',
      result.failures.length ? `${result.failures.length} could not be restored: ${result.failures[0].name}: ${result.failures[0].message}` : '',
    ];
    notify(parts.filter(Boolean).join(' '), result.failures.length > 0);
    return result;
  } catch (e) {
    notify((e as Error).message, true);
    return null;
  } finally { store.busy = ''; }
}

/** Delete one GDA sync report of the active workspace, by its file name. Returns the history left, or null when it
 * could not be deleted. */
export async function deleteSyncReport(file: string) {
  store.busy = 'delete-report';
  try {
    const result = await api<RssSyncHistory & { library: LibraryResponse }>('rss-sync/delete-report', 'POST', { file });
    applyLibrary(result.library);
    notify(`Deleted the GDA sync report ${file}.`);
    return result as RssSyncHistory;
  } catch (e) {
    notify((e as Error).message, true);
    return null;
  } finally { store.busy = ''; }
}

/** Write the new positions of a view's elements, by index, into its file, from the layout of the given revision; the
 * view's renders are asked for again. Returns its new layout, or null when it could not be saved. */
export async function saveViewPositions(file: string, name: string, revision: string, positions: { index: number; x: number; y: number }[]) {
  try {
    const result = await api<{ layout: ViewLayout; library: LibraryResponse }>('rss-sync/view-positions', 'POST', { file, revision, positions });
    viewSaves[file] = (viewSaves[file] ?? 0) + 1;
    applyLibrary(result.library);
    notify(`Saved the position${plural(positions.length)} of ${positions.length} element${plural(positions.length)} in ${name}.`);
    return result.layout;
  } catch (e) {
    notify((e as Error).message, true);
    return null;
  }
}

export async function openDeclaration(descriptor: string, line: number) {
  try {
    await api('rss-sync/open-declaration', 'POST', { descriptor, line });
    notify('Opened declaration in VS Code.');
  } catch (e) { notify((e as Error).message, true); }
}

export async function openViewElement(file: string, index: number) {
  try {
    await api('rss-sync/open-view-element', 'POST', { file, index });
    notify('Opened view element in VS Code.');
  } catch (e) { notify((e as Error).message, true); }
}

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify('Path copied to clipboard.');
  } catch { notify('Clipboard access is unavailable in this browser.', true); }
}

export async function saveSettings(settings: Pick<WorkspaceConfig, 'name' | 'source' | 'destination'>) {
  store.busy = 'settings';
  try {
    const library = await api<LibraryResponse>('settings', 'PUT', settings);
    applyLibrary(library);
    navigate('library');
    notify(library.missingFolders.length ? 'Workspace saved, but a folder does not exist. Check Workspace settings.' : 'Workspace connected successfully.');
    return true;
  } catch (e) {
    notify((e as Error).message, true);
    return false;
  } finally { store.busy = ''; }
}

export async function selectWorkspace(id: string) {
  if (store.busy || id === store.data?.config.defaultWorkspace) return;
  store.busy = 'settings';
  try {
    const library = await api<LibraryResponse>('workspace', 'PUT', { id });
    batch(() => {
      store.ui.inspecting = null;
      store.ui.resourceActions = null;
    });
    applyLibrary(library);
    navigate('dashboard');
    notify(`Switched to ${library.config.name}.`);
  } catch (e) { notify((e as Error).message, true); } finally { store.busy = ''; }
}

export async function stopApplication() {
  store.ui.shutdownConfirm = false;
  store.busy = 'shutdown';
  try {
    await api('shutdown');
    store.stopped = true;
  } catch (e) { notify((e as Error).message, true); } finally { store.busy = ''; }
}
