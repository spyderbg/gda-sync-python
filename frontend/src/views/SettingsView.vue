<script setup lang="ts">
import { computed, reactive } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import { contractPath, expandPath } from '../format';
import type { FolderKey } from '../types';
import { busy, config, data, navigate, openFolder, saveSettings, session, ui } from '../workspace';

// The folders as workspace.json writes them, which can use its global paths such as {games_root_path}.
const stored = (folder: FolderKey) => config.value.templates?.[folder] ?? config.value[folder];
const form = reactive({ name: config.value.name, source: stored('source'), destination: stored('destination') });
const hasChanges = computed(() => form.name !== config.value.name
  || form.source !== stored('source')
  || form.destination !== stored('destination'));
const windows = session.platform === 'Windows';
// The scan knows only the saved folders, so a path being edited is not reported until it is saved.
const missing = (folder: FolderKey) => data.value!.missingFolders.includes(folder) && form[folder] === stored(folder);
const globalPaths = computed(() => data.value?.globalPaths ?? {});
const placeholder = (name: string) => `{${name}}`;
/** What happens to a folder being entered: a path that uses global paths expands, one inside a global path is saved
 * with it, and a global path that workspace.json does not define is an error. */
function pathHint(folder: FolderKey): { text: string; error?: boolean } | null {
  const value = form[folder].trim();
  if (/\{[A-Za-z0-9_]+\}/.test(value)) {
    const { expanded, unknown } = expandPath(value, globalPaths.value);
    if (unknown.length) {
      const names = Object.keys(globalPaths.value).map(name => `{${name}}`).join(', ');
      return { text: `workspace.json defines no global path {${unknown[0]}}${names ? `. Its global paths: ${names}` : ''}.`, error: true };
    }
    return { text: `Expands to ${expanded}` };
  }
  const contracted = contractPath(value, globalPaths.value);
  return contracted !== value ? { text: `Saved as ${contracted}` } : null;
}
const anyMissing = computed(() => missing('source') || missing('destination'));

async function save() {
  if (!hasChanges.value || busy.value) return;
  await saveSettings(form);
}

</script>

<template>
  <PageHeader title="Workspace settings">
    <template #links-right>
      <li><a href="#" @click.prevent="navigate('history')">Sync history</a></li>
    </template>
  </PageHeader>

  <div class="row">
    <div class="col-12 grid-margin stretch-card">
      <div class="card">
        <div class="card-body">
          <div class="d-flex align-items-center">
            <h4 class="card-title mb-0">Workspace Connection</h4>
            <span v-if="anyMissing" class="badge badge-warning ml-auto"><i aria-hidden="true" class="mdi mdi-folder-alert-outline" />Folder not found</span>
            <span v-else class="badge badge-success ml-auto"><i aria-hidden="true" class="mdi mdi-lan-connect" />Connected</span>
          </div>
          <p class="card-description mt-2">Connect your GDA assets to their home in the game.</p>
          <form class="forms-sample" @submit.prevent="save">
            <div class="form-group">
              <label for="project-name">Project name</label>
              <input id="project-name" v-model="form.name" class="form-control" required maxlength="80" placeholder="Your project name">
            </div>
            <div class="form-group">
              <label for="source-folder" class="settings-folder-label">
                <a href="#" class="settings-folder-link" :title="`Open GDA folder: ${config.source}`" @click.prevent="openFolder('source')">
                  <span class="settings-folder-name"><i aria-hidden="true" class="mdi mdi-harddisk text-success" />GDA path</span>
                  <i aria-hidden="true" class="mdi mdi-open-in-new" />
                </a>
              </label>
              <input id="source-folder" v-model="form.source" class="form-control" :aria-describedby="missing('source') ? 'source-help source-missing' : 'source-help'" required :placeholder="windows ? 'C:\\Users\\you\\project\\gda' : '/home/you/project/gda'">
              <small v-if="pathHint('source')" :class="['form-text', 'settings-path-hint', pathHint('source')?.error ? 'text-danger' : 'text-muted']" role="status">{{ pathHint('source')?.text }}</small>
              <small id="source-help" class="form-text text-muted">The originals you’re working with. All subfolders are included.</small>
              <div v-if="missing('source')" id="source-missing" class="alert alert-warning folder-missing" role="status">
                <i aria-hidden="true" class="mdi mdi-alert-outline" />The GDA folder does not exist. No assets can be listed until it does.
              </div>
            </div>
            <div class="flow-hint"><i aria-hidden="true" class="mdi mdi-arrow-down" />Assets flow from GDA to Game</div>
            <div class="form-group">
              <label for="destination-folder" class="settings-folder-label">
                <a href="#" class="settings-folder-link" :title="`Open Game folder: ${config.destination}`" @click.prevent="openFolder('destination')">
                  <span class="settings-folder-name"><i aria-hidden="true" class="mdi mdi-folder-outline text-primary" />Game path</span>
                  <i aria-hidden="true" class="mdi mdi-open-in-new" />
                </a>
              </label>
              <input id="destination-folder" v-model="form.destination" class="form-control" :aria-describedby="missing('destination') ? 'destination-help destination-missing' : 'destination-help'" required :placeholder="windows ? 'C:\\Users\\you\\project\\game' : '/home/you/project/game'">
              <small v-if="pathHint('destination')" :class="['form-text', 'settings-path-hint', pathHint('destination')?.error ? 'text-danger' : 'text-muted']" role="status">{{ pathHint('destination')?.text }}</small>
              <small id="destination-help" class="form-text text-muted">A separate folder where your synced assets belong.</small>
              <div v-if="missing('destination')" id="destination-missing" class="alert alert-warning folder-missing" role="status">
                <i aria-hidden="true" class="mdi mdi-alert-outline" />The Game folder does not exist. Assets cannot be synced until it does.
              </div>
            </div>
            <div v-if="Object.keys(globalPaths).length" class="settings-global-paths">
              <small class="text-muted">Global paths of workspace.json, which a path can use, and which a path inside one is saved with:</small>
              <dl>
                <template v-for="(path, name) in globalPaths" :key="name"><dt>{{ placeholder(String(name)) }}</dt><dd>{{ path }}</dd></template>
              </dl>
            </div>
            <button type="submit" class="btn btn-primary settings-save" :disabled="!!busy || !hasChanges">
              <i aria-hidden="true" :class="['mdi', busy === 'settings' ? 'mdi-loading mdi-spin' : 'mdi-check']" /><span>Save workspace</span>
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
              <h4 class="card-title">A Simple, Local Connection</h4>
              <p>EGT GDA Sync copies assets from your GDA folder to your Game folder, keeping the same folder structure.</p>
              <ul class="list-ticked">
                <li>Original GDA files are preserved</li>
                <li>Existing Game versions are backed up</li>
                <li>File contents determine sync status</li>
                <li>No uploads or cloud accounts</li>
              </ul>
              <h5 class="mt-4 mb-2">Your backups live here</h5>
              <code class="backup-path">{{ data!.backupPath }}</code>
            </div>
            <div class="col-lg-4 settings-stop">
              <section class="settings-stop-panel" aria-labelledby="settings-stop-heading">
                <h4 id="settings-stop-heading" class="card-title">Stop EGT GDA Sync</h4>
                <p>Close the local server when you’re done.</p>
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
