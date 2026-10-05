<script setup lang="ts">
import { reactive } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import { busy, config, data, navigate, openFolder, saveSettings, session, ui } from '../workspace';

const form = reactive({ name: config.value.name, source: config.value.source, destination: config.value.destination });
const windows = session.platform === 'Windows';

function cancel() {
  Object.assign(form, { name: config.value.name, source: config.value.source, destination: config.value.destination });
  navigate('dashboard');
}
</script>

<template>
  <PageHeader title="Workspace settings">
    <template #links>
      <li><a href="#" @click.prevent="openFolder('source')">Open source folder</a></li>
      <li><a href="#" @click.prevent="openFolder('destination')">Open GDA folder</a></li>
    </template>
    <template #links-right>
      <li><a href="#" @click.prevent="navigate('activity')">Sync activity</a></li>
    </template>
  </PageHeader>

  <div class="row">
    <div class="col-12 grid-margin stretch-card">
      <div class="card">
        <div class="card-body">
          <div class="d-flex align-items-center">
            <h4 class="card-title mb-0">Workspace Connection</h4>
            <span class="badge badge-success ml-auto"><i aria-hidden="true" class="mdi mdi-lan-connect" />Connected</span>
          </div>
          <p class="card-description mt-2">Connect your source assets to their home in GDA.</p>
          <form class="forms-sample" @submit.prevent="saveSettings(form)">
            <div class="form-group">
              <label for="project-name">Project name</label>
              <input id="project-name" v-model="form.name" class="form-control" required maxlength="80" placeholder="Your project name">
            </div>
            <div class="form-group">
              <label for="source-folder"><i aria-hidden="true" class="mdi mdi-folder-outline text-primary" />Source folder</label>
              <input id="source-folder" v-model="form.source" class="form-control" aria-describedby="source-help" required :placeholder="windows ? 'C:\\Users\\you\\project\\source' : '/home/you/project/source'">
              <small id="source-help" class="form-text text-muted">The originals you’re working with. All subfolders are included.</small>
            </div>
            <div class="flow-hint"><i aria-hidden="true" class="mdi mdi-arrow-down" />Assets flow from source to GDA</div>
            <div class="form-group">
              <label for="gda-destination"><i aria-hidden="true" class="mdi mdi-harddisk text-success" />GDA destination</label>
              <input id="gda-destination" v-model="form.destination" class="form-control" aria-describedby="destination-help" required :placeholder="windows ? 'C:\\Users\\you\\project\\gda' : '/home/you/project/gda'">
              <small id="destination-help" class="form-text text-muted">An existing, separate folder where your synced assets belong.</small>
            </div>
            <button type="submit" class="btn btn-primary mr-2" :disabled="!!busy">
              <i aria-hidden="true" :class="['mdi', busy === 'settings' ? 'mdi-loading mdi-spin' : 'mdi-check']" />Save connection
            </button>
            <button type="button" class="btn btn-light" @click="cancel">Cancel</button>
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
              <p>EGT GDA Sync copies assets from your source folder to your destination, keeping the same folder structure.</p>
              <ul class="list-ticked">
                <li>Original source files are preserved</li>
                <li>Existing GDA versions are backed up</li>
                <li>File contents determine sync status</li>
                <li>No uploads or cloud accounts</li>
              </ul>
              <h5 class="mt-4 mb-2">Your backups live here</h5>
              <code class="backup-path">{{ data!.backupPath }}</code>
            </div>
            <div class="col-lg-4 settings-stop">
              <h5 class="mb-1">Stop EGT GDA Sync</h5>
              <p class="text-muted">Close the local server when you’re done. Closing the last EGT GDA Sync page also stops it.</p>
              <button type="button" class="btn btn-outline-danger" :disabled="!!busy" @click="ui.shutdownConfirm = true"><i aria-hidden="true" class="mdi mdi-power" />Stop application</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
