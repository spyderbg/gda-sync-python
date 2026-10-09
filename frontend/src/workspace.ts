// Application state shared by the layout and the views, and the actions that talk to the backend.
import { computed, reactive, ref, watch } from 'vue';
import { commonAction, plural, resourceAction, type GdaCandidate } from './format';
import type { Asset, AssetSection, LibraryResponse, RssFileDetails, RssResource, RssSyncStatus, Session, SyncResult, View, WorkspaceConfig } from './types';

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
export const busy = ref<'' | 'scan' | 'sync' | 'report' | 'settings' | 'shutdown'>('');
/** What the GDA sync report resources being applied do, while busy is "sync" for them. */
export const applying = ref<ReturnType<typeof commonAction>>(null);
export const toast = ref<{ text: string; error?: boolean } | null>(null);

export const ui = reactive({
  view: 'dashboard' as View,
  category: 'all' as AssetSection | 'all',
  query: '',
  layout: 'grid' as 'grid' | 'list',
  /** The asset whose details dialog is open. */
  inspecting: null as string | null,
  /** GDA sync report resources whose action waits for confirmation. */
  resourceActions: null as RssResource[] | null,
  /** The GDA image each image resource waiting for confirmation is synced from, by row id. */
  resourceChoices: {} as Record<string, GdaCandidate>,
  help: false,
  shutdownConfirm: false,
  sidebarOpen: false,
});

export const config = computed(() => data.value?.config as WorkspaceConfig);
export const workspaces = computed(() => config.value?.workspaces || []);
/** The newest asset report of the active workspace, which the asset library shows, and its counts. */
export const assetReport = computed(() => data.value?.assetReport ?? null);
export const assetCount = computed(() => assetReport.value?.summary?.assets ?? 0);
export const totalSize = computed(() => assetReport.value?.summary?.size ?? 0);
/** The assets of a library section; a report from before version 6 counts only types, so its textures are its images. */
export const countSection = (section: AssetSection) => {
  const summary = assetReport.value?.summary;
  if (!summary) return 0;
  if (summary.sections) return summary.sections[section] ?? 0;
  return section === 'image' ? summary.types.texture ?? 0 : section === 'sequence' ? 0 : summary.types[section] ?? 0;
};
export const isLibraryView = computed(() => LIBRARY_VIEWS.includes(ui.view));

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

export function navigate(view: View, category: AssetSection | 'all' = 'all') {
  ui.view = view;
  ui.category = category;
  ui.query = '';
  ui.inspecting = null;
  ui.sidebarOpen = false;
}

/** Show an asset of the dashboard, a GDA file, in the asset library: the game's assets with its name. */
export function inspect(asset: Asset) {
  if (!isLibraryView.value) navigate('library');
  ui.query = asset.name;
}

export async function rescan() {
  busy.value = 'scan';
  try {
    const library = await api<LibraryResponse>('scan');
    applyLibrary(library);
    notify('GDA sync started. The Sync page shows its report when it ends.');
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}

/** Write a new asset report of the active workspace's game, which the asset library then shows. */
export async function generateAssetReport() {
  busy.value = 'report';
  try {
    const library = await api<LibraryResponse>('asset-report');
    applyLibrary(library);
    const summary = library.assetReport.summary;
    if (summary) notify(`Asset report generated: ${summary.assets} assets, ${summary.missing} missing, ${summary.invalid} invalid, ${summary.supplementary} supplementary.`);
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}

/** What confirming a resource does: its action, or a sync for a missing image that a GDA image was chosen for. */
export const pendingAction = (row: RssResource) => resourceAction(row) ?? (ui.resourceChoices[row.id] ? 'sync' : null);

/** Ask to copy a GDA file of each "different" resource of the GDA sync report over the game resource: the chosen GDA
 * image of an image (choices, by row id), which can also sync a missing one, otherwise the closest GDA file. */
export function requestResourceSync(rows: RssResource[], choices: Record<string, GdaCandidate> = {}) {
  ui.resourceChoices = choices;
  ui.resourceActions = rows.filter(row => pendingAction(row) === 'sync');
}

/** Ask to apply the action of each resource of the GDA sync report that has one: sync a different resource, from its
 * chosen GDA image when it has one, remove the declarations of an invalid one, or delete a supplementary one. */
export function requestResourceActions(rows: RssResource[], choices: Record<string, GdaCandidate> = {}) {
  ui.resourceChoices = choices;
  ui.resourceActions = rows.filter(row => pendingAction(row));
}

export async function confirmResourceActions() {
  if (!ui.resourceActions) return;
  const rows = ui.resourceActions;
  // The GDA image each image is synced from, by row id.
  const gdaFiles = Object.fromEntries(rows.filter(row => ui.resourceChoices[row.id]).map(row => [row.id, ui.resourceChoices[row.id].absolutePath]));
  const actions = new Set(rows.map(pendingAction));
  ui.resourceActions = null;
  busy.value = 'sync';
  applying.value = actions.size > 1 ? 'mixed' : [...actions][0] ?? null;
  try {
    // Copies alone go to the endpoint that can only copy. Otherwise each resource names the status it was chosen with,
    // so the backend refuses one that a newer report gives another status, and another action.
    const result = applying.value === 'sync'
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
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; applying.value = null; }
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
