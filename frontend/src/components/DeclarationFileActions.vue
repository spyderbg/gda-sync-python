<script setup lang="ts">
import { copyDeclarationPath, openDeclaration, openDeclarationFolder } from '../workspace';

defineProps<{ descriptor: string; line: number }>();
</script>

<template>
  <span class="declaration-file-actions">
    <button type="button" class="details-icon" :aria-label="`Copy path of ${descriptor}`" title="Copy file path" @click="copyDeclarationPath(descriptor)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
    <button type="button" class="details-icon" :aria-label="`Open the folder of ${descriptor}`" title="Open containing folder" @click="openDeclarationFolder(descriptor)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
    <button type="button" class="details-icon" :aria-label="`Open ${descriptor} at line ${line} in VS Code`" :title="`Open in VS Code: ${descriptor}:${line}`" @click="openDeclaration(descriptor, line)"><i aria-hidden="true" class="mdi mdi-code-braces" /></button>
  </span>
</template>

<style scoped>
.declaration-file-actions { display: inline-flex; flex-shrink: 0; align-items: center; gap: 4px; margin-left: auto; }
</style>
