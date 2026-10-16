<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { extensionOf, number, plural } from '../format';
import { readTextFile, saveTextFile } from '../workspace';

// A simple editor of a text file of the game, such as a .csv, .json or .txt: its text, which Save writes back, after
// saving the previous version in the backups, and Revert takes back to what was saved. A .json file that is not valid
// JSON cannot be saved. Line endings stay as the file has them. dirty tells whether there are changes not saved.
const props = defineProps<{ file: string; name: string }>();
const emit = defineEmits<{ dirty: [boolean] }>();

const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const saved = ref('');
const text = ref('');
const revision = ref('');
// The file's line ending, when all its lines end the same way, and which the text is edited without.
const crlf = ref(false);
const dirty = computed(() => text.value !== saved.value);
const isJson = computed(() => extensionOf(props.name) === 'json');
const lines = computed(() => (text.value ? text.value.split('\n').length : 0));

// What is wrong with a .json file's text, checked a moment after the typing stops.
const problem = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;
watch(text, value => {
  clearTimeout(timer);
  if (!isJson.value) return;
  timer = setTimeout(() => {
    try { JSON.parse(value); problem.value = ''; } catch (e) { problem.value = (e as Error).message; }
  }, 300);
});
watch(dirty, value => emit('dirty', value));
onBeforeUnmount(() => { clearTimeout(timer); emit('dirty', false); });

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const file = await readTextFile(props.file);
    crlf.value = file.text.includes('\r\n') && !/(^|[^\r])\n/.test(file.text);
    saved.value = file.text.replace(/\r\n/g, '\n');
    text.value = saved.value;
    revision.value = file.revision;
    problem.value = '';
  } catch (e) { loadError.value = (e as Error).message; }
  loading.value = false;
}
watch(() => props.file, load, { immediate: true });

async function save() {
  if (!dirty.value || saving.value || problem.value) return;
  saving.value = true;
  const current = text.value;
  const next = await saveTextFile(props.file, crlf.value ? current.replace(/\n/g, '\r\n') : current, revision.value);
  if (next) { revision.value = next; saved.value = current; }
  saving.value = false;
}
function revert() { text.value = saved.value; }
</script>

<template>
  <div class="text-editor">
    <p v-if="loading" class="text-muted mb-0"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" /> Reading the file…</p>
    <p v-else-if="loadError" class="text-muted mb-0" role="alert"><i aria-hidden="true" class="mdi mdi-file-alert-outline" /> {{ loadError }}</p>
    <template v-else>
      <textarea v-model="text" class="form-control text-editor-area" :aria-label="`Text of ${name}`" spellcheck="false" wrap="off"
                @keydown.ctrl.s.prevent="save" @keydown.meta.s.prevent="save" />
      <div class="text-editor-bar">
        <span :class="['text-editor-status', problem ? 'text-danger' : 'text-muted']" role="status">
          <template v-if="problem">Not valid JSON: {{ problem }}</template>
          <template v-else>{{ dirty ? 'Unsaved changes' : 'Saved' }} · {{ number(lines) }} line{{ plural(lines) }}</template>
        </span>
        <button type="button" class="btn btn-light btn-sm" :disabled="!dirty || saving" @click="revert">Revert</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="!dirty || saving || !!problem" @click="save">
          <i v-if="saving" aria-hidden="true" class="mdi mdi-loading mdi-spin" />{{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.text-editor-area { height: 42vh; min-height: 200px; padding: 8px 10px; resize: vertical; font-family: monospace; font-size: 12px; line-height: 1.5; white-space: pre; overflow: auto; tab-size: 4; }
.text-editor-bar { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.text-editor-status { flex: 1; min-width: 0; font-size: 12px; overflow-wrap: anywhere; }
@media (max-width: 767.98px) { .text-editor-area { height: 32vh; } }
</style>
