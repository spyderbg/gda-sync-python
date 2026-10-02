<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ArrowDown, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Copy, ExternalLink,
  File, Folder, FolderOpen, Grid2X2, HardDrive, Layers, List, LoaderCircle, MoreHorizontal, Power, RefreshCw, Search,
  Settings2, ShieldCheck, SlidersHorizontal, X,
} from '@lucide/vue';
import ActivityPanel from './components/ActivityPanel.vue';
import AppModal from './components/AppModal.vue';
import AppSidebar from './components/AppSidebar.vue';
import AssetInspector from './components/AssetInspector.vue';
import AssetThumbnail from './components/AssetThumbnail.vue';
import StatusBadge from './components/StatusBadge.vue';
import { useBackendLifetime } from './composables/useBackendLifetime';
import { ASSET_TYPES, plural, size, time, typeIcons, typeNames } from './format';
import type { Asset, AssetStatus, AssetType, LibraryResponse, Session, SyncResult, View, WorkspaceConfig } from './types';

const INVALID_SESSION = 'Invalid session. Reload the application.';
const PAGE_NAMES: Record<View, string> = {
  library: 'Asset library', pending: 'Needs sync', synced: 'In sync', activity: 'Sync activity', settings: 'Workspace settings',
};

const data = ref<LibraryResponse | null>(null);
const token = ref('');
const version = ref('');
const platform = ref('');
const error = ref('');
const view = ref<View>('library');
const category = ref<AssetType | 'all'>('all');
const query = ref('');
const format = ref('all');
const status = ref<AssetStatus | 'all'>('all');
const sort = ref('recent');
const layout = ref<'grid' | 'list'>('grid');
const selected = ref(new Set<string>());
const inspecting = ref<string | null>(null);
const busy = ref('');
const toast = ref<{ text: string; error?: boolean } | null>(null);
const syncIds = ref<string[] | null>(null);
const help = ref(false);
const shutdownConfirm = ref(false);
const stopped = ref(false);
const expanded = ref(false);
const settings = ref<WorkspaceConfig | null>(null);
const searchInput = ref<HTMLInputElement>();

useBackendLifetime(() => !stopped.value);

const assets = computed(() => data.value?.assets || []);
const pending = computed(() => assets.value.filter(asset => asset.status !== 'synced'));
const synced = computed(() => assets.value.length - pending.value.length);
const count = (state: AssetStatus) => assets.value.filter(asset => asset.status === state).length;
const formats = computed(() => [...new Set(assets.value.map(asset => asset.extension))].sort());
const filtered = computed(() => {
  const needle = query.value.toLowerCase();
  return assets.value.filter(asset =>
    (view.value !== 'pending' || asset.status !== 'synced') && (view.value !== 'synced' || asset.status === 'synced') &&
    (category.value === 'all' || asset.type === category.value) && (format.value === 'all' || asset.extension === format.value) &&
    (status.value === 'all' || asset.status === status.value) && `${asset.name} ${asset.path}`.toLowerCase().includes(needle),
  ).sort((a, b) => sort.value === 'name' ? a.name.localeCompare(b.name) : sort.value === 'size' ? b.size - a.size : b.modifiedAt.localeCompare(a.modifiedAt));
});
const inspected = computed(() => assets.value.find(asset => asset.id === inspecting.value));
const selectedPending = computed(() => assets.value.filter(asset => selected.value.has(asset.id) && asset.status !== 'synced'));
const syncAssets = computed(() => assets.value.filter(asset => syncIds.value?.includes(asset.id) && asset.status !== 'synced'));
const allVisibleSelected = computed(() => filtered.value.length > 0 && filtered.value.every(asset => selected.value.has(asset.id)));
const caughtUp = computed(() => view.value === 'pending' && !query.value);
const pageName = computed(() => PAGE_NAMES[view.value]);
const windowsPaths = computed(() => platform.value === 'Windows');

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body as T;
}

function applySession(session: Session) {
  token.value = session.token;
  version.value = session.version;
  platform.value = session.platform;
}

const loading = new AbortController();
onMounted(() => {
  Promise.all([getJSON<Session>('/api/session', loading.signal), getJSON<LibraryResponse>('/api/library', loading.signal)])
    .then(([session, library]) => {
      applySession(session);
      data.value = library;
      settings.value = { ...library.config };
      inspecting.value = library.assets[0]?.id || null;
    })
    .catch(e => { if (e.name !== 'AbortError') error.value = e.message; });
});

