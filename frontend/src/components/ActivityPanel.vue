<script setup lang="ts">
import { ArrowRight, Check, CheckCheck, Clock3, File, Search, Settings2 } from '@lucide/vue';
import { size, time } from '../format';
import type { Activity } from '../types';

defineProps<{ activity: Activity[] }>();
const emit = defineEmits<{ explore: [] }>();
</script>

<template>
  <div class="activity-panel">
    <div class="panel-heading"><h2>A trail of good work</h2><span>{{ activity.length }} operations</span></div>
    <template v-if="activity.length">
      <div v-for="entry in activity" :key="entry.id" class="activity-item">
        <span :class="['activity-icon', { green: entry.action === 'sync' }]">
          <CheckCheck v-if="entry.action === 'sync'" :size="19" /><Search v-else-if="entry.action === 'scan'" :size="19" /><Settings2 v-else :size="19" />
        </span>
        <div>
          <strong>{{ entry.message }}</strong>
          <p>{{ time(entry.date) }}<template v-if="entry.bytes !== undefined"> · {{ size(entry.bytes) }} copied</template></p>
          <details v-if="entry.files.length">
            <summary>View {{ entry.files.length }} files</summary>
            <span v-for="file in entry.files" :key="file" class="activity-file"><File :size="13" />{{ file }}</span>
          </details>
        </div>
        <span class="activity-done"><Check :size="12" />Complete</span>
      </div>
    </template>
    <div v-else class="empty-state">
      <Clock3 :size="38" />
      <h2>Your next sync starts the story.</h2>
      <p>Sync some assets or rescan your workspace to see activity here.</p>
      <button class="button primary" @click="emit('explore')">Explore your assets<ArrowRight :size="15" /></button>
    </div>
  </div>
</template>
