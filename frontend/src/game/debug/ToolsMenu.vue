<script lang="ts">
/** An item the page adds to the Tools menu, under the tools' own. */
export interface PageMenuItem {
  label: string;
  icon: string;
  select: () => void;
}
</script>

<script setup lang="ts">
// The Tools menu of the debug overlay's main menu bar (C++'s BeginMainMenuBar → BeginMenu("Tools") → MenuItem): built
// when it opens, as ImGui builds it every frame. Under a line, the page's own items (the Play page's: Open in a new
// window). The Play page's menu is under the game, the Game tools page's in its bar.
import { shallowRef } from 'vue';
import type { MainMenuItem } from '@game/engine/Game/RuntimeExport/IDebugOverlay';

const props = defineProps<{ build: () => MainMenuItem[]; pageItems: PageMenuItem[]; opens: 'up' | 'down' }>();
const emit = defineEmits<{ selected: [] }>();

const items = shallowRef<MainMenuItem[] | null>(null);

function toggle() {
  items.value = items.value ? null : props.build();
}

function select(action: () => void) {
  action();
  items.value = null;
  emit('selected');
}
</script>

<template>
  <div class="tools-menu">
    <button type="button" class="btn btn-outline-secondary btn-sm" :aria-expanded="!!items" aria-haspopup="menu" title="The debug tools (the C++ debug overlay's Tools menu)" @click="toggle"><i class="mdi mdi-tools" aria-hidden="true" /> Tools <i class="mdi mdi-menu-down" aria-hidden="true" /></button>
    <div v-if="items" :class="['tools-menu-items card shadow-sm', `tools-menu-${opens}`]" role="menu">
      <button v-for="item in items" :key="item.label" type="button" class="dropdown-item tools-menu-item" role="menuitem" @click="select(item.select)">
        <span>{{ item.label }}</span><kbd v-if="item.shortcut">{{ item.shortcut }}</kbd>
      </button>
      <span v-if="!items.length" class="dropdown-item-text text-muted">No tools</span>
      <template v-if="pageItems.length">
        <div class="dropdown-divider" role="separator" />
        <button v-for="item in pageItems" :key="item.label" type="button" class="dropdown-item tools-menu-item" role="menuitem" @click="select(item.select)">
          <span>{{ item.label }}</span><i :class="['mdi', item.icon]" aria-hidden="true" />
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tools-menu {
  position: relative;
}

.tools-menu-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;

  kbd {
    font-size: 0.7rem;
  }
}

// over the tools' windows, which come to the front from 1050 up as they are clicked (ToolWindow.vue)
.tools-menu-items {
  position: absolute;
  z-index: 100000;
  min-width: 220px;
  padding: 0.25rem 0;
}

// under the game: up, from the right
.tools-menu-up {
  right: 0;
  bottom: 100%;
}

// in the Game tools page's bar: down, from the left
.tools-menu-down {
  left: 0;
  top: 100%;
}
</style>
