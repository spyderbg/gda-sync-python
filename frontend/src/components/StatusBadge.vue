<script setup lang="ts">
import { Check } from '@lucide/vue';
import { statusNames } from '../format';
import type { AssetStatus } from '../types';

defineProps<{ status: AssetStatus }>();
</script>

<template>
  <span :class="['status', `status-${status}`]"><Check v-if="status === 'synced'" :size="11" /><span v-else class="status-dot" />{{ statusNames[status] }}</span>
</template>