let toastTimer: number | undefined;
watch(toast, value => {
  clearTimeout(toastTimer);
  if (value) toastTimer = window.setTimeout(() => { toast.value = null; }, value.error ? 9000 : 4500);
});
const notify = (text: string, isError = false) => { toast.value = { text, error: isError }; };

function onKeydown(event: KeyboardEvent) {
  const field = ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName);
  if (((event.ctrlKey || event.metaKey) && event.key === 'k') || (event.key === '/' && !field)) {
    event.preventDefault();
    if (view.value === 'activity' || view.value === 'settings') view.value = 'library';
    void nextTick(() => searchInput.value?.focus());
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  loading.abort();
  clearTimeout(toastTimer);
  window.removeEventListener('keydown', onKeydown);
});

async function api<T>(path: string, method = 'POST', body?: unknown): Promise<T> {
  const send = (sessionToken: string) => fetch(`/api/${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), 'x-gda-token': sessionToken },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let response = await send(token.value);
  let value = await response.json();
  if (response.status === 403 && value.error === INVALID_SESSION) {
    // A backend restart rotates its token. Retry only a rejected, unapplied request.
    const sessionResponse = await fetch('/api/session', { cache: 'no-store' });
    if (sessionResponse.ok) {
      applySession(await sessionResponse.json());
      response = await send(token.value);
      value = await response.json();
    }
  }
  if (!response.ok) throw new Error(value.error || 'Request failed');
  return value as T;
}

async function rescan() {
  busy.value = 'scan';
  try {
    const library = await api<LibraryResponse>('scan');
    data.value = library;
    selected.value = new Set();
    notify(`Library refreshed. ${library.assets.length} assets found.`);
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}

async function openFolder(folder: 'source' | 'destination', assetId?: string) {
  try {
    await api('open-folder', 'POST', { folder, assetId });
    notify(`Opened ${folder === 'source' ? 'source' : 'GDA'} folder.`);
  } catch (e) { notify((e as Error).message, true); }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify('Path copied to clipboard.');
  } catch { notify('Clipboard access is unavailable in this browser.', true); }
}

function sourcePath(asset: Asset) {
  const separator = windowsPaths.value ? '\\' : '/';
  return [data.value!.config.source, ...asset.path.split('/')].join(separator);
}

async function confirmSync() {
  if (!syncIds.value) return;
  const ids = syncIds.value;
  syncIds.value = null;
  busy.value = 'sync';
  try {
    const result = await api<SyncResult>('sync', 'POST', { ids });
    data.value = result.library;
    selected.value = new Set();
    const copied = result.copied.length;
    if (result.failures.length) notify(`${copied} synced; ${result.failures.length} failed. ${result.failures[0].name}: ${result.failures[0].message}`, true);
    else notify(copied ? `${copied} asset${plural(copied)} synced. Your GDA folder is up to date.` : 'These assets are already in sync.');
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}

async function stopApplication() {
  shutdownConfirm.value = false;
  busy.value = 'shutdown';
  try {
    await api('shutdown');
    stopped.value = true;
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}

async function saveSettings() {
  if (!settings.value) return;
  busy.value = 'settings';
  try {
    const { name, source, destination } = settings.value;
    const library = await api<LibraryResponse>('settings', 'PUT', { name, source, destination });
    data.value = library;
    settings.value = { ...library.config };
    selected.value = new Set();
    inspecting.value = library.assets[0]?.id || null;
    notify('Workspace connected successfully.');
    view.value = 'library';
  } catch (e) { notify((e as Error).message, true); } finally { busy.value = ''; }
}

function reload() {
  window.location.reload();
}

function navigate(next: View, nextCategory: AssetType | 'all' = 'all') {
  view.value = next;
  category.value = nextCategory;
  selected.value = new Set();
  query.value = '';
  status.value = 'all';
  format.value = 'all';
}

function cancelSettings() {
  settings.value = { ...data.value!.config };
  navigate('library');
}

function chooseCategory(type: AssetType | 'all') {
  category.value = type;
  selected.value = new Set();
}

function showAll() {
  query.value = '';
  category.value = 'all';
  status.value = 'all';
  format.value = 'all';
  if (view.value === 'pending') view.value = 'library';
}

function toggle(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selected.value = next;
}

function toggleAllVisible(event: Event) {
  const next = new Set(selected.value);
  const select = !allVisibleSelected.value;
  for (const asset of filtered.value) if (select) next.add(asset.id); else next.delete(asset.id);
  selected.value = next;
  // Keep the checkbox controlled by the selection, even when nothing is visible.
  (event.target as HTMLInputElement).checked = allVisibleSelected.value;
}
</script>

<template>
  <div v-if="stopped" class="startup-state">
    <div class="brand-mark"><CheckCheck /></div>
    <h1>Workspace closed.</h1>
    <p>Your files, settings, and history are saved on your machine.<br>Launch GDA Sync to pick up where you left off.</p>
  </div>
  <div v-else-if="error" class="startup-state">
    <div class="brand-mark"><RefreshCw /></div>
    <h1>Couldn’t connect to your workspace</h1>
    <p>{{ error }}</p>
    <button class="button primary" @click="reload"><RefreshCw :size="16" />Try again</button>
  </div>
  <div v-else-if="!data" class="startup-state">
    <div class="brand-mark"><RefreshCw class="spin" /></div>
    <h1>Opening your workspace</h1>
    <p>Getting your assets ready…</p>
  </div>
  <div v-else class="app-shell">
    <AppSidebar :config="data.config" :assets="assets" :view="view" :category="category" :version="version" :platform="platform" @navigate="navigate" />
    <div class="workspace-main">
      <header class="topbar">
        <div class="breadcrumb"><Folder :size="15" /><span>{{ data.config.name }}</span><ChevronRight :size="13" /><strong>{{ pageName }}</strong></div>
        <div class="topbar-right">
          <span class="connection"><i />Local connection</span><span class="topbar-divider" />
          <button class="icon-button" aria-label="Help and keyboard shortcuts" @click="help = true"><CircleHelp :size="19" /></button>
          <div class="top-avatar">VS</div>
        </div>
      </header>
      <main class="main-content">
        <div class="page-heading">
          <div>
            <div class="eyebrow">YOUR CREATIVE WORKFLOW, CONNECTED</div>
            <h1>{{ pageName }}<span class="heading-dot">.</span></h1>
            <p v-if="view === 'activity'">A little history of everything you’ve moved forward.</p>
            <p v-else-if="view === 'settings'">Connect your source assets to their home in GDA.</p>
            <p v-else>A place for every asset. Everything in its right place.</p>
          </div>
          <div v-if="view !== 'settings'" class="heading-actions">
            <button class="button secondary" :disabled="!!busy" @click="rescan"><LoaderCircle v-if="busy === 'scan'" class="spin" :size="15" /><RefreshCw v-else :size="15" />Rescan</button>
            <button class="button primary" :disabled="!!busy || !pending.length" @click="syncIds = pending.map(asset => asset.id)">
              <LoaderCircle v-if="busy === 'sync'" class="spin" :size="16" /><RefreshCw v-else :size="16" />{{ busy === 'sync' ? 'Syncing…' : 'Sync all pending' }}<span v-if="pending.length > 0" class="button-count">{{ pending.length }}</span>
            </button>
          </div>
        </div>

        <template v-if="view !== 'settings' && view !== 'activity'">
          <div class="stats-row">
            <button class="stat-card" @click="navigate('library')">
              <span class="stat-icon neutral"><Layers :size="21" /></span>
              <div><span class="stat-label">Total assets</span><div class="stat-value">{{ assets.length }}<span>in your workspace</span></div></div>
              <ArrowUpRight class="stat-arrow" :size="17" />
            </button>
            <button class="stat-card" @click="navigate('pending')">
              <span class="stat-icon amber"><RefreshCw :size="21" /></span>
              <div><span class="stat-label">Ready to sync</span><div class="stat-value">{{ pending.length }}<span>{{ count('new') }} new · {{ count('modified') }} modified</span></div></div>
              <ArrowUpRight class="stat-arrow" :size="17" />
            </button>
            <button class="stat-card" @click="navigate('synced')">
              <span class="stat-icon green"><CheckCheck :size="21" /></span>
              <div><span class="stat-label">Already in sync</span><div class="stat-value">{{ synced }}<span>good to go</span></div></div>
              <span class="mini-progress"><i :style="{ height: `${assets.length ? synced / assets.length * 100 : 0}%` }" /></span>
            </button>
          </div>

          <div class="folder-connection">
            <div class="folder-endpoint">
              <span class="endpoint-icon"><FolderOpen :size="19" /></span>
              <div><span class="endpoint-label">SOURCE FOLDER</span><button :title="data.config.source" class="path-button" @click="openFolder('source')">{{ data.config.demo ? '…/demo/source' : data.config.source }}<ExternalLink :size="12" /></button></div>
              <button class="icon-button copy-folder" aria-label="Copy source folder path" @click="copy(data.config.source)"><Copy :size="14" /></button>
            </div>
            <span class="connection-arrow"><ArrowRight :size="18" /></span>
            <div class="folder-endpoint">
              <span class="endpoint-icon green"><FolderOpen :size="19" /></span>
              <div><span class="endpoint-label">GDA DESTINATION</span><button :title="data.config.destination" class="path-button" @click="openFolder('destination')">{{ data.config.demo ? '…/demo/gda' : data.config.destination }}<ExternalLink :size="12" /></button></div>
              <button class="icon-button copy-folder" aria-label="Copy GDA folder path" @click="copy(data.config.destination)"><Copy :size="14" /></button>
            </div>
            <button class="connection-settings icon-button" aria-label="Change workspace folders" @click="navigate('settings')"><Settings2 :size="17" /></button>
          </div>

          <div v-if="data.warnings.length > 0" class="warning-banner" role="status">
            {{ data.warnings.length }} files skipped during scan. <details><summary>View details</summary><p v-for="warning in data.warnings" :key="warning">{{ warning }}</p></details>
          </div>

          <div class="library-toolbar">
            <div class="category-tabs">
              <button :class="{ active: category === 'all' }" @click="chooseCategory('all')">All assets <span>{{ assets.length }}</span></button>
              <button v-for="type in ASSET_TYPES" :key="type" :class="{ active: category === type }" @click="chooseCategory(type)">{{ typeNames[type] }}</button>
            </div>
            <div class="layout-toggle">
              <button :class="{ active: layout === 'grid' }" aria-label="Grid view" :aria-pressed="layout === 'grid'" @click="layout = 'grid'"><Grid2X2 :size="16" /></button>
              <button :class="{ active: layout === 'list' }" aria-label="List view" :aria-pressed="layout === 'list'" @click="layout = 'list'"><List :size="17" /></button>
            </div>
          </div>

          <div class="filter-row">
            <div class="search-box">
              <Search :size="17" /><input ref="searchInput" v-model="query" aria-label="Search assets" placeholder="Search assets, names, or folders…">
              <button v-if="query" class="icon-button" aria-label="Clear search" @click="query = ''"><X :size="14" /></button><kbd v-else>Ctrl K</kbd>
            </div>
            <div class="select-wrap">
              <SlidersHorizontal :size="14" />
              <select v-model="status" aria-label="Filter by status"><option value="all">All statuses</option><option value="new">New assets</option><option value="modified">Modified</option><option value="synced">In sync</option></select>
              <ChevronDown :size="13" />
            </div>
            <div class="select-wrap format-select">
              <select v-model="format" aria-label="Filter by file format"><option value="all">All formats</option><option v-for="extension in formats" :key="extension" :value="extension">{{ extension.toUpperCase() }}</option></select>
              <ChevronDown :size="13" />
            </div>
            <div class="select-wrap sort-select">
              <ArrowDown :size="14" />
              <select v-model="sort" aria-label="Sort assets"><option value="recent">Recently modified</option><option value="name">Name A–Z</option><option value="size">Largest first</option></select>
              <ChevronDown :size="13" />
            </div>
          </div>

          <div class="results-heading">
            <label class="select-all">
              <input type="checkbox" aria-label="Select all visible assets" :checked="allVisibleSelected" @change="toggleAllVisible">
              <span>{{ selected.size ? `${selected.size} selected` : `${filtered.length} assets` }}<small>{{ query ? ` matching “${query}”` : '' }}</small></span>
            </label>
            <span class="scan-time"><i />Last scanned {{ time(data.scannedAt) }}</span>
          </div>

          <div :class="['library-content', { 'with-inspector': inspected }]">
            <div class="asset-area">
              <div v-if="filtered.length" :class="`asset-${layout}`">
                <article v-for="asset in filtered" :key="asset.id" :class="['asset-card', { inspected: inspecting === asset.id, selected: selected.has(asset.id) }]">
                  <button class="asset-hit-target" :aria-label="`Inspect ${asset.name}`" @click="inspecting = asset.id">
                    <AssetThumbnail :asset="asset" :revision="data.scannedAt" />
                    <div class="asset-info">
                      <div class="asset-title"><component :is="typeIcons[asset.type]" :size="14" /><strong :title="asset.name">{{ asset.name }}</strong></div>
                      <div class="asset-subtitle"><span>{{ asset.folder }}</span><span>{{ size(asset.size) }}</span></div>
                      <div class="asset-card-bottom">
                        <StatusBadge :status="asset.status" />
                        <span class="dimension-label">{{ asset.dimensions ? `${asset.dimensions.width} × ${asset.dimensions.height}` : asset.extension.toUpperCase() }}</span>
                      </div>
                    </div>
                  </button>
                  <input class="asset-checkbox" type="checkbox" :aria-label="`Select ${asset.name}`" :checked="selected.has(asset.id)" @change="toggle(asset.id)">
                  <button class="asset-menu" :aria-label="`Show details for ${asset.name}`" @click="inspecting = asset.id"><MoreHorizontal :size="17" /></button>
                </article>
              </div>
              <div v-else class="empty-state">
                <CheckCheck v-if="caughtUp" :size="36" /><Search v-else :size="34" />
                <h2>{{ caughtUp ? 'All caught up.' : 'No assets found' }}</h2>
                <p>{{ caughtUp ? 'Every asset is in sync with your GDA folder.' : 'Try a different search or clear your filters.' }}</p>
                <button class="button secondary" @click="showAll">Show all assets</button>
              </div>
            </div>
            <AssetInspector
              v-if="inspected" :asset="inspected" :revision="data.scannedAt" :busy="!!busy"
              @close="inspecting = null" @expand="expanded = true" @sync="syncIds = [inspected.id]"
              @open-source="openFolder('source', inspected.id)" @copy-path="copy(sourcePath(inspected))"
            />
          </div>

          <div v-if="selected.size > 0" class="selection-bar">
            <span><Check :size="16" />{{ selected.size }} assets selected</span>
            <button @click="selected = new Set()">Clear selection</button>
            <button class="button primary" :disabled="!!busy || !selectedPending.length" @click="syncIds = selectedPending.map(asset => asset.id)">
              <RefreshCw :size="15" />Sync selected<span v-if="selectedPending.length > 0" class="button-count">{{ selectedPending.length }}</span>
            </button>
          </div>
          <footer class="content-footer">
            <span><ShieldCheck :size="13" />Made for your local workflow.</span>
            <span>{{ data.config.demo ? 'Demo workspace' : 'Connected workspace' }}<i />{{ size(assets.reduce((sum, asset) => sum + asset.size, 0)) }} total</span>
          </footer>
        </template>

        <ActivityPanel v-if="view === 'activity'" :activity="data.activity" @explore="navigate('library')" />

        <div v-if="view === 'settings' && settings" class="settings-layout">
          <form class="settings-panel" @submit.prevent="saveSettings">
            <div class="panel-heading"><h2>Workspace connection</h2><span class="connected-badge"><i />Connected</span></div>
            <div class="form-body">
              <label>Project name<input v-model="settings.name" required maxlength="80" placeholder="Your project name"></label>
              <label>
                <span><FolderOpen :size="16" />Source folder</span>
                <input v-model="settings.source" aria-label="Source folder" aria-describedby="source-help" required :placeholder="windowsPaths ? 'C:\\Users\\you\\project\\source' : '/home/you/project/source'">
                <small id="source-help">The originals you’re working with. All subfolders are included.</small>
              </label>
              <div class="form-connection"><ArrowDown :size="19" /><span>Assets flow from source to GDA</span></div>
              <label>
                <span><HardDrive :size="16" />GDA destination</span>
                <input v-model="settings.destination" aria-label="GDA destination" aria-describedby="destination-help" required :placeholder="windowsPaths ? 'C:\\Users\\you\\project\\gda' : '/home/you/project/gda'">
                <small id="destination-help">An existing, separate folder where your synced assets belong.</small>
              </label>
              <div class="form-actions">
                <button type="button" class="button secondary" @click="cancelSettings">Cancel</button>
                <button class="button primary" type="submit" :disabled="!!busy"><LoaderCircle v-if="busy === 'settings'" class="spin" :size="16" /><Check v-else :size="16" />Save connection</button>
              </div>
            </div>
          </form>
          <div class="settings-explainer">
            <ShieldCheck :size="28" />
            <h2>A simple, local connection.</h2>
            <p>GDA Sync copies assets from your source folder to your destination, keeping the same folder structure.</p>
            <ul>
              <li><Check :size="15" />Original source files are preserved</li>
              <li><Check :size="15" />Existing GDA versions are backed up</li>
              <li><Check :size="15" />File contents determine sync status</li>
              <li><Check :size="15" />No uploads or cloud accounts</li>
            </ul>
            <div class="backup-location"><strong>Your backups live here</strong><code>{{ data.backupPath }}</code></div>
            <div class="stop-application">
              <button class="button secondary" :disabled="!!busy" @click="shutdownConfirm = true"><Power :size="15" />Stop application</button>
              <small>Close the local server when you’re done.</small>
            </div>
          </div>
        </div>
      </main>
    </div>

    <div v-if="toast" :class="['toast', { 'toast-error': toast.error }]" role="status">
      <CircleHelp v-if="toast.error" :size="19" /><CheckCheck v-else :size="19" /><span>{{ toast.text }}</span>
      <button aria-label="Dismiss notification" @click="toast = null"><X :size="16" /></button>
    </div>

    <AppModal v-if="syncIds" title="Ready to bring things up to date?" @close="syncIds = null">
      <div class="modal-body">
        <p>Copy {{ syncAssets.length }} asset{{ plural(syncAssets.length) }} from your source folder to GDA. Existing destination files will be replaced, with their previous versions saved in your backups.</p>
        <div class="sync-summary">
          <div><span>ASSETS TO SYNC</span><strong>{{ syncAssets.length }}</strong></div>
          <ArrowRight :size="23" />
          <div><span>TOTAL SIZE</span><strong>{{ size(syncAssets.reduce((sum, asset) => sum + asset.size, 0)) }}</strong></div>
        </div>
        <div class="sync-file-list"><div v-for="asset in syncAssets" :key="asset.id"><File :size="15" /><span>{{ asset.name }}</span><StatusBadge :status="asset.status" /></div></div>
        <div class="modal-folder"><FolderOpen :size="16" /><span>{{ data.config.destination }}</span></div>
      </div>
      <div class="modal-actions">
        <button class="button secondary" @click="syncIds = null">Cancel</button>
        <button class="button primary" :disabled="!syncAssets.length" @click="confirmSync"><RefreshCw :size="16" />Sync {{ syncAssets.length }} asset{{ plural(syncAssets.length) }}</button>
      </div>
    </AppModal>

    <AppModal v-if="shutdownConfirm" title="Stop GDA Sync?" @close="shutdownConfirm = false">
      <div class="modal-body"><p>This stops the local server. Your files, settings, and sync history stay saved. Launch GDA Sync to open this workspace again.</p></div>
      <div class="modal-actions">
        <button class="button secondary" @click="shutdownConfirm = false">Keep working</button>
        <button class="button primary" @click="stopApplication"><Power :size="15" />Stop application</button>
      </div>
    </AppModal>

    <AppModal v-if="help" title="A little help for your workflow" @close="help = false">
      <div class="modal-body help-body">
        <p>Search and inspect your assets, then sync the files you’re ready to move to GDA.</p>
        <div><span class="help-number">01</span><div><strong>Explore your library</strong><p>Filter by type, file format, or sync status. Click any asset to see its details and preview.</p></div></div>
        <div><span class="help-number">02</span><div><strong>Choose what moves forward</strong><p>Select individual assets, or use “Sync all pending” to copy every new and modified file.</p></div></div>
        <div><span class="help-number">03</span><div><strong>Keep it fresh</strong><p>After editing your source files, use Rescan to compare them with GDA again.</p></div></div>
        <div class="shortcut-row"><span>Focus asset search</span><kbd>Ctrl / ⌘ K</kbd></div>
        <div class="shortcut-row"><span>Close a dialog</span><kbd>Esc</kbd></div>
        <p class="help-small">DDS previews: DXT1, DXT3, DXT5, RGB24/32 and DX10 BC7 (UNORM / sRGB). Other DDS formats can still be copied. Model previews in this demo are illustrations.</p>
      </div>
    </AppModal>

    <AppModal v-if="expanded && inspected" :title="inspected.name" wide @close="expanded = false">
      <div class="enlarged-preview"><AssetThumbnail :asset="inspected" :revision="data.scannedAt" large /></div>
      <div class="preview-caption">
        <span>{{ inspected.extension.toUpperCase() }} · {{ size(inspected.size) }}</span>
        <span v-if="inspected.dimensions">{{ inspected.dimensions.width }} × {{ inspected.dimensions.height }} pixels</span>
      </div>
    </AppModal>
  </div>
</template>
