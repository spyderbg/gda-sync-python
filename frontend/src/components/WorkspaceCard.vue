<script setup lang="ts">
import type { WorkspaceEntry } from '../types';

defineProps<{ workspace: WorkspaceEntry; current?: boolean; disabled?: boolean; opening?: boolean }>();
const emit = defineEmits<{ select: [] }>();
</script>

<template>
  <button type="button" :class="['card', 'workspace-card', { 'is-current': current }]" :aria-label="workspace.name"
          :aria-current="current ? 'true' : undefined" :aria-busy="opening || undefined" :disabled="disabled" @click="emit('select')">
    <span class="workspace-card-heading">
      <span class="workspace-card-icon"><i aria-hidden="true" class="mdi mdi-gamepad-variant-outline" /></span>
      <span class="workspace-card-identity"><strong>{{ workspace.name }}</strong><small>{{ workspace.id }}</small></span>
      <span v-if="current" class="workspace-card-current">Current</span>
    </span>
    <span class="workspace-card-folders">
      <span><small>GDA folder</small><span :title="workspace.source">{{ workspace.source }}</span></span>
      <span><small>Game folder</small><span :title="workspace.destination">{{ workspace.destination }}</span></span>
    </span>
    <span class="workspace-card-open">{{ opening ? 'Opening…' : 'Open workspace' }}<i aria-hidden="true" :class="['mdi', opening ? 'mdi-loading mdi-spin' : 'mdi-arrow-right']" /></span>
  </button>
</template>

<style scoped>
.workspace-card { width: 100%; height: 100%; padding: 20px; gap: 18px; border: 1px solid #dce1ea; border-radius: 10px; background: #fff; color: #343a40; font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.workspace-card:hover:not(:disabled) { border-color: #2277cf; box-shadow: 0 4px 16px #2277cf15; }
.workspace-card:focus-visible { outline: 3px solid #2277cf; outline-offset: 3px; }
.workspace-card:disabled { opacity: .65; cursor: wait; }
.workspace-card.is-current { border-color: #2277cf; }
.workspace-card-heading { display: flex; align-items: center; gap: 12px; }
.workspace-card-icon { display: grid; place-items: center; flex-shrink: 0; width: 42px; height: 42px; border-radius: 10px; background: #edf4fe; color: #2277cf; font-size: 25px; }
.workspace-card-identity { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.workspace-card-identity strong { display: block; font-size: 16px; line-height: 1.4; font-weight: 600; }
.workspace-card-identity small { display: block; margin-top: 3px; font-size: 12px; color: #6c757d; }
.workspace-card-current { align-self: flex-start; padding: 4px 8px; border-radius: 12px; background: #edf4fe; color: #1b65b2; font-size: 11px; }
.workspace-card-folders { display: grid; gap: 12px; }
.workspace-card-folders small { display: block; margin-bottom: 3px; font-size: 11px; color: #6c757d; }
.workspace-card-folders > span > span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; }
.workspace-card-open { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 12px; border-top: 1px solid #edf0f5; color: #2277cf; font-size: 13px; font-weight: 500; }
.workspace-card-open .mdi { font-size: 18px; }
</style>
