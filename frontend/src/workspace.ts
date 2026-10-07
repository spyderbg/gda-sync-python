// Application state shared by the layout and the views, and the actions that talk to the backend.
import { computed, reactive, ref, watch } from 'vue';
import { commonAction, plural, resourceAction } from './format';
import type { Asset, AssetType, LibraryResponse, RssFileDetails, RssResource, RssSyncStatus, Session, SyncResult, View, WorkspaceConfig } from './types';

const INVALID_SESSION = 'Invalid session. Reload the application.';
const RSS_POLL_MS = 1000;
export const LIBRARY_VIEWS: View[] = ['library', 'pending'];
export const PAGE_NAMES: Record<View, string> = {
  dashboard: 'Dashboard', library: 'Asset library', pending: 'Sync', rssSync: 'Sync in progress', history: 'Sync history', settings: 'Workspace settings',
};

export const data = ref<LibraryResponse | null>(null);
/** The active workspace's GDA sync: whether it is running, and the summary of its latest report. */
export const rssSync = ref<RssSyncStatus | null>(null);
// The backend allows one active comparison per workspace.
export const activeSyncCount = computed(() => rssSync.value?.running ? 1 : 0);
/** What the loaded GDA sync report allows the sync views to show: none yet, only failed runs, or a result. */
export const reportState = computed<'unknown' | 'creating' | 'none' | 'failed' | 'ready'>(() => {
  const status = rssSync.value;
  if (!status) return 'unknown';
  if (status.summary) return 'ready';
  if (status.running) return 'creating';
  return status.reportPath ? 'failed' : 'none';
});
export const session = reactive({ token: '', version: '', platform: '' });
export const loadError = ref('');
export const stopped = ref(false);
export const busy = ref<'' | 'scan' | 'sync' | 'settings' | 'shutdown'>('');
/** What the GDA sync report resources being applied do, while busy is "sync" for them. */
export const applying = ref<ReturnType<typeof commonAction>>(null);
export const toast = ref<{ text: string; error?: boolean } | null>(null);

export const ui = reactive({
  view: 'dashboard' as View,
  category: 'all' as AssetType | 'all',
  query: '',
  layout: 'grid' as 'grid' | 'list',
  /** The asset whose details dialog is open. */
  inspecting: null as string | null,
  /** GDA sync report resources whose action waits for confirmation. */
  resourceActions: null as RssResource[] | null,
  help: false,
  shutdownConfirm: false,
  sidebarOpen: false,
});

export const config = computed(() => data.value?.config as WorkspaceConfig);
export const workspaces = computed(() => config.value?.workspaces || []);
export const assets = computed(() => data.value?.assets || []);
export const totalSize = computed(() => assets.value.reduce((sum, asset) => sum + asset.size, 0));
export const countType = (type: AssetType) => assets.value.filter(asset => asset.type === type).length;
export const isLibraryView = computed(() => LIBRARY_VIEWS.includes(ui.view));

export const filtered = computed(() => {
  const needle = ui.query.toLowerCase();
  return assets.value.filter(asset =>
    (ui.category === 'all' || asset.type === ui.category) && `${asset.name} ${asset.path}`.toLowerCase().includes(needle),
  ).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
});
export const inspected = computed(() => assets.value.find(asset => asset.id === ui.inspecting));

// Searching from any page shows the matching assets.
watch(() => ui.query, query => { if (query && !isLibraryView.value) ui.view = 'library'; });

let toastTimer: number | undefined;
watch(toast, value => {
  clearTimeout(toastTimer);
  if (value) toastTimer = window.setTimeout(() => { toast.value = null; }, value.error ? 9000 : 4500);
});

export function notify(text: string, isError = false) {
  toast.value = { text, error: isError };
}

function applySession(value: Session) {
  session.token = value.token;
  session.version = value.version;
  session.platform = value.platform;
}

function applyLibrary(library: LibraryResponse) {
  data.value = library;
  rssSync.value = library.rssSync;
  // The details of an asset that a new scan no longer lists close.
  if (!library.assets.some(asset => asset.id === ui.inspecting)) ui.inspecting = null;
}

// The GDA sync runs in a background process after a rescan: follow it, then report how it ended.
let rssTimer: number | undefined;
watch(rssSync, (status, previous) => {
  clearTimeout(rssTimer);
  if (status?.running) rssTimer = window.setTimeout(refreshRssSync, RSS_POLL_MS);
  else if (status && previous?.running && previous.workspaceId === status.workspaceId && status.lastRun) {
    const { lastRun, summary } = status;
    if (lastRun.state === 'failed') notify(`GDA sync failed: ${lastRun.error}`, true);
    else if (summary) notify(`GDA sync finished: ${summary.identical} in sync, ${summary.missing} missing, ${summary.different} different, ${summary.invalid} invalid, ${summary.supplementary ?? 0} supplementary.`);
  }
});

