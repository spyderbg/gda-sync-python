<script setup lang="ts">
import { computed } from 'vue';
import { commonAction, plural, resourceAction, resourceActionIcons, rtfChangeSummary, typeIcons } from '../format';
import type { RssResource } from '../types';
import { config, confirmResourceActions, stopApplication, ui } from '../workspace';
import AppModal from './AppModal.vue';

// The GDA sync report resources waiting for confirmation, by what applying them does.
const resourceKind = computed(() => commonAction(ui.resourceActions ?? []));
const HEADINGS = { sync: 'Sync {} resource', remove: 'Remove the declarations of {} invalid resource', delete: 'Delete {} supplementary resource' };
const resourceGroups = computed(() => (['sync', 'remove', 'delete'] as const)
  .map(action => ({ action, rows: (ui.resourceActions ?? []).filter(row => resourceAction(row) === action) }))
  .filter(group => group.rows.length)
  .map(group => ({ ...group, heading: HEADINGS[group.action].replace('{}', String(group.rows.length)) + plural(group.rows.length) })));
const resourceTitle = computed(() => ({
  sync: 'Ready to bring things up to date?', remove: 'Remove these declarations?', delete: 'Delete these files?', mixed: 'Apply these changes to the game?',
})[resourceKind.value ?? 'sync']);
const resourceConfirm = computed(() => {
  const count = ui.resourceActions?.length ?? 0;
  const resources = `${count} resource${plural(count)}`;
  return ({ sync: `Sync ${resources}`, remove: `Remove ${resources}`, delete: `Delete ${resources}`, mixed: `Apply to ${resources}` })[resourceKind.value ?? 'sync'];
});
// A descriptor outside the game folder, such as a common one, can be included by other games.
const sharedDescriptor = (row: RssResource) => row.requiredBy.some(use => use.descriptor.startsWith('..'));
</script>

<template>
  <AppModal v-if="ui.resourceActions" :title="resourceTitle" @close="ui.resourceActions = null">
    <div class="modal-body">
      <section v-for="group in resourceGroups" :key="group.action" class="resource-action-group">
        <h6 v-if="resourceGroups.length > 1"><i aria-hidden="true" :class="['mdi', resourceActionIcons[group.action]]" />{{ group.heading }}</h6>
        <p v-if="group.action === 'sync'">Copy {{ group.rows.length }} resource{{ plural(group.rows.length) }} of the GDA sync report from the GDA folder to the game, each from its closest GDA file; an image sequence copies each of its different frames. Existing game files will be replaced, with their previous versions saved in your backups.</p>
        <p v-if="group.action === 'sync' && group.rows.some(row => row.directory)" class="text-warning">
          An RTF's folder becomes a copy of its closest GDA folder: its files that the GDA folder does not have are deleted, unless a descriptor declares them, and saved in your backups first.
        </p>
        <p v-else-if="group.action === 'remove'">Remove the entries that declare {{ group.rows.length === 1 ? 'this invalid resource' : `these ${group.rows.length} invalid resources` }} from the *Data.json descriptors: each entry, image sequence or audio sample that names {{ group.rows.length === 1 ? 'it' : 'them' }}. The rest of each descriptor stays as it is, and its previous version is saved in your backups.</p>
        <p v-else>Delete {{ group.rows.length === 1 ? 'this supplementary resource' : `these ${group.rows.length} supplementary resources` }} from the game folder; no descriptor declares {{ group.rows.length === 1 ? 'it' : 'them' }}, a guessed sequence goes with all its files, and an RTF with its whole folder. Each file is saved in your backups first.</p>
        <p v-if="group.action === 'sync' && group.rows.some(row => row.scope === 'common')" class="text-warning">
          {{ group.rows.filter(row => row.scope === 'common').length }} of them are common resources, shared with other games.
        </p>
        <p v-if="group.action === 'remove' && group.rows.some(sharedDescriptor)" class="text-warning">
          {{ group.rows.filter(sharedDescriptor).length }} of them are declared in descriptors outside the game folder, which other games can include.
        </p>
        <ul class="list-group sync-file-list">
          <li v-for="row in group.rows" :key="row.id" class="list-group-item">
            <i aria-hidden="true" :class="['mdi', row.sequence ? 'mdi-animation-outline' : row.directory ? typeIcons.rtf : 'mdi-file-outline', 'text-muted']" /><span :title="group.action === 'sync' ? `${row.gdaFiles[0].path} → ${row.resource}` : row.resourcePath">{{ row.resource }}</span><small v-if="row.sequence" class="text-muted ml-2">{{ row.sequence.id ?? `${row.sequence.frames.length} files` }}</small><small v-if="row.directory" class="text-muted ml-2">{{ group.action === 'sync' ? rtfChangeSummary(row.directory) : `${row.directory.files.length} file${plural(row.directory.files.length)}` }}</small><small v-if="group.action === 'remove'" class="text-muted ml-2">{{ row.requiredBy.map(use => `${use.descriptor}:${use.line}`).join(', ') }}</small><span v-if="row.scope === 'common'" class="badge badge-light">common</span>
          </li>
        </ul>
      </section>
      <p class="mb-2">The GDA sync then compares again.</p>
      <p class="modal-folder"><i aria-hidden="true" class="mdi mdi-folder-outline text-primary" />{{ config.destination }}</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" @click="ui.resourceActions = null">Cancel</button>
      <button type="button" :class="['btn', resourceKind === 'sync' ? 'btn-primary' : 'btn-danger']" :disabled="!ui.resourceActions.length" @click="confirmResourceActions"><i aria-hidden="true" :class="['mdi', resourceActionIcons[resourceKind ?? 'sync']]" />{{ resourceConfirm }}</button>
    </div>
  </AppModal>

  <AppModal v-if="ui.shutdownConfirm" title="Stop EGT GDA Sync?" @close="ui.shutdownConfirm = false">
    <div class="modal-body"><p class="mb-0">This stops the local server. Your files, settings, and sync history stay saved. Launch EGT GDA Sync to open this workspace again.</p></div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" @click="ui.shutdownConfirm = false">Keep working</button>
      <button type="button" class="btn btn-danger" @click="stopApplication"><i aria-hidden="true" class="mdi mdi-power" />Stop application</button>
    </div>
  </AppModal>

  <AppModal v-if="ui.help" title="A little help for your workflow" @close="ui.help = false">
    <div class="modal-body help-body">
      <p>Browse the game’s resources, then bring the ones that differ from the GDA up to date on the Sync page.</p>
      <ul class="list-arrow">
        <li><strong>Explore your library.</strong> The Asset library lists the files in the game path. Filter by type, search, and click any asset to see its details and preview.</li>
        <li><strong>Choose what moves forward.</strong> On the Sync page, select resources, or use “Sync all pending” to copy every different GDA file to the game.</li>
        <li><strong>Keep it fresh.</strong> After editing your GDA files, use Rescan to compare them with the game again.</li>
      </ul>
      <table class="table table-sm mb-3">
        <tbody>
          <tr><td>Focus asset search</td><td class="text-right"><kbd>Ctrl / ⌘ K</kbd></td></tr>
          <tr><td>Close a dialog or menu</td><td class="text-right"><kbd>Esc</kbd></td></tr>
        </tbody>
      </table>
      <p class="text-muted small mb-0">DDS previews: DXT1, DXT3, DXT5, RGB24/32 and DX10 BC7 (UNORM / sRGB). Other DDS formats can still be copied. Model previews in this demo are illustrations.</p>
    </div>
  </AppModal>
</template>
