<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { baseName, extensionOf, number, reportPreviewURL } from '../format';
import type { StudioFile } from '../imageStudio';
import { useAssetReport } from '../composables/useAssetReport';

const props = defineProps<{ files: StudioFile[]; selected: string; working: boolean; batch: boolean; game: string; revision: string }>();
const emit = defineEmits<{ select: [file: string]; create: []; describe: [files: string[]]; generate: [files: string[]] }>();
const kind = ref<'all' | StudioFile['kind']>('all');
const status = ref<'all' | StudioFile['category']>('all');
const folder = ref('.');
const query = ref('');
const folderPicker = ref<HTMLDetailsElement>();
const assetLayout = ref<'list' | 'grid'>('list');
const failedPreviews = ref(new Set<string>());
const visiblePreviews = ref(new Set<string>());
const assetList = ref<HTMLElement>();
let thumbnailObserver: IntersectionObserver | undefined;
watch(() => props.revision, () => { failedPreviews.value = new Set(); });
const { report } = useAssetReport();
const reportFiles = computed(() => new Map((report.value?.assets ?? []).map(row => [row.sequence ? `sequence:${row.id}` : row.resourcePath, row])));
const thumbnailURL = (file: StudioFile) => reportPreviewURL(file.kind === 'sequence' ? `${props.game}/${file.path}` : file.file, props.revision);
const fileName = (file: StudioFile) => baseName(reportFiles.value.get(file.file)?.sequence?.paths[0] ?? file.path);
function fileDetails(file: StudioFile) {
  const dimensions = reportFiles.value.get(file.file)?.dimensions;
  return [dimensions ? `${dimensions.width} × ${dimensions.height}` : null, extensionOf(file.path).toUpperCase(),
    file.kind === 'sequence' ? `${file.frameCount} frames` : null].filter(Boolean).join(' · ');
}
const collapsed = ref(new Set<string>());
const selectedKey = ref('');
watch(() => props.selected, file => { selectedKey.value = file ? `file:${file}` : ''; }, { immediate: true });
const focused = ref('');
const tree = ref<HTMLElement>();
const folderLabel = (value: string) => value === '.' ? 'Game folder' : value;
const folderBreadcrumbs = computed(() => {
  if (folder.value === 'all') return [];
  const parts = folder.value === '.' ? [] : folder.value.split('/');
  let path = parts[0] === '..' ? parts.shift()! : '.';
  const crumbs = [{ path, label: folderLabel(path) }];
  for (const part of parts) {
    path = path === '.' ? part : `${path}/${part}`;
    crumbs.push({ path, label: part });
  }
  return crumbs;
});
const matching = computed(() => {
  const needle = query.value.trim();
  const caseSensitive = needle !== needle.toLowerCase();
  return props.files.filter(file => (kind.value === 'all' || file.kind === kind.value)
    && (status.value === 'all' || file.category === status.value)
    && (folder.value === 'all' || file.folder === folder.value || file.folder.startsWith(`${folder.value}/`)
      || (folder.value === '.' && !file.folder.startsWith('..')))
    && (!needle || (caseSensitive ? fileName(file) : fileName(file).toLowerCase()).includes(needle)));
});
async function observeThumbnails() {
  await nextTick();
  thumbnailObserver?.disconnect();
  if (!assetList.value) return;
  thumbnailObserver = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const key = (entry.target as HTMLElement).dataset.thumbnail;
      if (key) visiblePreviews.value.add(key);
      thumbnailObserver?.unobserve(entry.target);
    }
  }, { root: assetList.value, rootMargin: '80px' });
  assetList.value.querySelectorAll('[data-thumbnail]').forEach(element => thumbnailObserver!.observe(element));
}
onMounted(observeThumbnails);
watch([matching, assetLayout], observeThumbnails);
onBeforeUnmount(() => thumbnailObserver?.disconnect());
// One selected image or folder determines the batch scope.
const selectedFolder = computed(() => selectedKey.value.startsWith('folder:') ? selectedKey.value.slice(7) : null);
const selectedFile = computed(() => props.files.find(file => selectedKey.value === `file:${file.file}`));
const openImage = computed(() => props.files.find(file => file.file === props.selected));
const belongsToFolder = (file: StudioFile, path: string) => file.folder === path || file.folder.startsWith(`${path}/`)
  || (path === '.' && !file.folder.startsWith('..'));
