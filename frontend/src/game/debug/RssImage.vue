<script setup lang="ts">
// A resource image in a debug tool (ImGui::Image of an image_data): its part of its file, drawn at a size.
import { ref, watch } from 'vue';
import type { ImageData } from '@game/engine/GameVideoCtrl/ImageData';

const props = defineProps<{ image: ImageData; width?: number; height: number; title?: string }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const loaded = ref(false);

watch([
  canvas, () => props.image.src,
  () => props.image.rect?.x, () => props.image.rect?.y, () => props.image.rect?.w, () => props.image.rect?.h,
  () => props.width, () => props.height,
], ([target, src], _previous, onCleanup) => {
  loaded.value = false;
  if (!target) return;
  const source = props.image.rect ? { ...props.image.rect } : null;
  const requestedWidth = props.width;
  const height = props.height;
  const context = target.getContext('2d');
  context?.clearRect(0, 0, target.width, target.height);
  const image = new Image();
  let cancelled = false;
  onCleanup(() => {
    cancelled = true;
  });
  image.onload = () => {
    if (cancelled) return;
    if (!context) return;
    const rect = source ?? { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
    // height kept, width by the aspect ratio (or the size asked)
    const width = requestedWidth ?? Math.round(rect.w * (height / rect.h));
    target.width = width;
    target.height = height;
    context.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, width, height);
    loaded.value = true;
  };
  image.src = src;
}, { immediate: true });
</script>

<template>
  <canvas ref="canvas" class="rss-image" :data-loaded="loaded" :width="width ?? height" :height="height" :title="title" role="img" :aria-label="title" />
</template>

<style scoped>
.rss-image {
  display: block;
}
</style>
