<script setup lang="ts">
import { computed } from 'vue';
import { syncBars } from '../charts/configs';
import ChartCanvas from '../components/ChartCanvas.vue';
import PageHeader from '../components/PageHeader.vue';
import { number, plural, size, time } from '../format';
import { syncHistory } from '../insights';
import { data, navigate } from '../workspace';

const activity = computed(() => data.value!.activity);
const count = (action: string) => activity.value.filter(entry => entry.action === action).length;
const syncs = computed(() => activity.value.filter(entry => entry.action === 'sync'));
const copiedBytes = computed(() => syncs.value.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0));
const copiedFiles = computed(() => syncs.value.reduce((sum, entry) => sum + entry.files.length, 0));
const history = computed(() => syncHistory(activity.value, 12));
const chart = computed(() => syncBars(history.value));
const icons = { sync: 'mdi-sync', scan: 'mdi-magnify', settings: 'mdi-cog-outline' };
const colors = { sync: 'bg-success', scan: 'bg-primary', settings: 'bg-info' };
</script>

<template>
  <PageHeader title="Sync activity">
    <template #links>
      <li><span>{{ count('sync') }} sync{{ plural(count('sync')) }}</span></li>
      <li><span>{{ count('scan') }} rescan{{ plural(count('scan')) }}</span></li>
      <li><span>{{ count('settings') }} connection change{{ plural(count('settings')) }}</span></li>
    </template>
    <template #links-right>
      <li><a href="#" @click.prevent="navigate('library')">Asset library</a></li>
    </template>
  </PageHeader>

  <div v-if="activity.length" class="row">
    <div class="col-lg-8 grid-margin stretch-card">
      <div class="card">
        <div class="card-body">
          <div class="d-flex justify-content-between">
            <h4 class="card-title mb-0">A Trail of Good Work</h4>
            <p class="mb-0 text-muted">{{ activity.length }} operations</p>
          </div>
          <p>A little history of everything you’ve moved forward.</p>
          <div class="table-responsive">
            <table class="table table-striped activity-table">
              <thead><tr><th>Operation</th><th>Date</th><th class="text-right">Copied</th><th>Status</th></tr></thead>
              <tbody>
                <tr v-for="entry in activity" :key="entry.id">
                  <td>
                    <div class="d-flex align-items-start">
                      <span :class="['activity-icon', colors[entry.action]]"><i aria-hidden="true" :class="['mdi', icons[entry.action]]" /></span>
                      <div class="min-w-0">
                        <p class="mb-1 font-weight-medium text-dark">{{ entry.message }}</p>
                        <details v-if="entry.files.length">
                          <summary>View {{ entry.files.length }} files</summary>
                          <span v-for="file in entry.files" :key="file" class="activity-file"><i aria-hidden="true" class="mdi mdi-file-outline" />{{ file }}</span>
                        </details>
                      </div>
                    </div>
                  </td>
                  <td class="text-nowrap">{{ time(entry.date) }}</td>
                  <td class="text-right text-nowrap">{{ entry.bytes !== undefined ? size(entry.bytes) : '—' }}</td>
                  <td><span class="badge badge-success status-badge"><i aria-hidden="true" class="mdi mdi-check" />Complete</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    <div class="col-lg-4">
      <div class="row">
        <div class="col-12 grid-margin">
          <div class="card">
            <div class="card-body">
              <h4 class="card-title mb-0">Copied per Sync</h4>
              <div class="d-flex align-items-end mt-3">
                <h3 class="mb-0 font-weight-semibold">{{ size(copiedBytes) }}</h3>
                <p class="mb-0 ml-2 mb-1 text-muted">in {{ syncs.length }} sync{{ plural(syncs.length) }}</p>
              </div>
              <ChartCanvas v-if="history.values.length" class="mt-4" :config="chart" label="Data copied by each recent sync" :height="180" />
              <p v-else class="mt-3 mb-0 text-muted">Sync some assets to see how much data each sync copies.</p>
            </div>
          </div>
        </div>
        <div class="col-12 grid-margin">
          <div class="card">
            <div class="card-body">
              <h4 class="card-title">Totals</h4>
              <div class="d-flex py-2 border-bottom"><p class="mb-0">Files copied</p><p class="mb-0 ml-auto font-weight-semibold">{{ number(copiedFiles) }}</p></div>
              <div class="d-flex py-2 border-bottom"><p class="mb-0">Syncs</p><p class="mb-0 ml-auto font-weight-semibold">{{ number(syncs.length) }}</p></div>
              <div class="d-flex py-2"><p class="mb-0">Rescans</p><p class="mb-0 ml-auto font-weight-semibold">{{ number(count('scan')) }}</p></div>
              <p class="mt-3 mb-1 text-muted small">Replaced GDA files are backed up in</p>
              <code class="backup-path">{{ data!.backupPath }}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div v-else class="card empty-state grid-margin">
    <div class="card-body">
      <i aria-hidden="true" class="mdi mdi-history text-muted" />
      <h4>Your next sync starts the story.</h4>
      <p class="text-muted">Sync some assets or rescan your workspace to see activity here.</p>
      <button type="button" class="btn btn-primary" @click="navigate('library')">Explore your assets<i aria-hidden="true" class="mdi mdi-arrow-right ml-2 mr-0" /></button>
    </div>
  </div>
</template>
