<script setup lang="ts">
import type { WorkspaceEntry } from '../types';
import WorkspaceIcon from './WorkspaceIcon.vue';

defineProps<{ workspace: WorkspaceEntry; current?: boolean; disabled?: boolean; opening?: boolean }>();
const emit = defineEmits<{ select: []; rescan: [] }>();
</script>

<template>
  <div :class="['card', 'workspace-card', { 'is-current': current, 'is-disabled': disabled }]" :aria-busy="opening || undefined">
    <button type="button" class="workspace-card-select" :aria-label="workspace.name"
            :aria-current="current ? 'true' : undefined" :disabled="disabled" @click="emit('select')">
      <span class="workspace-card-heading">
        <WorkspaceIcon :workspace-id="workspace.id" />
        <span class="workspace-card-identity"><strong>{{ workspace.name }}</strong><small>{{ workspace.id }}</small></span>
        <span v-if="current" class="workspace-card-current">Current</span>
      </span>
      <span class="workspace-card-folders">
        <span><small>Game folder</small><span :title="workspace.destination">{{ workspace.destination }}</span></span>
        <span><small>GDA folder</small><span :title="workspace.source">{{ workspace.source || 'Not configured' }}</span></span>
      </span>
    </button>
    <div class="workspace-card-actions">
      <button type="button" class="btn btn-outline-primary btn-sm workspace-card-rescan" :disabled="disabled" @click="emit('rescan')">
        <i aria-hidden="true" :class="['mdi', opening ? 'mdi-loading mdi-spin' : 'mdi-refresh']" />{{ opening ? 'Opening…' : 'Rescan workspace' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.workspace-card { width: 100%; height: 100%; padding: 20px; gap: 18px; border: 1px solid #dce1ea; border-radius: 10px; background: #fff; color: #343a40; transition: border-color .15s, box-shadow .15s; }
.workspace-card:hover:not(.is-disabled) { border-color: #2277cf; box-shadow: 0 4px 16px #2277cf15; }
.workspace-card-select { display: flex; flex: 1; flex-direction: column; gap: 18px; width: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.workspace-card-select:focus-visible { outline: 3px solid #2277cf; outline-offset: 3px; }
.workspace-card.is-disabled { opacity: .65; }
.workspace-card button:disabled { cursor: wait; }
.workspace-card.is-current { border-color: #2277cf; }
.workspace-card-heading { display: flex; align-items: center; gap: 12px; }
.workspace-card-identity { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.workspace-card-identity strong { display: block; font-size: 16px; line-height: 1.4; font-weight: 600; }
.workspace-card-identity small { display: block; margin-top: 3px; font-size: 12px; color: #6c757d; }
.workspace-card-current { align-self: flex-start; padding: 4px 8px; border-radius: 12px; background: #edf4fe; color: #1b65b2; font-size: 11px; }
.workspace-card-folders { display: grid; gap: 12px; }
.workspace-card-folders small { display: block; margin-bottom: 3px; font-size: 11px; color: #6c757d; }
.workspace-card-folders > span > span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; }
.workspace-card-actions { margin-top: auto; padding-top: 12px; border-top: 1px solid #edf0f5; }
.workspace-card-rescan { display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%; }
</style>
