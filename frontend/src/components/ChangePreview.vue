<script setup lang="ts">
import type { ChangePlan } from '../types';
import { size } from '../format';
defineProps<{ plan: ChangePlan }>();
const emit = defineEmits<{ toggle: [string, boolean] }>();
</script>

<template>
  <section class="change-preview" aria-label="Change preview">
    <div v-for="item in plan.blockers" :key="item.code + item.files.join()" class="alert alert-danger" role="alert">
      <strong>Blocked:</strong> {{ item.message }}<small v-for="file in item.files" :key="file">{{ file }}</small>
    </div>
    <div v-for="item in plan.warnings" :key="item.code + item.files.join()" class="alert alert-warning">
      {{ item.message }}<small v-for="file in item.files" :key="file">{{ file }}</small>
    </div>
    <h6 v-if="plan.files.length">File operations · {{ plan.files.length }}</h6>
    <ul v-if="plan.files.length" class="list-group mb-3">
      <li v-for="file in plan.files" :key="file.source" class="list-group-item">
        <strong>{{ file.mode }}</strong> · {{ size(file.size) }}<small>{{ file.source }} → {{ file.target }}</small>
      </li>
    </ul>
    <template v-for="(edits, file) in plan.edits" :key="file">
      <h6 class="change-file">{{ file }}</h6>
      <ul class="list-group mb-3">
        <li v-for="edit in edits" :key="edit.id" class="list-group-item">
          <label v-if="edit.category === 'value'" class="mb-1">
            <input type="checkbox" :checked="edit.selected" @change="emit('toggle', edit.id, ($event.target as HTMLInputElement).checked)"> Update value reference
          </label>
          <small>Line {{ edit.line }} · {{ edit.field }}</small><code>{{ edit.old }} → {{ edit.new }}</code>
        </li>
      </ul>
    </template>
    <p class="text-muted mb-0">Apply saves one backup. Restoring it puts the references and moved files back, and removes unchanged copies.</p>
  </section>
</template>

<style scoped>
.change-preview { margin-top: 18px; }
.change-preview small { display: block; overflow-wrap: anywhere; }
.change-preview code, .change-file { overflow-wrap: anywhere; }
.change-preview .list-group-item { padding: 8px 12px; font-size: 12px; }
.change-preview .alert { font-size: 13px; }
</style>