async function refreshRssSync() {
  try {
    rssSync.value = await getJSON<RssSyncStatus>('/api/rss-sync');
  } catch {
    rssTimer = window.setTimeout(refreshRssSync, RSS_POLL_MS * 3);
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
    if ((e as Error).name !== 'AbortError') loadError.value = (e as Error).message;
  }
}

async function api<T>(path: string, method = 'POST', body?: unknown): Promise<T> {
  const send = (token: string) => fetch(`/api/${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'x-gda-token': token },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let response = await send(session.token);
  let value = await response.json();
  if (response.status === 403 && value.error === INVALID_SESSION) {
    // A backend restart rotates its token. Retry only a rejected, unapplied request.
    const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
    if (sessionResponse.ok) {
      applySession(await sessionResponse.json());
      response = await send(session.token);
      value = await response.json();
    }
  }
  if (!response.ok) throw new Error(value.error || 'Request failed');
  return value as T;
}

export function navigate(view: View, category: AssetType | 'all' = 'all') {
  ui.view = view;
  ui.category = category;
  ui.query = '';
  ui.inspecting = null;
  ui.sidebarOpen = false;
}

/** Show an asset of the dashboard, a GDA file, in the asset library: the game file at the same path, or, when the
 * game has none, the game files with its name. */
export function inspect(asset: Asset) {
  if (!isLibraryView.value) navigate('library');
  if (assets.value.some(item => item.id === asset.id)) ui.inspecting = asset.id;
  else ui.query = asset.name;
}

export async function rescan() {
  busy.value = 'scan';
  try {
    const library = await api<LibraryResponse>('scan');
    applyLibrary(library);
    notify(`Library refreshed. ${library.assets.length} assets found.`);
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}

/** Ask to copy the closest GDA file of each "different" resource of the GDA sync report over the game resource. */
export function requestResourceSync(rows: RssResource[]) {
  ui.resourceActions = rows.filter(row => resourceAction(row) === 'sync');
}

/** Ask to apply the action of each resource of the GDA sync report that has one: sync a different resource, remove the
 * declarations of an invalid one, or delete a supplementary one. */
export function requestResourceActions(rows: RssResource[]) {
  ui.resourceActions = rows.filter(row => resourceAction(row));
}

export async function confirmResourceActions() {
  if (!ui.resourceActions) return;
  const rows = ui.resourceActions;
  ui.resourceActions = null;
  busy.value = 'sync';
  applying.value = commonAction(rows);
  try {
    // Copies alone go to the endpoint that can only copy. Otherwise each resource names the status it was chosen with,
    // so the backend refuses one that a newer report gives another status, and another action.
    const result = applying.value === 'sync'
      ? await api<SyncResult>('rss-sync/copy', 'POST', { ids: rows.map(row => row.id) })
      : await api<SyncResult>('rss-sync/apply', 'POST', { resources: rows.map(row => ({ id: row.id, category: row.category })) });
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
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; applying.value = null; }
}

export async function openFolder(folder: 'source' | 'destination', assetId?: string) {
  try {
    await api('open-folder', 'POST', { folder, assetId });
    notify(`Opened ${folder === 'source' ? 'GDA' : 'Game'} folder.`);
  } catch (e) { notify((e as Error).message, true); }
}

/** The size, time and image dimensions of files the GDA sync report names, by their absolute paths. */
export async function resourceDetails(files: string[]) {
  return (await api<{ files: Record<string, RssFileDetails> }>('rss-sync/details', 'POST', { files })).files;
}

export async function openResourceFolder(file: string) {
  try {
    await api('rss-sync/open-folder', 'POST', { file });
    notify('Opened folder.');
  } catch (e) { notify((e as Error).message, true); }
}

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify('Path copied to clipboard.');
  } catch { notify('Clipboard access is unavailable in this browser.', true); }
}

/** The full path of an asset in the game (destination) folder, with the separators of the backend's platform. */
export function gamePath(asset: Asset) {
  return [config.value.destination, ...asset.path.split('/')].join(session.platform === 'Windows' ? '\\' : '/');
}

export async function saveSettings(settings: Pick<WorkspaceConfig, 'name' | 'source' | 'destination'>) {
  busy.value = 'settings';
  try {
    const library = await api<LibraryResponse>('settings', 'PUT', settings);
    applyLibrary(library);
    navigate('library');
    notify(library.missingFolders.length ? 'Workspace saved, but a folder does not exist. Check Workspace settings.' : 'Workspace connected successfully.');
    return true;
  } catch (e) {
    notify((e as Error).message, true);
    return false;
  } finally { busy.value = ''; }
}

export async function selectWorkspace(id: string) {
  if (busy.value || id === config.value.defaultWorkspace) return;
  busy.value = 'settings';
  try {
    const library = await api<LibraryResponse>('workspace', 'PUT', { id });
    ui.inspecting = null;
    ui.resourceActions = null;
    applyLibrary(library);
    navigate('dashboard');
    notify(`Switched to ${library.config.name}.`);
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}

export async function stopApplication() {
  ui.shutdownConfirm = false;
  busy.value = 'shutdown';
  try {
    await api('shutdown');
    stopped.value = true;
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}
