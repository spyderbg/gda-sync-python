<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { baseName, number } from '../format';
import type { StudioFile } from '../imageStudio';
import ButtonTooltip from './ButtonTooltip.vue';

const props = defineProps<{ files: StudioFile[]; selected: string; working: boolean; batch: boolean }>();
const emit = defineEmits<{ select: [file: string]; create: []; analyze: [files: string[]]; generate: [files: string[]] }>();
type MetadataFilter = 'all' | 'with' | 'without';
const metadataFilter = ref<MetadataFilter>('all');
const kind = ref<'all' | StudioFile['kind']>('all');
const status = ref<'all' | StudioFile['category']>('all');
const folder = ref('all');
const query = ref('');
const layout = ref<'tree' | 'list'>('tree');
const collapsed = ref(new Set<string>());
const selectedKey = ref('');
watch(() => props.selected, file => { selectedKey.value = file ? `file:${file}` : ''; }, { immediate: true });
const focused = ref('');
// Reveal matching branches when a search changes; users can still collapse them afterwards.
watch(query, value => { if (value.trim()) collapsed.value = new Set(); });
const tree = ref<HTMLElement>();
const FILTERS: { key: MetadataFilter; label: string; hint: string }[] = [
  { key: 'all', label: 'All', hint: 'Every image, animation and draft matching the other filters.' },
  { key: 'with', label: 'With metadata', hint: 'Assets with a saved metadata JSON file, including manually created drafts.' },
  { key: 'without', label: 'Without metadata', hint: 'Assets without a saved metadata JSON file. Analyze them or save metadata manually.' },
];
const folderLabel = (value: string) => value === '.' ? 'Game folder' : value === '..' ? 'Shared resources' : value;
const folders = computed(() => [...new Set(props.files.map(file => file.folder))].sort((a, b) => a.localeCompare(b)));
watch(folders, values => { if (folder.value !== 'all' && !values.includes(folder.value)) folder.value = 'all'; });
const scoped = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return props.files.filter(file => (kind.value === 'all' || file.kind === kind.value)
    && (status.value === 'all' || file.category === status.value)
    && (folder.value === 'all' || file.folder === folder.value || file.folder.startsWith(`${folder.value}/`)
      || (folder.value === '.' && !file.folder.startsWith('..')))
    && (!needle || `${file.name}\n${file.path}\n${file.folder}`.toLowerCase().includes(needle)));
});
const counts = computed(() => ({ all: scoped.value.length, with: scoped.value.filter(file => file.metadata).length,
  without: scoped.value.filter(file => !file.metadata).length }));
const matching = computed(() => scoped.value.filter(file => metadataFilter.value === 'all'
  || file.metadata === (metadataFilter.value === 'with')));
// One selected image or folder determines the batch scope.
const selectedFolder = computed(() => selectedKey.value.startsWith('folder:') ? selectedKey.value.slice(7) : null);
const selectedFile = computed(() => props.files.find(file => selectedKey.value === `file:${file.file}`));
const belongsToFolder = (file: StudioFile, path: string) => file.folder === path || file.folder.startsWith(`${path}/`)
  || (path === '.' && !file.folder.startsWith('..'));
const batchFiles = computed(() => selectedFolder.value !== null
  ? matching.value.filter(file => belongsToFolder(file, selectedFolder.value!))
  : selectedFile.value ? [selectedFile.value] : []);
const analysisFiles = computed(() => batchFiles.value.filter(file => file.exists).map(file => file.file));
const generationFiles = computed(() => batchFiles.value.filter(file => file.metadata).map(file => file.file));
const selectionLabel = computed(() => selectedFolder.value !== null ? `Selected folder: ${folderLabel(selectedFolder.value)}`
  : selectedFile.value ? `Selected image: ${selectedFile.value.name}` : '');
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
const hasFilters = computed(() => metadataFilter.value !== 'all' || kind.value !== 'all' || status.value !== 'all'
  || folder.value !== 'all' || !!query.value);
function clearFilters() {
  metadataFilter.value = kind.value = status.value = 'all';
  folder.value = 'all';
  query.value = '';
}

