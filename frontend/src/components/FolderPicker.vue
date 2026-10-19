<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { MoveFolderList } from '../types';
import { browseMoveFolder, moveFolders } from '../workspace';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [string] }>();
const path = computed(() => props.modelValue.replaceAll('\\', '/').replace(/\/+$/, '') || '.');
const listing = ref<MoveFolderList | null>(null);
const loading = ref(false);
const error = ref('');
const browsing = ref(false);
let disposed = false;
async function browse() {
  if (browsing.value) return;
  browsing.value = true;
  error.value = '';
  try {
    const result = await browseMoveFolder();
    if (!disposed && result.path !== null) choose(result.path);
  } catch (e) {
    if (!disposed) error.value = (e as Error).message;
  } finally { browsing.value = false; }
}
let request = 0;
async function load() {
  const id = ++request;
  listing.value = null;
  error.value = '';
  loading.value = true;
  try {
    const result = await moveFolders(path.value);
    if (id === request) listing.value = result;
  } catch (e) {
    if (id === request) error.value = (e as Error).message;
  } finally {
    if (id === request) loading.value = false;
  }
}
watch(path, load, { immediate: true });
const crumbs = computed(() => {
  const parts = path.value.split('/').filter(part => part && part !== '.');
  return [{ name: 'Game folder', path: '.' }, ...parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }))];
});
function choose(value: string) { emit('update:modelValue', value || '.'); }
function enter(event: Event) {
  const select = event.target as HTMLSelectElement;
  if (select.value) choose(select.value);
  select.value = '';
}

// Keep the selected end of a long path visible, with carousel controls for earlier ancestors.
const rail = ref<HTMLElement>();
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
function updateScroll() {
  if (!rail.value) return;
  canScrollLeft.value = rail.value.scrollLeft > 1;
  canScrollRight.value = rail.value.scrollLeft + rail.value.clientWidth < rail.value.scrollWidth - 1;
}
function scroll(direction: number) {
  rail.value?.scrollBy({ left: direction * rail.value.clientWidth * 0.75, behavior: 'smooth' });
}
function revealCurrentFolder() {
  if (rail.value) rail.value.scrollLeft = rail.value.scrollWidth;
  updateScroll();
}
watch([crumbs, listing], async () => {
  await nextTick();
  rail.value?.scrollTo({ left: rail.value.scrollWidth, behavior: 'smooth' });
  updateScroll();
});
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(revealCurrentFolder);
  if (rail.value) observer.observe(rail.value);
  revealCurrentFolder();
});
onBeforeUnmount(() => { disposed = true; request++; observer?.disconnect(); });
</script>

<template>
  <section class="folder-picker" aria-label="Destination folder">
    <div class="folder-picker-carousel">
      <button v-show="canScrollLeft || canScrollRight" type="button" class="folder-picker-scroll" aria-label="Scroll folder path left" :disabled="!canScrollLeft" @click="scroll(-1)"><i class="mdi mdi-chevron-left" aria-hidden="true" /></button>
      <nav ref="rail" class="folder-picker-path" aria-label="Folder breadcrumbs" @scroll="updateScroll">
        <button type="button" class="details-icon folder-picker-open" aria-label="Browse destination folder" title="Browse folders (starts in the game folder)" :disabled="browsing" :aria-busy="browsing" @click="browse"><i :class="['mdi', browsing ? 'mdi-loading mdi-spin' : 'mdi-folder-open-outline']" aria-hidden="true" /></button>
        <template v-for="(crumb, index) in crumbs" :key="crumb.path">
          <span v-if="index" class="folder-picker-separator" aria-hidden="true">/</span>
          <button type="button" :class="['folder-picker-crumb', { active: index === crumbs.length - 1, root: !index }]"
                  :aria-current="index === crumbs.length - 1 ? 'location' : undefined" :title="crumb.path"
                  @click="choose(crumb.path)">{{ crumb.name }}</button>
        </template>
        <template v-if="listing?.folders.length">
          <span class="folder-picker-separator" aria-hidden="true">/</span>
          <select class="form-control folder-picker-children" aria-label="Open subfolder" :value="''" @change="enter">
            <option value="">Choose subfolder</option>
            <option v-for="folder in listing.folders" :key="folder.path" :value="folder.path">{{ folder.name }}</option>
          </select>
        </template>
        <button type="button" class="btn btn-light folder-picker-refresh" :disabled="loading" aria-label="Refresh folders" title="Refresh folders" @click="load"><i :class="['mdi', loading ? 'mdi-loading mdi-spin' : 'mdi-refresh']" aria-hidden="true" /></button>
      </nav>
      <button v-show="canScrollLeft || canScrollRight" type="button" class="folder-picker-scroll" aria-label="Scroll folder path right" :disabled="!canScrollRight" @click="scroll(1)"><i class="mdi mdi-chevron-right" aria-hidden="true" /></button>
    </div>
    <div class="folder-picker-manual">
      <label class="folder-picker-input">Target folder
        <input :value="modelValue" class="form-control" placeholder=". (game folder)" autocomplete="off" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)">
      </label>
      <small class="text-muted">Use a relative path to create a new folder inside this game.</small>
    </div>
    <p v-if="listing?.exists === false" class="folder-picker-note text-muted" role="status">This folder will be created when you apply the move.</p>
    <p v-if="error" class="folder-picker-note text-danger" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.folder-picker { min-width: 0; }
.folder-picker-carousel { display: flex; align-items: center; gap: 5px; min-width: 0; }
.folder-picker-scroll { flex: 0 0 28px; height: 32px; border: 0; border-radius: 5px; background: #edf0f5; color: #4b49ac; cursor: pointer; }
.folder-picker-scroll:disabled { opacity: 0.3; cursor: default; }
.folder-picker-path { display: flex; flex: 1; align-items: center; gap: 14px; min-width: 0; min-height: 52px; padding: 7px 12px; overflow-x: auto; border: 1px solid #dfe3eb; border-radius: 5px; background: #fff; scrollbar-width: thin; }
.folder-picker-crumb { flex-shrink: 0; display: inline-flex; align-items: center; gap: 10px; padding: 4px 0; border: 0; background: transparent; color: #4b49ac; font-family: inherit; font-size: 14px; white-space: nowrap; text-decoration: underline; cursor: pointer; }
.folder-picker-crumb.root { color: #606a80; text-decoration: none; }
.folder-picker-open { font-size: 22px; }
.folder-picker-crumb:hover, .folder-picker-crumb:focus-visible { color: #4b49ac; text-decoration: underline; }
.folder-picker-crumb.active { color: #4b49ac; font-weight: 600; }
.folder-picker-separator { flex-shrink: 0; color: #8b96a3; }
.folder-picker-children { flex: 0 0 200px; width: 200px; min-width: 0; height: 34px; padding: 5px 10px; border-radius: 4px; background-color: #f8f9fc; font-family: inherit; font-size: 13px; }
.folder-picker-refresh { flex-shrink: 0; height: 32px; padding: 5px 8px; background: transparent; color: #727b90; }
.folder-picker-manual { margin-top: 10px; }
.folder-picker-input { display: block; margin: 0 0 6px; font-size: 12px; }
.folder-picker-input input { height: 40px; margin-top: 5px; font-family: monospace; font-size: 13px; }
.folder-picker-note { margin: 8px 0 0; font-size: 12px; }
@media (max-width: 575px) { .folder-picker-path { gap: 8px; padding: 7px 8px; } .folder-picker-children { flex-basis: 140px; width: 140px; } }
</style>
