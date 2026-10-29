<script setup lang="ts">
import ImageStudio from '../components/ImageStudio.vue';
import PageHeader from '../components/PageHeader.vue';
import { config } from '../workspace';
</script>

<template>
  <PageHeader title="Image studio">
    <template #links><li><span>Analyze image assets, edit metadata, or create a new image.</span></li></template>
  </PageHeader>
  <ImageStudio :key="config.defaultWorkspace" embedded />
</template>
