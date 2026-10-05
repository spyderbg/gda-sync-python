// Application state shared by the layout and the views, and the actions that talk to the backend.
import { computed, reactive, ref, watch } from 'vue';
import { plural } from './format';
import type { Asset, AssetStatus, AssetType, LibraryResponse, RssSyncStatus, Session, SyncResult, View, WorkspaceConfig } from './types';

const INVALID_SESSION = 'Invalid session. Reload the application.';
const RSS_POLL_MS = 1000;
export const LIBRARY_VIEWS: View[] = ['library', 'pending', 'synced'];
export const PAGE_NAMES: Record<View, string> = {
  dashboard: 'Dashboard', library: 'Asset library', pending: 'Needs sync', synced: 'In sync', rssSync: 'In sync', history: 'Sync history', settings: 'Workspace settings',
};

export const data = ref<LibraryResponse | null>(null);
/** The active workspace's GDA sync: whether it is running, and the summary of its latest report. */
export const rssSync = ref<RssSyncStatus | null>(null);
export const session = reactive({ token: '', version: '', platform: '' });
export const loadError = ref('');
export const stopped = ref(false);
export const busy = ref<'' | 'scan' | 'sync' | 'settings' | 'shutdown'>('');
export const toast = ref<{ text: string; error?: boolean } | null>(null);

export const ui = reactive({
  view: 'dashboard' as View,
  category: 'all' as AssetType | 'all',
  query: '',
  format: 'all',
  status: 'all' as AssetStatus | 'all',
  sort: 'recent',
  layout: 'grid' as 'grid' | 'list',
  selected: new Set<string>(),
  inspecting: null as string | null,
  syncIds: null as string[] | null,
  help: false,
  shutdownConfirm: false,
  expanded: false,
  sidebarOpen: false,
});

export const config = computed(() => data.value?.config as WorkspaceConfig);
export const workspaces = computed(() => config.value?.workspaces || []);
export const assets = computed(() => data.value?.assets || []);
export const pending = computed(() => assets.value.filter(asset => asset.status !== 'synced'));
export const syncedCount = computed(() => assets.value.length - pending.value.length);
export const totalSize = computed(() => assets.value.reduce((sum, asset) => sum + asset.size, 0));
export const countStatus = (status: AssetStatus) => assets.value.filter(asset => asset.status === status).length;
export const countType = (type: AssetType) => assets.value.filter(asset => asset.type === type).length;
export const isLibraryView = computed(() => LIBRARY_VIEWS.includes(ui.view));
export const formats = computed(() => [...new Set(assets.value.map(asset => asset.extension))].sort());

export const filtered = computed(() => {
  const needle = ui.query.toLowerCase();
  return assets.value.filter(asset =>
    (ui.view !== 'pending' || asset.status !== 'synced') && (ui.view !== 'synced' || asset.status === 'synced') &&
    (ui.category === 'all' || asset.type === ui.category) && (ui.format === 'all' || asset.extension === ui.format) &&
    (ui.status === 'all' || asset.status === ui.status) && `${asset.name} ${asset.path}`.toLowerCase().includes(needle),
  ).sort((a, b) => ui.sort === 'name' ? a.name.localeCompare(b.name) : ui.sort === 'size' ? b.size - a.size : b.modifiedAt.localeCompare(a.modifiedAt));
});
export const inspected = computed(() => assets.value.find(asset => asset.id === ui.inspecting));
export const selectedPending = computed(() => assets.value.filter(asset => ui.selected.has(asset.id) && asset.status !== 'synced'));
export const syncAssets = computed(() => assets.value.filter(asset => ui.syncIds?.includes(asset.id) && asset.status !== 'synced'));
export const allVisibleSelected = computed(() => filtered.value.length > 0 && filtered.value.every(asset => ui.selected.has(asset.id)));

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
  if (!library.assets.some(asset => asset.id === ui.inspecting)) ui.inspecting = library.assets[0]?.id || null;
}

// The GDA sync runs in a background process after a rescan: follow it, then report how it ended.
let rssTimer: number | undefined;
watch(rssSync, (status, previous) => {
  clearTimeout(rssTimer);
  if (status?.running) rssTimer = window.setTimeout(refreshRssSync, RSS_POLL_MS);
  else if (status && previous?.running && previous.workspaceId === status.workspaceId && status.lastRun) {
    const { lastRun, summary } = status;
    if (lastRun.state === 'failed') notify(`GDA sync failed: ${lastRun.error}`, true);
    else if (summary) notify(`GDA sync finished: ${summary.identical} in sync, ${summary.missing} missing, ${summary.different} different, ${summary.invalid} invalid.`);
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
  ui.selected = new Set();
  ui.query = '';
  ui.status = 'all';
  ui.format = 'all';
  ui.sidebarOpen = false;
}

export function inspect(asset: Asset) {
  if (!isLibraryView.value) navigate('library');
  ui.inspecting = asset.id;
}

export function toggleSelected(id: string) {
  const next = new Set(ui.selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  ui.selected = next;
}

export function setVisibleSelected(select: boolean) {
  const next = new Set(ui.selected);
  for (const asset of filtered.value) if (select) next.add(asset.id); else next.delete(asset.id);
  ui.selected = next;
}

export function requestSync(ids: string[]) {
  ui.syncIds = ids;
}

export async function rescan() {
  busy.value = 'scan';
  try {
    const library = await api<LibraryResponse>('scan');
    applyLibrary(library);
    ui.selected = new Set();
    notify(`Library refreshed. ${library.assets.length} assets found.`);
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}

export async function confirmSync() {
  if (!ui.syncIds) return;
  const ids = ui.syncIds;
  ui.syncIds = null;
  busy.value = 'sync';
  try {
    const result = await api<SyncResult>('sync', 'POST', { ids });
    applyLibrary(result.library);
    ui.selected = new Set();
    const copied = result.copied.length;
    if (result.failures.length) notify(`${copied} synced; ${result.failures.length} failed. ${result.failures[0].name}: ${result.failures[0].message}`, true);
    else notify(copied ? `${copied} asset${plural(copied)} synced. Your GDA folder is up to date.` : 'These assets are already in sync.');
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}

export async function openFolder(folder: 'source' | 'destination', assetId?: string) {
  try {
    await api('open-folder', 'POST', { folder, assetId });
    notify(`Opened ${folder === 'source' ? 'source' : 'GDA'} folder.`);
  } catch (e) { notify((e as Error).message, true); }
}

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify('Path copied to clipboard.');
  } catch { notify('Clipboard access is unavailable in this browser.', true); }
}

/** The full source path of an asset, with the separators of the backend's platform. */
export function sourcePath(asset: Asset) {
  return [config.value.source, ...asset.path.split('/')].join(session.platform === 'Windows' ? '\\' : '/');
}

export async function saveSettings(settings: Pick<WorkspaceConfig, 'name' | 'source' | 'destination'>) {
  busy.value = 'settings';
  try {
    const library = await api<LibraryResponse>('settings', 'PUT', settings);
    applyLibrary(library);
    ui.inspecting = library.assets[0]?.id || null;
    navigate('library');
    notify('Workspace connected successfully.');
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
    ui.syncIds = null;
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
