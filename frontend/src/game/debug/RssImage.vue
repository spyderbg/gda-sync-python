<script setup lang="ts">
// A resource image in a debug tool (ImGui::Image of an image_data): its part of its file, drawn at a size.
import { ref, watchEffect } from 'vue';
import type { ImageData } from '@game/engine/GameVideoCtrl/ImageData';

const props = defineProps<{ image: ImageData; width?: number; height: number; title?: string }>();
const canvas = ref<HTMLCanvasElement | null>(null);

watchEffect(onCleanup => {
  const target = canvas.value;
  if (!target) return;
  const image = new Image();
  let cancelled = false;
  onCleanup(() => {
    cancelled = true;
  });
  image.onload = () => {
    if (cancelled) return;
    const rect = props.image.rect ?? { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
    // height kept, width by the aspect ratio (or the size asked)
    const width = props.width ?? Math.round(rect.w * (props.height / rect.h));
    target.width = width;
    target.height = props.height;
    const context = target.getContext('2d');
    context?.clearRect(0, 0, width, props.height);
    context?.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, width, props.height);
  };
  image.src = props.image.src;
});
</script>

<template>
  <canvas ref="canvas" class="rss-image" :width="width ?? height" :height="height" :title="title" role="img" :aria-label="title" />
</template>

<style scoped>
.rss-image {
  display: block;
}
</style>
