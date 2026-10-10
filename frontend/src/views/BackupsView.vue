<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import AppModal from '../components/AppModal.vue';
import CheckBox from '../components/CheckBox.vue';
import PageHeader from '../components/PageHeader.vue';
import { ago, number, plural, size, time } from '../format';
import type { BackupFile, BackupList, BackupOperation } from '../types';
import { busy, config, copy, restoreBackup } from '../workspace';

// The backups: the files that syncs, cleanups, view edits and restores replaced or deleted, one operation each, newest
// first. Only the selected workspace's are listed unless All workspaces is on; a backup whose workspace is not known is
// listed only then. An operation opens to its files, each with what the operation did to it and how it is now. Restore
// all, or a file's Restore, copies the backups back after a confirmation; the files there now are backed up first, so a
// restore can be restored too, and a file that is the same as its backup is skipped.
const ACTIONS: Record<BackupOperation['action'], { label: string; badge: string; icon: string }> = {
  sync: { label: 'Sync', badge: 'badge-success', icon: 'mdi-sync' },
  cleanup: { label: 'Cleanup', badge: 'badge-warning', icon: 'mdi-broom' },
  edit: { label: 'Edit', badge: 'badge-info', icon: 'mdi-pencil-outline' },
  restore: { label: 'Restore', badge: 'badge-primary', icon: 'mdi-backup-restore' },
  backup: { label: 'Backup', badge: 'badge-secondary', icon: 'mdi-archive-outline' },
};
const NOW: Record<BackupFile['now'], { label: string; tone: string }> = {
  same: { label: 'Same as the backup', tone: 'text-success' },
  changed: { label: 'Changed since', tone: 'text-warning' },
  missing: { label: 'Not there', tone: 'text-danger' },
  unknown: { label: 'Unknown', tone: 'text-muted' },
};

