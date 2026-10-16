<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { PREVIEW_EXTENSIONS, extensionOf, fileType, movieFrameURL, reportPreviewURL, typeIcons } from '../format';
import FontPreview from './FontPreview.vue';

// The preview of a file that a report names, a game resource or a GDA file, with a badge of its format. A font is
// drawn with itself, and a movie shows its middle frame, which is all it costs: it plays only in the details. A movie
// whose frame cannot be read shows the movie icon.
const props = withDefaults(defineProps<{
  /** The file's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  /** False when the file cannot be read, so no preview is requested. */
  preview?: boolean;
  /** A movie whose frames stack the picture over its alpha (valpha): its frame is shown transparent. */
  stacked?: boolean;
}>(), { preview: true, stacked: false });
const failed = ref(false);
watch(() => [props.file, props.revision], () => { failed.value = false; });

const extension = computed(() => extensionOf(props.name));
const type = computed(() => fileType(extension.value));
const shown = computed(() => props.preview && !failed.value && PREVIEW_EXTENSIONS.includes(extension.value));
const movie = computed(() => props.preview && !failed.value && type.value === 'movie');
</script>

<template>
  <div :class="['thumbnail', type, { dds: extension === 'dds' || (movie && stacked) }]">
    <img v-if="shown" :src="reportPreviewURL(file, revision)" :alt="`${name} preview`" loading="lazy" @error="failed = true">
    <img v-else-if="movie" :src="movieFrameURL(file, revision, stacked)" :alt="`${name} frame`" loading="lazy" @error="failed = true">
    <FontPreview v-else-if="type === 'font' && preview" :file="file" :name="name" :revision="revision" />
    <div v-else :class="['generic-preview', type]"><i aria-hidden="true" :class="['mdi', typeIcons[type]]" /></div>
    <i v-if="movie" aria-hidden="true" class="mdi mdi-play-circle-outline thumbnail-movie" />
    <span v-if="extension" class="badge file-format">{{ extension.toUpperCase() }}</span>
  </div>
</template>

<style scoped>
.thumbnail-movie { position: absolute; right: 8px; bottom: 6px; color: #fff; font-size: 22px; line-height: 1; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6); pointer-events: none; }
</style>
