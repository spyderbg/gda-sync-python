<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, ref } from 'vue';
import MarkdownText from '../components/MarkdownText.vue';
import PageHeader from '../components/PageHeader.vue';
import { startingViewLayout, updateGameAgentActivity } from '../composables/useGameAgentActivity';
import { api, config, notify } from '../workspace';

type ClaudeModel = 'opus' | 'sonnet' | 'haiku';
const modelNames: Record<ClaudeModel, string> = { opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' };

interface AgentStatus {
  running: boolean;
  kind: string | null;
  files: string[];
  log: string[];
  result: { report: string; cost: number | null; turns: number | null } | null;
  error: string | null;
  execution?: {
    model?: string | null;
    invocation: { skill: string; arguments: string[]; validated: boolean };
    startedAt: number;
    durationSeconds: number | null;
    gamePath: string;
    calls: { id: string; argv: string[]; cwd: string; durationSeconds: number | null; exitCode: number | null }[];
    changedFiles: { path: string; change: string }[] | null;
    conditions?: { passed: string[]; failed: string[] } | null;
    result?: string | null;
    warnings: string[];
  } | null;
}

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const workspace = config.value.defaultWorkspace || 'current';
const image = ref<File | null>(null);
const preview = ref('');
const instructions = ref('');
const model = ref<ClaudeModel>('haiku');
const starting = ref(false);
const openingPreview = ref(false);
const error = ref('');
const pollingError = ref('');
const status = ref<AgentStatus | null>(null);
const output = ref<HTMLElement | null>(null);
const showClaudeLogs = ref(true);
const thisRun = computed(() => status.value?.kind === 'view-layout' && status.value.files[0] === workspace ? status.value : null);
const transcript = computed(() => thisRun.value?.log.join('\n\n') ?? '');
const locked = computed(() => starting.value || !!startingViewLayout.value || !status.value || !!pollingError.value || status.value.running);
function duration(seconds: number) {
  return seconds < 60 ? `${seconds.toFixed(3)} s` : `${Math.floor(seconds / 60)} min ${(seconds % 60).toFixed(1)} s`;
}
let timer = 0;
let active = false;
let generation = 0;

async function chooseImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  error.value = '';
  preview.value = '';
  image.value = null;
  if (!file) return;
  if (!/\.(png|jpe?g|dds)$/i.test(file.name) || !file.size || file.size > MAX_IMAGE_BYTES) {
    error.value = 'Choose a PNG, JPEG or DDS image up to 16 MB.';
    input.value = '';
    return;
  }
  image.value = file;
  if (!/\.dds$/i.test(file.name)) {
    try {
      const encoded = await readImage(file);
      if (image.value === file) preview.value = `data:image/${/\.png$/i.test(file.name) ? 'png' : 'jpeg'};base64,${encoded}`;
    } catch (failure) {
      if (image.value === file) error.value = (failure as Error).message;
    }
  }
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('The preview image could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function scrollOutput() {
  if (!showClaudeLogs.value) return;
  await nextTick();
  if (output.value) output.value.scrollTop = output.value.scrollHeight;
}

async function poll() {
  window.clearTimeout(timer);
  const request = ++generation;
  try {
    const value = await api<AgentStatus>('game/agent/status', 'GET');
    if (!active || request !== generation) return;
    status.value = value;
    updateGameAgentActivity(value);
    pollingError.value = '';
    void scrollOutput();
  } catch (failure) {
    if (!active || request !== generation) return;
    pollingError.value = `Could not refresh Claude Code output: ${(failure as Error).message}. Retrying…`;
  }
  if (active && request === generation) timer = window.setTimeout(poll, 1000);
}

async function openPreviewImage() {
  const file = thisRun.value?.execution?.invocation.arguments[0];
  if (!file || openingPreview.value) return;
  openingPreview.value = true;
  try {
    await api('game/view-layout/open-preview', 'POST', { file });
  } catch (failure) {
    notify((failure as Error).message, true);
  } finally {
    openingPreview.value = false;
  }
}

async function start() {
  if (!image.value || locked.value) return;
  starting.value = true;
  startingViewLayout.value = workspace;
  error.value = '';
  window.clearTimeout(timer);
  generation++;
  try {
    const encoded = await readImage(image.value);
    status.value = await api<AgentStatus>('game/view-layout', 'POST', { workspace, image: encoded, instructions: instructions.value, model: model.value });
    updateGameAgentActivity(status.value);
    void scrollOutput();
  } catch (failure) {
    error.value = (failure as Error).message;
  } finally {
    starting.value = false;
    if (startingViewLayout.value === workspace) startingViewLayout.value = null;
    if (active) void poll();
  }
}

onActivated(() => { active = true; void poll(); });
onDeactivated(() => { active = false; generation++; window.clearTimeout(timer); });
onBeforeUnmount(() => {
  active = false;
  generation++;
  window.clearTimeout(timer);
});
</script>

<template>
  <PageHeader title="View layout">
    <template #links><li><span>Match {{ config.name }}’s views to a preview with Claude Code’s <code>view-layout</code> skill.</span></li></template>
  </PageHeader>
  <div class="row view-layout-page">
    <div class="col-xl-4 mb-4">
      <form class="card" @submit.prevent="start">
        <div class="card-body">
          <h2 class="h5">Preview image</h2>
          <p class="text-muted small">Choose the layout you want for this workspace. Claude Code updates the game’s view files; Play reloads the changes automatically.</p>
          <div class="form-group">
            <label for="layout-preview">Upload preview</label>
            <input id="layout-preview" type="file" class="form-control-file" accept=".png,.jpg,.jpeg,.dds" :disabled="starting || status?.running" aria-describedby="layout-image-help" @change="chooseImage">
            <small id="layout-image-help" class="form-text text-muted">PNG, JPEG or DDS, up to 16 MB.</small>
          </div>
          <img v-if="preview" :src="preview" class="layout-preview mb-3" alt="Selected layout preview">
          <p v-if="image" class="small text-muted">{{ image.name }} · {{ (image.size / 1024 / 1024).toFixed(2) }} MB</p>
          <div class="form-group">
            <label for="layout-instructions">Layout instructions (optional)</label>
            <textarea id="layout-instructions" v-model="instructions" class="form-control" rows="4" maxlength="8000" :disabled="starting || status?.running" placeholder="For example: main game, BetBarView and CreditsWinBarView." />
          </div>
          <div class="form-group">
            <label for="layout-model">Claude Code model</label>
            <select id="layout-model" v-model="model" class="form-control" :disabled="starting || status?.running">
              <option v-for="(label, value) in modelNames" :key="value" :value="value">{{ label }}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="small mb-0"><input v-model="showClaudeLogs" type="checkbox" @change="scrollOutput"> Claude Code logs</label>
          </div>
          <p class="small text-muted">If the skill needs clarification or permission, Claude Code stops and includes its question in the output.</p>
          <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
          <button type="submit" class="btn btn-primary" :disabled="!image || locked">
            <i :class="['mdi', starting || thisRun?.running ? 'mdi-loading mdi-spin' : 'mdi-robot-outline']" aria-hidden="true" />
            {{ starting ? 'Uploading preview…' : thisRun?.running ? 'Claude Code is running…' : 'Run view-layout' }}
          </button>
          <p v-if="status?.running && !thisRun" class="small mt-3 mb-0" role="status">Another Claude Code task is running. Wait for it to finish before starting.</p>
        </div>
      </form>
    </div>
    <div class="col-xl-8 mb-4">
      <section class="card" aria-label="Claude Code execution">
        <div class="card-body">
          <h2 class="h5 mb-3">Claude Code output</h2>
          <p role="status" class="small text-muted">
            {{ thisRun?.running ? 'Running view-layout… Responses appear as they arrive.' : thisRun?.error ? 'Execution failed.' : thisRun?.result ? 'Execution finished.' : 'Upload a preview to start. The complete execution output will appear here.' }}
          </p>
          <p v-if="pollingError" class="alert alert-warning" role="alert">{{ pollingError }}</p>
          <p v-if="thisRun?.error" class="alert alert-danger" role="alert">{{ thisRun.error }}</p>
          <section v-if="thisRun?.execution" class="layout-summary mb-3" aria-label="Execution summary">
            <h3 class="h6">Execution summary</h3>
            <p class="small mb-2"><strong>Model:</strong> {{ thisRun.execution.model || (thisRun.running ? 'Awaiting Claude Code…' : 'Not reported by Claude Code') }}</p>
            <p class="small mb-2"><strong>Skill arguments:</strong> {{ thisRun.execution.invocation.validated ? 'Validated by the skill' : thisRun.running ? 'Awaiting skill validation…' : 'Not validated' }}</p>
            <ol class="small layout-arguments">
              <li>
                <strong>Preview image:</strong> <code>{{ thisRun.execution.invocation.arguments[0] }}</code>
                <button v-if="thisRun.execution.invocation.arguments[0]" type="button" class="details-icon d-inline-flex ml-1" aria-label="Open preview image" title="Open preview image in the default image viewer" :disabled="openingPreview" :aria-busy="openingPreview || undefined" @click="openPreviewImage"><i class="mdi mdi-open-in-new" aria-hidden="true" /></button>
              </li>
              <li><strong>Workspace id:</strong> <code>{{ thisRun.execution.invocation.arguments[1] }}</code></li>
            </ol>
            <p v-if="thisRun.running || thisRun.execution.result" class="layout-result mb-2"><strong>Result:</strong> {{ thisRun.running ? 'In progress…' : thisRun.execution.result }}</p>
            <p v-for="warning in thisRun.execution.warnings" :key="warning" class="alert alert-warning small">{{ warning }}</p>
            <p class="small mb-2"><strong>Total time:</strong> {{ thisRun.execution.durationSeconds == null ? 'In progress…' : duration(thisRun.execution.durationSeconds) }}</p>
          </section>
          <details v-if="thisRun?.result" class="layout-details mb-3">
            <summary><h3 class="h6 d-inline">Claude Code report</h3></summary>
            <MarkdownText class="layout-report" :text="thisRun.result.report" />
            <p v-if="thisRun.result.cost != null" class="small text-muted mt-3 mb-0">{{ thisRun.result.turns }} turns · ${{ thisRun.result.cost.toFixed(4) }}</p>
          </details>
          <details v-if="thisRun?.execution && !thisRun.running" class="layout-details mb-3">
            <summary><h3 class="h6 d-inline">Changed view files<span v-if="thisRun.execution.changedFiles"> ({{ thisRun.execution.changedFiles.length }})</span></h3></summary>
            <p class="small text-muted">{{ thisRun.execution.gamePath }}</p>
            <p v-if="thisRun.execution.changedFiles == null" class="small">Changes could not be determined.</p>
            <ul v-else-if="thisRun.execution.changedFiles.length" class="small">
              <li v-for="file in thisRun.execution.changedFiles" :key="file.path"><code>{{ file.path }}</code> · {{ file.change }}</li>
            </ul>
            <p v-else class="small">No view files changed.</p>
          </details>
          <details v-if="thisRun?.execution?.calls.length" class="layout-details mb-3">
            <summary><h3 class="h6 d-inline">view_layout.py calls ({{ thisRun.execution.calls.length }})</h3></summary>
            <ol class="layout-calls small mt-2" aria-label="Helper executions">
              <li v-for="call in thisRun.execution.calls" :key="call.id" class="mb-3">
                <p class="mb-1">{{ call.durationSeconds == null ? thisRun.running ? 'Running…' : 'Completion not reported' : duration(call.durationSeconds) }}<span v-if="call.exitCode != null"> · exit {{ call.exitCode }}</span></p>
                <pre>{{ JSON.stringify(call.argv, null, 2) }}</pre>
                <span class="text-muted">Working folder: {{ call.cwd }}</span>
              </li>
            </ol>
          </details>
          <details v-if="showClaudeLogs && transcript.trim()" class="layout-details mb-3" @toggle="scrollOutput">
            <summary><h3 class="h6 d-inline">Claude Code logs</h3></summary>
            <pre ref="output" class="layout-output" tabindex="0" aria-label="Complete Claude Code output">{{ transcript }}</pre>
          </details>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.view-layout-page > div { min-width: 0; }
.layout-preview { display: block; width: 100%; max-height: 360px; object-fit: contain; background: #f5f5f5; border-radius: 6px; }
.layout-output { min-height: 320px; max-height: 65vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 1rem; border-radius: 6px; background: #151b28; color: #e7edf7; font-size: 12px; line-height: 1.6; }
.layout-report { line-height: 1.6; }
.layout-result { font-size: 0.95rem; }
.layout-summary, .layout-details { padding: 1rem; border: 1px solid #dee2e6; border-radius: 6px; overflow-wrap: anywhere; }
.layout-details > summary { cursor: pointer; margin-bottom: 0.75rem; }
.layout-details:not([open]) > summary { margin-bottom: 0; }
.layout-calls pre { white-space: pre-wrap; overflow-wrap: anywhere; color: inherit; font-size: inherit; }
.layout-arguments, .layout-calls { padding-left: 1.25rem; }
</style>
