<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
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
const errorLine = ref<number | null>(null);
const editor = ref<HTMLTextAreaElement>();
const scrollTop = ref(0);
const statusId = useId();

/** JSON.parse reports a line or a character offset, depending on the browser and the error. */
function problemLine(value: string, message: string): number {
  const line = /line (\d+) column \d+\)?(?: of the JSON data)?$/i.exec(message);
  if (line) return Math.min(Number(line[1]), value.split('\n').length);
  const position = /position (\d+)(?: \(line \d+ column \d+\))?$/i.exec(message);
  let offset = position ? Number(position[1]) : value.length;
  if (!position && !/end of (?:JSON input|data)/i.test(message)) {
    // Some browsers omit the position for invalid tokens. Skip valid JSON tokens to find the offending one.
    const token = /\s+|"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/gy;
    offset = 0;
    while (token.exec(value)) offset = token.lastIndex;
  }
  return value.slice(0, offset).split('\n').length;
}

function validate(value: string): boolean {
  problem.value = '';
  errorLine.value = null;
  if (isJson.value) {
    try { JSON.parse(value); } catch (e) {
      problem.value = (e as Error).message;
      errorLine.value = problemLine(value, problem.value);
    }
  }
  return !problem.value;
}

function goToError() {
  if (!editor.value || errorLine.value === null) return;
  const offset = text.value.split('\n').slice(0, errorLine.value - 1).reduce((total, line) => total + line.length + 1, 0);
  editor.value.focus();
  editor.value.setSelectionRange(offset, offset);
  editor.value.scrollTop = Math.max(0, (errorLine.value - 1) * 18 - editor.value.clientHeight / 2 + 8);
  scrollTop.value = editor.value.scrollTop;
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch([text, isJson], ([value]) => {
  clearTimeout(timer);
  problem.value = '';
  errorLine.value = null;
  if (!isJson.value) return;
  timer = setTimeout(() => validate(value), 300);
});
watch(dirty, value => emit('dirty', value));
onBeforeUnmount(() => { clearTimeout(timer); emit('dirty', false); });

async function load() {
  loading.value = true;
  loadError.value = '';
  clearTimeout(timer);
  problem.value = '';
  errorLine.value = null;
  scrollTop.value = 0;
  try {
    const file = await readTextFile(props.file);
    crlf.value = file.text.includes('\r\n') && !/(^|[^\r])\n/.test(file.text);
    saved.value = file.text.replace(/\r\n/g, '\n');
    text.value = saved.value;
    revision.value = file.revision;
    validate(text.value);
  } catch (e) { loadError.value = (e as Error).message; }
  loading.value = false;
}
watch(() => props.file, load, { immediate: true });

async function save() {
  if (!dirty.value || saving.value || !validate(text.value)) return;
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
      <div class="text-editor-input">
        <div v-if="errorLine !== null" class="text-editor-highlights" aria-hidden="true">
          <div class="text-editor-error-line" :data-line="errorLine" :style="{ top: `${8 + (errorLine - 1) * 18 - scrollTop}px` }" />
        </div>
        <textarea ref="editor" v-model="text" class="form-control text-editor-area" :aria-label="`Text of ${name}`"
                  :aria-invalid="!!problem || undefined" :aria-describedby="statusId" spellcheck="false" wrap="off"
                  @scroll="scrollTop = ($event.target as HTMLTextAreaElement).scrollTop"
                  @keydown.ctrl.s.prevent="save" @keydown.meta.s.prevent="save" />
      </div>
      <div class="text-editor-bar">
        <span :id="statusId" :class="['text-editor-status', problem ? 'text-danger' : 'text-muted']" role="status">
          <template v-if="problem">Not valid JSON: {{ problem }}</template>
          <template v-else>{{ dirty ? 'Unsaved changes' : 'Saved' }} · {{ number(lines) }} line{{ plural(lines) }}</template>
        </span>
        <button v-if="errorLine !== null" type="button" class="btn btn-outline-danger btn-sm" :aria-label="`Go to error on line ${errorLine}`" @click="goToError">Line {{ errorLine }}</button>
        <button type="button" class="btn btn-light btn-sm" :disabled="!dirty || saving" @click="revert">Revert</button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="!dirty || saving || !!problem" @click="save">
          <i v-if="saving" aria-hidden="true" class="mdi mdi-loading mdi-spin" />{{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.text-editor-input { position: relative; background: #fff; }
.text-editor-highlights { position: absolute; inset: 1px; overflow: hidden; pointer-events: none; }
.text-editor-error-line { position: absolute; left: 0; right: 0; height: 18px; background: #fce0e3; border-left: 3px solid #c82333; }
.text-editor-input .text-editor-area { position: relative; display: block; height: 42vh; min-height: 200px; padding: 8px 10px; resize: vertical; font-family: monospace; font-size: 12px; line-height: 18px; white-space: pre; overflow: auto; tab-size: 4; }
.text-editor-area, .text-editor-area:focus { background-color: transparent; }
.text-editor-bar { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.text-editor-status { flex: 1; min-width: 0; font-size: 12px; overflow-wrap: anywhere; }
@media (max-width: 767.98px) { .text-editor-input .text-editor-area { height: 32vh; } }
</style>
