<script setup lang="ts">
import { nextTick } from 'vue';

// The StarAdmin check box: a transparent input over the template's drawn .input-helper box.
const props = defineProps<{ checked: boolean; label: string }>();
const emit = defineEmits<{ change: [checked: boolean] }>();

function onChange(event: Event) {
  const input = event.target as HTMLInputElement;
  emit('change', input.checked);
  // Stay controlled by the parent state, even when it does not change.
  void nextTick(() => { input.checked = props.checked; });
}
</script>

<template>
  <div class="form-check">
    <label class="form-check-label">
      <input type="checkbox" class="form-check-input" :checked="checked" :aria-label="label" @change="onChange"><i aria-hidden="true" class="input-helper" /><slot />
    </label>
  </div>
</template>
