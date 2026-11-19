<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import { expandPath } from '../format';
import type { AppSettings } from '../types';
import { appSettings, busy, copy, saveAppSettings, ui } from '../workspace';

// The settings that all workspaces share, which workspace.json keeps in its config section.
const settings = ref<AppSettings | null>(null);
const loadError = ref('');
const form = reactive({ workingPath: '' });

onMounted(async () => {
  try {
    settings.value = await appSettings();
    form.workingPath = settings.value.workingPath;
  } catch (e) { loadError.value = (e as Error).message; }
});

const hasChanges = computed(() => !!settings.value && form.workingPath.trim() !== settings.value.workingPath);
const placeholder = (name: string) => `{${name}}`;
/** What the working folder being entered stands for: an empty one is the default folder, one that uses global paths
 * expands, and a global path that workspace.json does not define is an error. */
const hint = computed<{ text: string; error?: boolean; expanded?: string } | null>(() => {
  const value = form.workingPath.trim();
  const current = settings.value!;
  if (!value) return { text: `Empty: the default folder, ${current.defaultFolder}`, expanded: current.defaultFolder };
  if (!/\{[A-Za-z0-9_]+\}/.test(value)) return null;
  const { expanded, unknown } = expandPath(value, current.globalPaths);
  if (unknown.length) {
    const names = Object.keys(current.globalPaths).map(placeholder).join(', ');
    return { text: `workspace.json defines no global path {${unknown[0]}}${names ? `. Its global paths: ${names}` : ''}.`, error: true };
  }
  return { text: `Expands to ${expanded}`, expanded };
});

async function save() {
  if (!hasChanges.value || busy.value) return;
  const saved = await saveAppSettings(form.workingPath.trim());
  if (saved) {
    settings.value = saved;
    form.workingPath = saved.workingPath;
  }
}
</script>

<template>
  <PageHeader title="Global settings" />

  <div v-if="loadError" class="alert alert-danger" role="alert"><i aria-hidden="true" class="mdi mdi-alert-circle-outline" />{{ loadError }}</div>
  <p v-else-if="!settings" class="text-muted" role="status"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" />Loading global settings…</p>
  <div v-else class="row">
    <div class="col-12 grid-margin stretch-card">
      <div class="card">
        <div class="card-body">
          <div class="d-flex align-items-center">
            <h4 class="card-title mb-0">Working Folder</h4>
            <span v-if="settings.restartNeeded" class="badge badge-warning ml-auto"><i aria-hidden="true" class="mdi mdi-restart" />Restart to use it</span>
            <span v-else class="badge badge-success ml-auto"><i aria-hidden="true" class="mdi mdi-folder-check-outline" />In use</span>
          </div>
          <p class="card-description mt-2">Where EGT GDA Sync keeps its data for all workspaces: the activity history, sync and asset reports, backups, caches, exports and screenshots.</p>
          <form class="forms-sample" @submit.prevent="save">
            <div class="form-group">
              <div class="settings-label-row">
                <label for="working-folder">Working folder</label>
                <button type="button" class="settings-label-copy" aria-label="Copy working folder" title="Copy working folder" @click="copy(hint?.expanded ?? form.workingPath.trim())"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
              </div>
              <input id="working-folder" v-model="form.workingPath" class="form-control" spellcheck="false" aria-describedby="working-folder-help" :placeholder="settings.defaultFolder">
              <div v-if="hint" class="settings-path-hint-row">
                <small :class="['form-text', 'settings-path-hint', hint.error ? 'text-danger' : 'text-muted']" role="status">{{ hint.text }}</small>
              </div>
              <small id="working-folder-help" class="form-text text-muted">Leave empty for the default folder. Choose a folder on a disk with free space, outside the workspaces’ GDA and Game folders. EGT GDA Sync creates it when it starts, and uses it from its next start.</small>
            </div>
            <div v-if="Object.keys(settings.globalPaths).length" class="settings-global-paths">
              <small class="text-muted">Global paths of workspace.json, which the working folder can use:</small>
              <dl>
                <template v-for="(path, name) in settings.globalPaths" :key="name"><dt>{{ placeholder(String(name)) }}</dt><dd>{{ path }}</dd></template>
              </dl>
            </div>
            <button type="submit" class="btn btn-primary settings-save" :disabled="!!busy || !hasChanges">
              <i aria-hidden="true" :class="['mdi', busy === 'settings' ? 'mdi-loading mdi-spin' : 'mdi-check']" /><span>Save global settings</span>
            </button>
          </form>
        </div>
      </div>
    </div>
    <div class="col-12 grid-margin stretch-card">
      <div class="card">
        <div class="card-body">
          <div class="row">
            <div class="col-lg-8">
              <h4 class="card-title">Data Folder</h4>
              <h5 class="mb-2">In use</h5>
              <code class="backup-path">{{ settings.dataFolder }}</code>
              <div v-if="settings.environmentFolder" class="alert alert-info global-settings-note" role="status">
                <i aria-hidden="true" class="mdi mdi-information-outline" />EGT_GDA_SYNC_HOME chooses the data folder of this run. The working folder applies when EGT GDA Sync starts without it.
              </div>
              <template v-else-if="settings.restartNeeded">
                <h5 class="mt-4 mb-2">From the next start</h5>
                <code class="backup-path">{{ settings.nextFolder }}</code>
                <div class="alert alert-warning global-settings-note" role="status">
                  <i aria-hidden="true" class="mdi mdi-alert-outline" />The data stays in the folder in use. To keep its history, reports and backups, stop EGT GDA Sync, move the contents of that folder into the new one, then start EGT GDA Sync again.
                </div>
              </template>
              <h5 class="mt-4 mb-2">Settings file</h5>
              <code class="backup-path">{{ settings.configPath }}</code>
            </div>
            <div class="col-lg-4 settings-stop">
              <section class="settings-stop-panel" aria-labelledby="global-settings-stop-heading">
                <h4 id="global-settings-stop-heading" class="card-title">Stop EGT GDA Sync</h4>
                <p>Close the local server when you’re done, or to start it again with a new working folder.</p>
                <p class="text-muted">Closing the last EGT GDA Sync page also stops it.</p>
                <button type="button" class="btn btn-outline-danger" :disabled="!!busy" @click="ui.shutdownConfirm = true"><i aria-hidden="true" class="mdi mdi-power" />Stop application</button>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.global-settings-note { margin: 12px 0 0; font-size: 13px; }
.global-settings-note .mdi { margin-right: 6px; }
</style>