const batchFiles = computed(() => selectedFolder.value !== null
  ? matching.value.filter(file => belongsToFolder(file, selectedFolder.value!))
  : selectedFile.value ? [selectedFile.value] : []);
const describeFiles = computed(() => batchFiles.value.filter(file => file.exists).map(file => file.file));
const generationFiles = computed(() => batchFiles.value.filter(file => file.metadata).map(file => file.file));
const selectionLabel = computed(() => selectedFolder.value !== null ? `Selected folder: ${folderLabel(selectedFolder.value)}`
  : selectedFile.value ? `Selected image: ${selectedFile.value.name}` : '');
// Presentation only: the proposed destination does not change the new-image save path.
const destinationFolder = computed(() => folder.value === 'all' ? null : folderLabel(folder.value));
watch(() => props.files, files => {
  if (selectedKey.value.startsWith('file:') && !files.some(file => selectedKey.value === `file:${file.file}`)) selectedKey.value = '';
});
function chooseFile(file: string) {
  if (props.working) return;
  // Keep unsaved edits when clicking the image already open in the editor.
  if (file === props.selected) selectedKey.value = `file:${file}`;
  else emit('select', file);
}
const selectedHidden = computed(() => !!props.selected && !matching.value.some(file => file.file === props.selected));
const hasFilters = computed(() => kind.value !== 'all' || status.value !== 'all'
  || folder.value !== '.' || !!query.value);
function clearFilters() {
  kind.value = status.value = 'all';
  folder.value = '.';
  query.value = '';
}