const list = ref<BackupList | null>(null);
const loadError = ref('');
const everyWorkspace = ref(false);
async function load() {
  loadError.value = '';
  try {
    const response = await fetch('/api/backups', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Request failed');
    list.value = body as BackupList;
  } catch (e) {
    loadError.value = (e as Error).message;
  }
}
watch(() => config.value.defaultWorkspace, () => { void load(); }, { immediate: true });

const operations = computed(() => (list.value?.backups ?? [])
  .filter(item => everyWorkspace.value || item.workspace?.id === list.value?.workspaceId));
const others = computed(() => (list.value?.backups.length ?? 0) - operations.value.length);

// The files of each opened operation, read when it opens and again after a restore.
const opened = reactive(new Set<string>());
const files = reactive(new Map<string, BackupFile[] | string>());
async function loadFiles(id: string) {
  try {
    const response = await fetch(`/api/backups/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Request failed');
    files.set(id, body.files as BackupFile[]);
  } catch (e) {
    files.set(id, (e as Error).message);
  }
}
function toggle(item: BackupOperation) {
  if (opened.has(item.id)) { opened.delete(item.id); return; }
  opened.add(item.id);
  void loadFiles(item.id);
}
const filesOf = (id: string) => (Array.isArray(files.get(id)) ? files.get(id) as BackupFile[] : []);

// A restore waits in a dialog for confirmation: an operation's files, all of them or one.
const restoring = ref<{ operation: BackupOperation; files: string[] | null } | null>(null);
const restoringPaths = computed(() => {
  const pending = restoring.value;
  if (!pending) return [];
  return pending.files ?? (filesOf(pending.operation.id).length ? filesOf(pending.operation.id).map(item => item.path) : []);
});
async function confirmRestore() {
  const pending = restoring.value;
  if (!pending) return;
  const result = await restoreBackup(pending.operation.id, pending.files ?? undefined);
  restoring.value = null;
  if (!result) return;
  await load();
  for (const id of opened) void loadFiles(id);
}
const actionOf = (item: BackupOperation) => ACTIONS[item.action] ?? ACTIONS.backup;
</script>

<template>
  <PageHeader title="Backups">
    <template #links>
      <li><span>{{ number(operations.length) }} operation{{ plural(operations.length) }}</span></li>
    </template>
  </PageHeader>

  <div class="card grid-margin">
    <div class="card-body backups-intro">
      <p class="mb-2">Syncs, cleanups and view edits save every file they replace or delete here before they change it. Restore copies a file back where it was; the file there now is saved here first, so a restore can be restored too.</p>
      <div class="backups-folder">
        <span class="text-muted">Folder:</span>
        <code>{{ list?.backupPath ?? '…' }}</code>
        <button v-if="list" type="button" class="details-icon" aria-label="Copy the backups folder" title="Copy the backups folder" @click="copy(list.backupPath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
      </div>
      <CheckBox :checked="everyWorkspace" label="Show the backups of every workspace" @change="everyWorkspace = $event">
        All workspaces<small v-if="!everyWorkspace && others" class="text-muted"> ({{ number(others) }} more)</small>
      </CheckBox>
    </div>
  </div>

  <div v-if="loadError" class="alert alert-danger"><i aria-hidden="true" class="mdi mdi-alert-circle-outline" /> {{ loadError }}</div>
  <div v-else-if="list && !operations.length" class="card empty-state grid-margin">
    <div class="card-body">
      <i aria-hidden="true" class="mdi mdi-backup-restore text-muted" />
      <h4>No backups yet</h4>
      <p class="text-muted">{{ everyWorkspace ? 'Nothing has been replaced or deleted yet.' : 'Nothing of this workspace has been replaced or deleted yet.' }}</p>
    </div>
  </div>

  <div class="backups-list" aria-label="Backups, newest first">
    <article v-for="item in operations" :key="item.id" class="card backup-operation" :data-backup="item.id">
      <div class="card-body">
        <div class="backup-row">
          <div class="backup-when">
            <span :class="['badge', actionOf(item).badge]"><i aria-hidden="true" :class="['mdi', actionOf(item).icon]" /> {{ actionOf(item).label }}</span>
            <h5 class="backup-time">{{ time(item.date) }}</h5>
            <small class="text-muted">{{ ago(item.date) }}<template v-if="everyWorkspace"> · {{ item.workspace?.name ?? 'workspace not known' }}</template></small>
          </div>
          <div class="backup-what">
            <p class="backup-message">{{ item.message || (item.legacy ? 'A backup from before backups were recorded' : '—') }}</p>
            <small class="text-muted">{{ number(item.fileCount) }} file{{ plural(item.fileCount) }} · {{ size(item.size) }}</small>
            <small v-if="!item.restorable" class="text-danger d-block">Where its files belong is not known, so it cannot be restored.</small>
          </div>
          <div class="backup-actions">
            <button type="button" class="btn btn-outline-secondary btn-sm" :aria-expanded="opened.has(item.id)" @click="toggle(item)">
              <i aria-hidden="true" :class="['mdi', opened.has(item.id) ? 'mdi-chevron-up' : 'mdi-chevron-down']" />Files
            </button>
            <button type="button" class="btn btn-outline-primary btn-sm" :disabled="!item.restorable || !!busy"
                    @click="restoring = { operation: item, files: null }; void loadFiles(item.id)">
              <i aria-hidden="true" class="mdi mdi-backup-restore" />Restore all
            </button>
          </div>
        </div>
        <div v-if="opened.has(item.id)" class="backup-files">
          <p v-if="typeof files.get(item.id) === 'string'" class="text-danger mb-0">{{ files.get(item.id) }}</p>
          <p v-else-if="!files.has(item.id)" class="text-muted mb-0"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" /> Reading the files…</p>
          <div v-else class="table-responsive">
            <table class="table table-sm mb-0" :aria-label="`Files of the backup of ${time(item.date)}`">
              <thead><tr><th scope="col">File</th><th scope="col">The operation</th><th scope="col" class="text-right">Size</th><th scope="col">Now</th><th scope="col"><span class="sr-only">Restore</span></th></tr></thead>
              <tbody>
                <tr v-for="file in filesOf(item.id)" :key="file.path" :data-file="file.path">
                  <td class="backups-file-path" :title="item.root ? `${item.root}/${file.path}` : file.path">{{ file.path }}</td>
                  <td>{{ file.change === 'deleted' ? 'Deleted it' : 'Replaced it' }}</td>
                  <td class="text-right text-nowrap">{{ size(file.size) }}</td>
                  <td :class="NOW[file.now].tone">{{ NOW[file.now].label }}</td>
                  <td class="text-right">
                    <button type="button" class="btn btn-link btn-sm backup-restore-file" :disabled="!item.restorable || file.now === 'same' || !!busy"
                            :aria-label="`Restore ${file.path}`" :title="file.now === 'same' ? 'The file is the same as its backup' : `Restore ${file.path}`"
                            @click="restoring = { operation: item, files: [file.path] }">Restore</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </article>
  </div>

  <AppModal v-if="restoring" :title="restoring.files ? 'Restore this file?' : `Restore ${number(restoring.operation.fileCount)} file${plural(restoring.operation.fileCount)}?`" @close="restoring = null">
    <div class="modal-body">
      <p>Copy {{ restoring.files ? 'the file' : 'the files' }} of the backup of {{ time(restoring.operation.date) }} back to <code class="backups-file-path">{{ restoring.operation.root }}</code>:</p>
      <ul class="backup-restore-list">
        <li v-for="path in restoringPaths.slice(0, 12)" :key="path" class="backups-file-path">{{ path }}</li>
        <li v-if="restoringPaths.length > 12" class="text-muted">and {{ number(restoringPaths.length - 12) }} more</li>
      </ul>
      <p class="mb-0 text-muted">The files there now are saved in the backups first, and a file that is the same as its backup is skipped.</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" @click="restoring = null">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="busy === 'restore'" @click="confirmRestore">
        <i aria-hidden="true" :class="['mdi', busy === 'restore' ? 'mdi-loading mdi-spin' : 'mdi-backup-restore']" />Restore
      </button>
    </div>
  </AppModal>
</template>

<style scoped>
.backups-intro { font-size: 13px; }
.backups-folder { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; min-width: 0; }
.backups-folder code { overflow-wrap: anywhere; }
.backups-list { display: grid; gap: 14px; margin-bottom: 24px; }
.backup-row { display: grid; grid-template-columns: 200px minmax(0, 1fr) auto; gap: 16px; align-items: center; }
.backup-when .badge { display: inline-flex; align-items: center; gap: 4px; }
.backup-time { margin: 8px 0 2px; font-size: 15px; }
.backup-message { margin: 0 0 4px; font-weight: 500; overflow-wrap: anywhere; }
.backup-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.backup-actions .btn { display: inline-flex; align-items: center; gap: 4px; }
.backup-files { margin-top: 14px; padding-top: 10px; border-top: 1px solid #ebedf2; font-size: 12px; }
.backups-file-path { font-family: monospace; font-size: 12px; overflow-wrap: anywhere; }
.backup-restore-file { padding: 0 4px; font-size: 12px; }
.backup-restore-list { max-height: 240px; overflow: auto; padding-left: 18px; }
@media (max-width: 767px) { .backup-row { grid-template-columns: 1fr; } .backup-actions { justify-content: flex-start; } }
</style>
