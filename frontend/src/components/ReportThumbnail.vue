<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PREVIEW_EXTENSIONS, extensionOf, fileType, reportPreviewURL, typeIcons } from '../format';

// The preview of a file the GDA sync report names, a game resource or a GDA file, in the look of AssetThumbnail.
const props = withDefaults(defineProps<{
  /** The file's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  /** False when the file cannot be read, so no preview is requested. */
  preview?: boolean;
}>(), { preview: true });
const failed = ref(false);
watch(() => [props.file, props.revision], () => { failed.value = false; });

const extension = computed(() => extensionOf(props.name));
const type = computed(() => fileType(extension.value));
const shown = computed(() => props.preview && !failed.value && PREVIEW_EXTENSIONS.includes(extension.value));
</script>

<template>
  <div :class="['thumbnail', type, { dds: extension === 'dds' }]">
    <img v-if="shown" :src="reportPreviewURL(file, revision)" :alt="`${name} preview`" loading="lazy" @error="failed = true">
    <div v-else :class="['generic-preview', type]"><i aria-hidden="true" :class="['mdi', typeIcons[type]]" /></div>
    <span v-if="extension" class="badge file-format">{{ extension.toUpperCase() }}</span>
  </div>
</template>