type FolderNode = { key: string; path: string; name: string; children: Map<string, FolderNode>; count: number };
type TreeRow = { key: string; parent: string; depth: number; name: string; folder: FolderNode };
const roots = computed(() => {
  const root: FolderNode = { key: 'folder:.', path: '.', name: 'Game folder', children: new Map(), count: 0 };
  const shared: FolderNode = { key: 'folder:..', path: '..', name: '..', children: new Map(), count: 0 };
  // Keep every catalog folder available, independently of the active image filters.
  for (const file of props.files) {
    const parts = file.folder === '.' ? [] : file.folder.split('/');
    let node = parts[0] === '..' ? shared : root;
    if (node === shared) parts.shift();
    node.count++;
    for (const part of parts) {
      const path = node.path === '.' ? part : `${node.path}/${part}`;
      if (!node.children.has(part)) node.children.set(part,
        { key: `folder:${path}`, path, name: part, children: new Map(), count: 0 });
      node = node.children.get(part)!;
      node.count++;
    }
  }
  return shared.count ? [root, shared] : [root];
});
const folderKeys = computed(() => {
  const keys: string[] = [];
  const visit = (node: FolderNode) => { keys.push(node.key); node.children.forEach(visit); };
  roots.value.forEach(visit);
  return keys;
});
watch(folderKeys, (keys, previousKeys) => {
  const previous = new Set(previousKeys);
  const next = new Set([...collapsed.value].filter(key => keys.includes(key)));
  // New folders start collapsed; catalog refreshes preserve branches the user opened.
  for (const key of keys) if (!previous.has(key)) next.add(key);
  collapsed.value = next;
  if (folder.value !== 'all' && !keys.includes(`folder:${folder.value}`)) folder.value = '.';
}, { immediate: true });
const treeRows = computed(() => {
  const rows: TreeRow[] = [];
  const visit = (node: FolderNode, depth: number, parent: string) => {
    rows.push({ key: node.key, parent, depth,
      name: depth === 0 && node.path.startsWith('../') ? node.path : node.name, folder: node });
    if (collapsed.value.has(node.key)) return;
    [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach(child => visit(child, depth + 1, node.key));
  };
  const visitRoot = (node: FolderNode) => {
    if (node.path === '.' || node.name === '..') {
      [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach(visitRoot);
    } else visit(node, 0, '');
  };
  roots.value.forEach(visitRoot);
  return rows;
});
function activateRow(row: TreeRow) {
  chooseFolder(row.folder.path);
  closeFolderPicker();
}
function chooseFolder(path: string) {
  if (props.working) return;
  selectedKey.value = path === 'all' ? '' : `folder:${path}`;
  folder.value = path;
}
function syncFolderToImage() {
  if (props.working || !openImage.value) return;
  folder.value = openImage.value.folder;
  selectedKey.value = `file:${openImage.value.file}`;
  const key = `folder:${folder.value}`;
  collapsed.value = new Set([...collapsed.value].filter(parent => !key.startsWith(`${parent}/`)));
  focused.value = key;
}
function closeFolderPicker() {
  if (!folderPicker.value) return;
  folderPicker.value.open = false;
  folderPicker.value.querySelector('summary')?.focus();
}
function closePickerOnBlur(event: FocusEvent) {
  if (!folderPicker.value?.contains(event.relatedTarget as Node | null) && folderPicker.value) folderPicker.value.open = false;
}
const focusKey = computed(() => treeRows.value.some(row => row.key === focused.value) ? focused.value
  : treeRows.value.find(row => row.key === selectedKey.value)?.key ?? treeRows.value[0]?.key);
function toggleFolder(key: string, recursive = false) {
  const next = new Set(collapsed.value);
  const shouldCollapse = !next.has(key);
  const keys = recursive ? folderKeys.value.filter(candidate => candidate === key || candidate.startsWith(`${key}/`)) : [key];
  for (const candidate of keys) {
    if (shouldCollapse) next.add(candidate); else next.delete(candidate);
  }
  collapsed.value = next;
}
function onFolderClick(event: MouseEvent, row: TreeRow) {
  if (!event.altKey) return;
  event.preventDefault();
  event.stopPropagation();
  toggleFolder(row.key, true);
}
async function focusRow(key: string | undefined) {
  if (!key) return;
  focused.value = key;
  await nextTick();
  [...(tree.value?.querySelectorAll<HTMLElement>('[data-studio-key]') ?? [])]
    .find(element => element.dataset.studioKey === key)?.focus();
}
function onTreeKey(event: KeyboardEvent) {
  if ((event.target as HTMLElement).tagName === 'INPUT') return;
  if ((event.target as HTMLElement).closest('.studio-disclosure') && [' ', 'Enter'].includes(event.key)) return;
  if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', ' ', 'Enter'].includes(event.key)) return;
  event.preventDefault();
  const key = (event.target as HTMLElement).closest<HTMLElement>('[data-studio-key]')?.dataset.studioKey;
  const index = treeRows.value.findIndex(row => row.key === key);
  const row = treeRows.value[index];
  if (!row) return;
  if (event.key === ' ' || event.key === 'Enter') activateRow(row);
  else if (event.key === 'Home') void focusRow(treeRows.value[0]?.key);
  else if (event.key === 'End') void focusRow(treeRows.value.at(-1)?.key);
  else if (event.key === 'ArrowDown') void focusRow(treeRows.value[index + 1]?.key);
  else if (event.key === 'ArrowUp') void focusRow(treeRows.value[index - 1]?.key);
  else if (event.key === 'ArrowRight' && row.folder.children.size) {
    if (collapsed.value.has(row.key)) collapsed.value = new Set([...collapsed.value].filter(value => value !== row.key));
    else void focusRow(treeRows.value[index + 1]?.key);
  } else if (event.key === 'ArrowLeft') {
    if (row.folder.children.size && !collapsed.value.has(row.key)) toggleFolder(row.key);
    else void focusRow(row.parent);
  }
}
const fileIcon = (file: StudioFile) => file.kind === 'sequence' ? 'mdi-animation-outline'
  : file.metadata ? 'mdi-file-document-check-outline' : 'mdi-image-outline';
const fileStatus = (file: StudioFile) => `${file.kind === 'sequence' ? `ImageSeq · ${file.frameCount} frames · ` : ''}${file.metadata
  ? 'Metadata saved' : 'No metadata'}${file.category === 'draft' ? ' · Draft' : ''}${file.generated ? ' · Generated' : ''}`;
</script>

<template>
  <div class="studio-browser">
    <div class="studio-filter-toolbar" role="group" aria-label="Image filters">
      <div class="studio-primary-toolbar">
        <details ref="folderPicker" class="studio-folder-picker" @focusout="closePickerOnBlur" @keydown.esc.prevent.stop="closeFolderPicker">
          <summary class="btn btn-primary"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /> Select folder <i aria-hidden="true" class="mdi mdi-chevron-down" /></summary>
          <div class="studio-folder-popover">
            <div class="studio-folder-picker-heading"><strong>Select folder</strong><button type="button" class="btn btn-link btn-sm" @click="folder = 'all'; selectedKey = ''; closeFolderPicker()">Show all images</button></div>
            <div v-if="treeRows.length" ref="tree" class="studio-folder-tree" role="tree" aria-label="Select image folder" aria-multiselectable="false" @keydown="onTreeKey">
              <div v-for="row in treeRows" :key="row.key" role="treeitem" :data-studio-key="row.key" :tabindex="focusKey === row.key ? 0 : -1"
                   :class="['studio-folder', { active: folder === row.folder.path }]"
                   :style="{ paddingLeft: `${8 + row.depth * 16}px` }" :aria-level="row.depth + 1"
                   :aria-expanded="row.folder.children.size ? !collapsed.has(row.key) : undefined" :aria-selected="folder === row.folder.path"
                   :aria-label="`${folderLabel(row.folder.path)}, ${row.folder.count} assets`" :title="`${row.folder.path}\nAlt+Click to expand or collapse all subfolders`"
                   @focus="focused = row.key" @click.capture="onFolderClick($event, row)" @click.self="activateRow(row)">
                <button v-if="row.folder.children.size" type="button" class="studio-disclosure" tabindex="-1"
                        :aria-label="`${collapsed.has(row.key) ? 'Expand' : 'Collapse'} folder ${folderLabel(row.folder.path)}`"
                        :aria-expanded="!collapsed.has(row.key)" @click="toggleFolder(row.key)">
                  <i aria-hidden="true" :class="['mdi', !collapsed.has(row.key) ? 'mdi-chevron-down' : 'mdi-chevron-right']" />
                </button>
                <span v-else class="studio-disclosure-spacer" />
                <button type="button" class="studio-open" tabindex="-1" :aria-label="`Select folder ${folderLabel(row.folder.path)}`" @click="activateRow(row)">
                  <i aria-hidden="true" :class="['mdi', folder === row.folder.path ? 'mdi-folder-open-outline' : 'mdi-folder-outline']" />
                  <span>{{ row.name }}</span><span class="studio-folder-count">{{ number(row.folder.count) }}</span>
                </button>
              </div>
            </div>
            <p v-else class="studio-hint">No subfolders are available.</p>
          </div>
        </details>
        <button type="button" class="btn btn-outline-primary studio-sync-folder" aria-label="Sync folder to selected image" title="Sync folder to selected image" :disabled="working || !openImage" @click="syncFolderToImage"><i aria-hidden="true" class="mdi mdi-sync" /></button>
        <nav class="studio-folder-path" aria-label="Folder path">
          <ol>
            <li v-if="folder === 'all'"><span aria-current="location">All images</span></li>
            <li v-for="(crumb, index) in folderBreadcrumbs" :key="crumb.path">
              <span v-if="index" aria-hidden="true">/</span>
              <span v-if="index === folderBreadcrumbs.length - 1" aria-current="location"><template v-if="crumb.path !== '.'">{{ crumb.label }}</template><template v-else><i aria-hidden="true" class="mdi mdi-folder-outline" /><span class="sr-only">Game folder</span></template></span>
              <button v-else type="button" :disabled="working" :aria-label="crumb.label" @click="chooseFolder(crumb.path)"><i v-if="crumb.path === '.'" aria-hidden="true" class="mdi mdi-folder-outline" /><template v-else>{{ crumb.label }}</template></button>
            </li>
          </ol>
        </nav>
      </div>
      <div class="studio-secondary-toolbar">
        <select v-model="kind" class="form-control" aria-label="Filter by image type"><option value="all">All image types</option><option value="image">Images</option><option value="sequence">ImagesSeq</option></select>
        <select v-model="status" class="form-control" aria-label="Filter by asset status"><option value="all">All statuses</option><option value="available">Available</option><option value="missing">Missing</option><option value="invalid">Invalid</option><option value="supplementary">Supplementary</option><option value="draft">Drafts</option></select>
        <form class="studio-search" role="search" @submit.prevent>
          <i aria-hidden="true" class="mdi mdi-magnify" />
          <input v-model="query" class="form-control" type="search" aria-label="Find image" placeholder="Search files…">
          <button v-if="query" type="button" aria-label="Clear image search" @click="query = ''"><i aria-hidden="true" class="mdi mdi-close" /></button>
        </form>
        <button type="button" class="btn btn-outline-primary studio-new-image" @click="emit('create')"><i aria-hidden="true" class="mdi mdi-plus" /> New image metadata</button>
      </div>
    </div>

    <div class="studio-layout">
      <aside class="studio-sidebar" aria-label="Image files">
        <div class="studio-assets-heading"><h6>Assets <span>({{ number(matching.length) }} / {{ number(files.length) }})</span></h6><div class="studio-layout-switch" role="group" aria-label="Asset layout"><button type="button" aria-label="List view" :aria-pressed="assetLayout === 'list'" @click="assetLayout = 'list'"><i aria-hidden="true" class="mdi mdi-format-list-bulleted-square" /></button><button type="button" aria-label="Grid view" :aria-pressed="assetLayout === 'grid'" @click="assetLayout = 'grid'"><i aria-hidden="true" class="mdi mdi-view-grid-outline" /></button></div></div>
        <div v-if="matching.length" ref="assetList" :class="['studio-file-list', { 'is-grid': assetLayout === 'grid' }]" aria-label="Image list">
          <button v-for="file in matching" :key="file.file" type="button" :class="['studio-file', { active: selectedKey === `file:${file.file}` }]"
                  :title="`${file.path} · ${fileStatus(file)}`" :aria-label="`Open ${file.name}`" :aria-pressed="selectedKey === `file:${file.file}`" @click="chooseFile(file.file)">
            <span class="studio-file-thumbnail" :data-thumbnail="file.file" aria-hidden="true"><img v-if="file.exists && visiblePreviews.has(file.file) && !failedPreviews.has(file.file)" :src="thumbnailURL(file)" alt="" loading="lazy" @error="failedPreviews.add(file.file)"><i v-else :class="['mdi', fileIcon(file)]" /></span><span class="studio-file-label"><strong>{{ fileName(file) }}</strong><small>{{ fileDetails(file) }}</small></span>
          </button>
        </div>
        <div v-else class="studio-empty"><i aria-hidden="true" class="mdi mdi-magnify" /><p>No images match the filters.</p><button v-if="hasFilters" type="button" class="btn btn-outline-primary btn-sm" @click="clearFilters">Show all images</button></div>
        <p v-if="selectedHidden" class="studio-hint">The open image is outside the current filters. Its edits are kept in the editor.</p>
        <details v-if="batch" class="studio-batch">
          <summary>Batch actions</summary>
          <p v-if="selectionLabel" class="studio-hint studio-current-selection">{{ selectionLabel }}</p>
          <p class="studio-hint">{{ selectedFolder !== null ? 'Batch actions use matching images in the selected folder and its subfolders.' : selectedFile ? 'Batch actions use the selected image.' : 'Select an image or folder for batch actions.' }}</p>
          <button type="button" class="btn btn-outline-primary btn-sm" :disabled="working || !describeFiles.length" @click="emit('describe', describeFiles)">Describe batch <span class="badge badge-light">{{ number(describeFiles.length) }}</span></button>
          <button type="button" class="btn btn-outline-primary btn-sm" :disabled="working || !generationFiles.length" @click="emit('generate', generationFiles)">Generate batch <span class="badge badge-light">{{ number(generationFiles.length) }}</span></button>
        </details>
      </aside>
      <slot :destination-folder="destinationFolder" />
    </div>
  </div>
</template>

<style scoped>
.studio-browser { container-type: inline-size; }
.studio-browser.fill-height { display: flex; flex-direction: column; flex: 1; }
.fill-height .studio-layout { flex: 1; }
.fill-height .studio-file-list { flex: 1 1 0; min-height: 210px; max-height: none; align-content: start; }
.studio-filter-toolbar { margin-bottom: 12px; }
.studio-primary-toolbar { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 8px; }
.studio-sync-folder { display: inline-flex; align-items: center; justify-content: center; width: 32px; padding: 4px 0; font-size: 18px; }
.studio-secondary-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding-top: 8px; }
.studio-secondary-toolbar > .form-control { flex: 0 1 140px; min-width: 130px; width: 140px; }
.studio-folder-picker { position: relative; flex-shrink: 0; }
.studio-folder-picker > summary { display: flex; align-items: center; gap: 7px; list-style: none; }
.studio-folder-picker > summary::-webkit-details-marker { display: none; }
.studio-folder-path { min-width: 0; font-size: 11px; color: #18204e; }
.studio-folder-path ol { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 0; margin: 0; list-style: none; }
.studio-folder-path li { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; }
.studio-folder-path li > span, .studio-folder-path button { overflow-wrap: anywhere; min-width: 0; }
.studio-folder-path button { padding: 3px 1px; border: 0; background: none; color: #18204e; font: inherit; cursor: pointer; text-align: left; }
.studio-folder-path button:disabled { color: #77809a; cursor: default; }
.studio-folder-path .mdi { flex-shrink: 0; color: #a1a9b8; }
.studio-folder-popover { position: absolute; top: calc(100% + 8px); left: 0; z-index: 5; width: min(460px, calc(100vw - 88px)); padding: 16px; background: white; border: 1px solid #dce3ed; border-radius: 7px; box-shadow: 0 12px 32px #192c4926; }
.studio-folder-picker-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; font-size: 13px; }
.studio-folder-picker-heading .btn { padding: 0; }
.studio-folder-tree { max-height: 380px; overflow: auto; }
.studio-folder { display: flex; align-items: center; gap: 5px; min-height: 28px; padding: 3px 8px; font-size: 14px; line-height: 20px; border-radius: 4px; cursor: pointer; }
.studio-folder.active { background: #eef5ff; color: #2277cf; }
.studio-open { display: flex; align-items: center; flex: 1; min-width: 0; gap: 7px; padding: 0; border: 0; background: none; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.studio-open > span { overflow-wrap: anywhere; min-width: 0; }
.studio-disclosure, .studio-disclosure-spacer { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; width: 16px; padding: 0; border: 0; background: none; color: inherit; }
.studio-disclosure { cursor: pointer; }
.studio-folder-count { margin-left: auto; font-size: 12px; color: #77809a; }
.studio-new-image { margin-left: auto; }
.studio-layout { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 12px; align-items: stretch; }
.studio-sidebar { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 10px 8px; border: 1px solid #dce2f2; border-radius: 7px; box-shadow: 0 2px 5px #18204e06; }
.studio-assets-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.studio-assets-heading h6 { margin: 0; font-size: 13px; font-weight: 600; color: #18204e; }
.studio-assets-heading h6 > span { font-size: 11px; font-weight: 400; }
.studio-layout-switch { display: flex; gap: 3px; }
.studio-layout-switch button { padding: 2px 4px; border: 1px solid #dce2f2; border-radius: 4px; background: white; color: #18204e; cursor: pointer; font-size: 15px; }
.studio-layout-switch button[aria-pressed=true] { background: #e2e4ff; border-color: #cfd3ff; color: #2336ff; }
.studio-search { flex: 1 1 180px; display: flex; align-items: center; min-width: 0; position: relative; }
.studio-search > .mdi { position: absolute; left: 10px; color: #8c93a3; }
.studio-search .form-control { width: 100%; padding-left: 28px; padding-right: 24px; }
.studio-search input::-webkit-search-cancel-button { display: none; }
.studio-search button { position: absolute; right: 6px; border: 0; background: none; color: #77809a; cursor: pointer; }
.studio-batch summary { cursor: pointer; font-size: 12px; color: #68718a; }
.studio-hint { margin: 0; font-size: 12px; color: #77809a; line-height: 1.5; overflow-wrap: anywhere; }
.studio-file-list { max-height: 355px; overflow: auto; scrollbar-width: thin; }
.studio-file { display: flex; align-items: center; gap: 8px; text-align: left; padding: 6px; width: 100%; color: #18204e; background: white; border: 1px solid transparent; border-radius: 5px; cursor: pointer; }
.studio-file + .studio-file { margin-top: 2px; }
.studio-file.active { background: #dfe1ff; color: #131b58; border-color: #d5d9ff; }
.studio-file-label { flex: 1; min-width: 0; font-size: 11px; }
.studio-file-label strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.studio-file-thumbnail { flex: 0 0 58px; width: 58px; height: 36px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 3px; background: repeating-conic-gradient(#f1f2f7 0% 25%, white 0% 50%) 50% / 8px 8px; }
.studio-file-thumbnail img { width: 100%; height: 100%; object-fit: contain; }
.studio-file-thumbnail .mdi { font-size: 20px; color: #8d96b1; }
.studio-file-list.is-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.is-grid .studio-file { flex-direction: column; align-items: stretch; gap: 6px; margin-top: 0; }
.is-grid .studio-file-thumbnail { flex: none; width: 100%; height: 65px; }
.studio-file small { display: block; color: #68718a; margin-top: 3px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.studio-file > .mdi, .studio-open > .mdi { flex-shrink: 0; }
.studio-batch { padding-top: 14px; border-top: 1px solid #e0e4ec; }
.studio-batch > :not(summary) { margin-top: 10px; }
.studio-batch .btn { width: 100%; }
.studio-empty { text-align: center; font-size: 12px; color: #77809a; padding: 24px 10px; }
.studio-empty > .mdi { font-size: 24px; }
@container (max-width: 800px) { .studio-layout { grid-template-columns: 200px minmax(0, 1fr); } }
@container (max-width: 550px) { .studio-layout { grid-template-columns: minmax(0, 1fr); } .studio-file-list { max-height: 210px; } .studio-new-image { margin-left: auto; } }
@container (max-width: 550px) { .fill-height .studio-file-list { flex: none; min-height: 0; max-height: 210px; } }
@container (max-width: 350px) { .studio-primary-toolbar { grid-template-columns: minmax(0, 1fr) auto; } .studio-folder-path { grid-column: 1 / -1; } }
@media (min-width: 992px) {
  .studio-browser.fill-height, .fill-height .studio-layout, .fill-height .studio-sidebar, .fill-height .studio-file-list { min-height: 0; }
  .fill-height .studio-layout { grid-template-rows: minmax(0, 1fr); }
}

@media (pointer: coarse) { .studio-folder { min-height: 44px; } }
</style>
