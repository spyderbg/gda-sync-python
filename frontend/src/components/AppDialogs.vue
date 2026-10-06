<script setup lang="ts">
import { plural, size } from '../format';
import { config, confirmResourceSync, confirmSync, data, inspected, stopApplication, syncAssets, ui } from '../workspace';
import AppModal from './AppModal.vue';
import AssetThumbnail from './AssetThumbnail.vue';
import StatusBadge from './StatusBadge.vue';
</script>

<template>
  <AppModal v-if="ui.syncIds" title="Ready to bring things up to date?" @close="ui.syncIds = null">
    <div class="modal-body">
      <p>Copy {{ syncAssets.length }} asset{{ plural(syncAssets.length) }} from your GDA folder to the game. Existing game files will be replaced, with their previous versions saved in your backups.</p>
      <div class="sync-summary">
        <div><small class="text-muted">ASSETS TO SYNC</small><h4 class="font-weight-semibold mb-0">{{ syncAssets.length }}</h4></div>
        <i aria-hidden="true" class="mdi mdi-arrow-right text-primary" />
        <div><small class="text-muted">TOTAL SIZE</small><h4 class="font-weight-semibold mb-0">{{ size(syncAssets.reduce((sum, asset) => sum + asset.size, 0)) }}</h4></div>
      </div>
      <ul class="list-group sync-file-list">
        <li v-for="asset in syncAssets" :key="asset.id" class="list-group-item"><i aria-hidden="true" class="mdi mdi-file-outline text-muted" /><span>{{ asset.name }}</span><StatusBadge :status="asset.status" /></li>
      </ul>
      <p class="modal-folder"><i aria-hidden="true" class="mdi mdi-folder-outline text-primary" />{{ config.destination }}</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" @click="ui.syncIds = null">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="!syncAssets.length" @click="confirmSync"><i aria-hidden="true" class="mdi mdi-sync" />Sync {{ syncAssets.length }} asset{{ plural(syncAssets.length) }}</button>
    </div>
  </AppModal>

  <AppModal v-if="ui.resourceSync" title="Ready to bring things up to date?" @close="ui.resourceSync = null">
    <div class="modal-body">
      <p>Copy {{ ui.resourceSync.length }} resource{{ plural(ui.resourceSync.length) }} of the GDA sync report from the GDA folder to the game, each from its closest GDA file. Existing game files will be replaced, with their previous versions saved in your backups. The GDA sync then compares again.</p>
      <p v-if="ui.resourceSync.some(row => row.scope === 'common')" class="text-warning">
        {{ ui.resourceSync.filter(row => row.scope === 'common').length }} of them are common resources, shared with other games.
      </p>
      <ul class="list-group sync-file-list">
        <li v-for="row in ui.resourceSync" :key="row.id" class="list-group-item">
          <i aria-hidden="true" class="mdi mdi-file-outline text-muted" /><span :title="`${row.gdaFiles[0].path} → ${row.resource}`">{{ row.resource }}</span><span v-if="row.scope === 'common'" class="badge badge-light">common</span>
        </li>
      </ul>
      <p class="modal-folder"><i aria-hidden="true" class="mdi mdi-folder-outline text-primary" />{{ config.destination }}</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" @click="ui.resourceSync = null">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="!ui.resourceSync.length" @click="confirmResourceSync"><i aria-hidden="true" class="mdi mdi-sync" />Sync {{ ui.resourceSync.length }} resource{{ plural(ui.resourceSync.length) }}</button>
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
      <p>Search and inspect your assets, then sync the files you’re ready to move to the game.</p>
      <ul class="list-arrow">
        <li><strong>Explore your library.</strong> Filter by type, file format, or sync status. Click any asset to see its details and preview.</li>
        <li><strong>Choose what moves forward.</strong> Select individual assets, or use “Sync all pending” to copy every new and modified file.</li>
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

  <AppModal v-if="ui.expanded && inspected" :title="inspected.name" wide @close="ui.expanded = false">
    <div class="modal-body enlarged-preview"><AssetThumbnail :asset="inspected" :revision="data!.scannedAt" large /></div>
    <div class="modal-footer justify-content-between">
      <span class="text-muted">{{ inspected.extension.toUpperCase() }} · {{ size(inspected.size) }}</span>
      <span v-if="inspected.dimensions" class="text-muted">{{ inspected.dimensions.width }} × {{ inspected.dimensions.height }} pixels</span>
    </div>
  </AppModal>
</template>
