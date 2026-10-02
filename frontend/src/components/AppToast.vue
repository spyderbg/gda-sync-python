<script setup lang="ts">
import { toast } from '../workspace';
</script>

<template>
  <div v-if="toast" class="app-toast">
    <div :class="['toast', 'show', toast.error ? 'toast-error' : 'toast-success']" role="status">
      <div class="toast-body">
        <i aria-hidden="true" :class="['mdi', toast.error ? 'mdi-alert-circle-outline text-danger' : 'mdi-check-circle-outline text-success']" />
        <span>{{ toast.text }}</span>
        <button type="button" class="close" aria-label="Dismiss notification" @click="toast = null"><span aria-hidden="true">&times;</span></button>
      </div>
    </div>
  </div>
</template>