type FolderNode = { key: string; path: string; name: string; children: Map<string, FolderNode>; files: StudioFile[]; count: number };
type TreeRow = { key: string; parent: string; depth: number; name: string; folder?: FolderNode; file?: StudioFile };
const roots = computed(() => {
  const root: FolderNode = { key: 'folder:.', path: '.', name: 'Game folder', children: new Map(), files: [], count: 0 };
  const shared: FolderNode = { key: 'folder:..', path: '..', name: 'Shared resources', children: new Map(), files: [], count: 0 };
  for (const file of matching.value) {
    const parts = file.folder === '.' ? [] : file.folder.split('/');
    let node = parts[0] === '..' ? shared : root;
    if (node === shared) parts.shift();
    node.count++;
    for (const part of parts) {
      const path = node.path === '.' ? part : `${node.path}/${part}`;
      if (!node.children.has(part)) node.children.set(part,
        { key: `folder:${path}`, path, name: part, children: new Map(), files: [], count: 0 });
      node = node.children.get(part)!;
      node.count++;
    }
    node.files.push(file);
  }
  return [root, shared].filter(node => node.count);
});
const folderKeys = computed(() => {
  const keys: string[] = [];
  const visit = (node: FolderNode) => { keys.push(node.key); node.children.forEach(visit); };
  roots.value.forEach(visit);
  return keys;
});
const treeRows = computed(() => {
  const rows: TreeRow[] = [];
  const visit = (node: FolderNode, depth: number, parent: string) => {
    rows.push({ key: node.key, parent, depth, name: node.name, folder: node });
    if (collapsed.value.has(node.key)) return;
    [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach(child => visit(child, depth + 1, node.key));
    [...node.files].sort((a, b) => a.name.localeCompare(b.name)).forEach(file => rows.push({ key: `file:${file.file}`,
      parent: node.key, depth: depth + 1, name: file.kind === 'sequence' ? file.name : baseName(file.path), file }));
  };
  roots.value.forEach(node => visit(node, 0, ''));
  return rows;
});
function activateRow(row: TreeRow) {
  if (props.working) return;
  if (row.folder) selectedKey.value = row.key;
  else chooseFile(row.file!.file);
}
const focusKey = computed(() => treeRows.value.some(row => row.key === focused.value) ? focused.value
  : treeRows.value.find(row => row.key === selectedKey.value)?.key ?? treeRows.value[0]?.key);
function toggleFolder(key: string) {
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  collapsed.value = next;
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
  else if (event.key === 'ArrowRight' && row.folder) {
    if (collapsed.value.has(row.key)) collapsed.value = new Set([...collapsed.value].filter(value => value !== row.key));
    else void focusRow(treeRows.value[index + 1]?.key);
  } else if (event.key === 'ArrowLeft') {
    if (row.folder && !collapsed.value.has(row.key)) toggleFolder(row.key);
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
    <div class="studio-filter-toolbar" role="group" aria-label="Image filters and layout">
      <div class="btn-group" role="group" aria-label="Image browser layout">
        <button type="button" :class="['btn', 'btn-secondary', { active: layout === 'tree' }]" aria-label="Tree view" :aria-pressed="layout === 'tree'" @click="layout = 'tree'"><i aria-hidden="true" class="mdi mdi-file-tree" /></button>
        <button type="button" :class="['btn', 'btn-secondary', { active: layout === 'list' }]" aria-label="List view" :aria-pressed="layout === 'list'" @click="layout = 'list'"><i aria-hidden="true" class="mdi mdi-view-list-outline" /></button>
      </div>
      <div class="btn-group studio-metadata-filter" role="group" aria-label="Filter by metadata">
        <ButtonTooltip v-for="item in FILTERS" :key="item.key" :text="item.hint" v-slot="{ bindings }">
          <button v-bind="bindings" type="button" :class="['btn', 'btn-secondary', { active: metadataFilter === item.key }]" :aria-label="item.label === 'All' ? 'All metadata states' : item.label" :aria-pressed="metadataFilter === item.key" @click="metadataFilter = item.key">
            {{ item.label }} <span class="library-filter-count">{{ number(counts[item.key]) }}</span>
          </button>
        </ButtonTooltip>
      </div>
      <select v-model="kind" class="form-control" aria-label="Filter by image type"><option value="all">All image types</option><option value="image">Images</option><option value="sequence">ImagesSeq</option></select>
      <select v-model="status" class="form-control" aria-label="Filter by asset status"><option value="all">All statuses</option><option value="available">Available</option><option value="missing">Missing</option><option value="invalid">Invalid</option><option value="supplementary">Supplementary</option><option value="draft">Drafts</option></select>
      <select v-model="folder" class="form-control studio-folder-filter" aria-label="Filter by folder"><option value="all">All folders</option><option v-for="value in folders" :key="value" :value="value">{{ folderLabel(value) }}</option></select>
      <form class="studio-search" role="search" @submit.prevent>
        <i aria-hidden="true" class="mdi mdi-magnify" />
        <input v-model="query" class="form-control" type="search" aria-label="Find image" placeholder="Search paths, names or sequences…">
        <button v-if="query" type="button" aria-label="Clear image search" @click="query = ''"><i aria-hidden="true" class="mdi mdi-close" /></button>
      </form>
      <button v-if="hasFilters" type="button" class="btn btn-link btn-sm" @click="clearFilters">Clear filters</button>
      <button type="button" class="btn btn-outline-primary studio-new-image" @click="emit('create')"><i aria-hidden="true" class="mdi mdi-plus" /> New image metadata</button>
    </div>
    <div class="studio-layout">
      <aside class="studio-sidebar" aria-label="Image files">
        <p class="studio-hint">{{ number(matching.length) }} of {{ number(files.length) }} images, animations and drafts</p>
        <p v-if="selectionLabel" class="studio-hint studio-current-selection">{{ selectionLabel }}</p>
        <div v-if="layout === 'tree' && matching.length" class="studio-tree-controls">
          <button type="button" class="btn btn-link btn-sm" @click="collapsed = new Set()">Expand all</button>
          <button type="button" class="btn btn-link btn-sm" @click="collapsed = new Set(folderKeys)">Collapse all</button>
        </div>
        <div v-if="layout === 'tree' && matching.length" ref="tree" class="studio-file-list" role="tree" aria-label="Image folders" aria-multiselectable="false" @keydown="onTreeKey">
          <div v-for="row in treeRows" :key="row.key" role="treeitem" :data-studio-key="row.key" :tabindex="focusKey === row.key ? 0 : -1"
               :class="[row.folder ? 'studio-folder' : 'studio-file', { active: selectedKey === row.key }]"
               :style="{ paddingLeft: `${10 + row.depth * 14}px` }" :aria-level="row.depth + 1"
               :aria-expanded="row.folder ? !collapsed.has(row.key) : undefined" :aria-selected="selectedKey === row.key"
               :aria-label="row.folder ? `${row.folder.path === '.' ? 'Game folder' : row.folder.path}, ${row.folder.count} assets` : `Open ${row.file!.name}`"
               :title="row.folder?.path ?? row.file?.path" @focus="focused = row.key" @click.self="activateRow(row)">
            <button v-if="row.folder" type="button" class="studio-disclosure" tabindex="-1"
                    :aria-label="`${collapsed.has(row.key) ? 'Expand' : 'Collapse'} folder ${folderLabel(row.folder.path)}`"
                    :aria-expanded="!collapsed.has(row.key)" @click="toggleFolder(row.key)">
              <i aria-hidden="true" :class="['mdi', !collapsed.has(row.key) ? 'mdi-chevron-down' : 'mdi-chevron-right']" />
            </button>
            <button type="button" class="studio-open" tabindex="-1" :aria-label="row.folder ? `Select folder ${folderLabel(row.folder.path)}` : `Open ${row.file!.name}`"
                    :aria-pressed="row.folder ? selectedKey === row.key : undefined" @click="activateRow(row)">
              <i aria-hidden="true" :class="['mdi', row.folder ? 'mdi-folder-outline' : fileIcon(row.file!)]" />
              <span>{{ row.name }}<small v-if="row.file">{{ fileStatus(row.file) }}</small></span>
              <span v-if="row.folder" class="studio-folder-count">{{ number(row.folder.count) }}</span>
            </button>
          </div>
        </div>
        <div v-else-if="matching.length" class="studio-file-list" aria-label="Image list">
          <button v-for="file in matching" :key="file.file" type="button" :class="['studio-file', { active: selectedKey === `file:${file.file}` }]"
                  :title="file.path" :aria-label="`Open ${file.name}`" :aria-pressed="selectedKey === `file:${file.file}`" @click="chooseFile(file.file)">
            <i aria-hidden="true" :class="['mdi', fileIcon(file)]" /><span>{{ file.name }}<small>{{ fileStatus(file) }}</small></span>
          </button>
        </div>
        <div v-else class="studio-empty"><i aria-hidden="true" class="mdi mdi-magnify" /><p>No images match the filters.</p><button v-if="hasFilters" type="button" class="btn btn-outline-primary btn-sm" @click="clearFilters">Show all images</button></div>
        <p v-if="selectedHidden" class="studio-hint">The open image is outside the current filters. Its edits are kept in the editor.</p>
        <div v-if="batch" class="studio-batch">
          <p class="studio-hint">{{ selectedFolder !== null ? 'Batch actions use matching images in the selected folder and its subfolders.' : selectedFile ? 'Batch actions use the selected image.' : 'Select an image or folder for batch actions.' }}</p>
          <button type="button" class="btn btn-outline-primary btn-sm" :disabled="working || !analysisFiles.length" @click="emit('analyze', analysisFiles)">Analyze batch <span class="badge badge-light">{{ number(analysisFiles.length) }}</span></button>
          <button type="button" class="btn btn-outline-primary btn-sm" :disabled="working || !generationFiles.length" @click="emit('generate', generationFiles)">Generate batch <span class="badge badge-light">{{ number(generationFiles.length) }}</span></button>
        </div>
      </aside>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.studio-filter-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 14px 16px; margin-bottom: 22px; border: 1px solid #e0e5e9; border-radius: 8px; background: #fff; }
.studio-filter-toolbar > .form-control { width: auto; max-width: 200px; height: 34px; font-size: 12px; }
.studio-metadata-filter { flex-wrap: wrap; }
.studio-metadata-filter .btn { white-space: nowrap; }
.studio-search { display: flex; align-items: center; flex: 1 1 240px; min-width: 0; position: relative; }
.studio-search > .mdi { position: absolute; left: 10px; color: #8c93a3; }
.studio-search .form-control { width: 100%; padding-left: 30px; padding-right: 30px; height: 34px; font-size: 12px; }
.studio-search button { position: absolute; right: 6px; border: 0; background: none; color: #77809a; cursor: pointer; }
.studio-new-image { margin-left: auto; }
.studio-layout { display: grid; grid-template-columns: minmax(240px, 290px) minmax(0, 1fr); gap: 28px; align-items: start; }
.studio-sidebar { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 0; min-width: 0; }
.studio-hint { margin: 0; font-size: 12px; color: #77809a; line-height: 1.5; overflow-wrap: anywhere; }
.studio-tree-controls { display: flex; gap: 12px; }
.studio-tree-controls .btn { padding: 0; font-size: 11px; }
.studio-file-list { max-height: 560px; overflow: auto; border: 1px solid #e0e4ec; border-radius: 6px; }
.studio-file, .studio-folder { display: flex; align-items: flex-start; gap: 7px; text-align: left; padding: 11px; width: 100%; color: #384057; background: white; border: 0; border-bottom: 1px solid #edf0f5; cursor: pointer; }
.studio-file.active, .studio-folder.active { background: #eeedfc; color: #4b49ac; box-shadow: inset 3px 0 #4b49ac; }
.studio-file > span, .studio-open > span { overflow-wrap: anywhere; font-size: 12px; min-width: 0; }
.studio-file small, .studio-open small { display: block; color: #77809a; margin-top: 3px; }
.studio-folder { align-items: center; font-size: 12px; background: #f8f9fc; font-weight: 500; }
.studio-folder > span { overflow-wrap: anywhere; min-width: 0; }
.studio-open { display: flex; align-items: inherit; flex: 1; min-width: 0; gap: 7px; padding: 0; border: 0; background: none; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.studio-disclosure { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; width: 16px; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; }
.studio-folder-count { margin-left: auto; font-size: 11px; color: #77809a; }
.studio-file > .mdi, .studio-open > .mdi { flex-shrink: 0; }
.studio-batch { display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid #e0e4ec; }
.studio-empty { text-align: center; font-size: 12px; color: #77809a; padding: 24px 10px; border: 1px solid #e0e4ec; border-radius: 6px; }
.studio-empty > .mdi { font-size: 24px; }
@media (max-width: 900px) { .studio-layout { grid-template-columns: minmax(0, 1fr); } .studio-sidebar { position: static; } .studio-file-list { max-height: 300px; } }
@media (max-width: 575px) { .studio-filter-toolbar { padding: 12px; gap: 10px; } .studio-filter-toolbar > .form-control { flex: 1 1 100%; max-width: 100%; } .studio-search { flex-basis: 100%; } .studio-new-image { width: 100%; } }
</style>
