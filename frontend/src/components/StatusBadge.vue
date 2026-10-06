<script setup lang="ts">
import { statusBadges, statusNames } from '../format';
import type { AssetStatus } from '../types';

defineProps<{ status: AssetStatus }>();
const icons: Record<AssetStatus, string> = { new: 'mdi-plus-circle-outline', modified: 'mdi-pencil-circle-outline', synced: 'mdi-check' };
</script>

<template>
  <span :class="['badge', 'status-badge', statusBadges[status]]"><i aria-hidden="true" :class="['mdi', icons[status]]" />{{ statusNames[status] }}</span>
</template>
