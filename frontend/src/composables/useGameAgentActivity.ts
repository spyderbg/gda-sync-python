import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { api } from '../workspace';

interface GameAgentActivity { running: boolean; kind: string | null; files: string[] }

export const gameAgentActivity = shallowRef<GameAgentActivity | null>(null);
export const startingViewLayout = ref<string | null>(null);
let revision = 0;

export function updateGameAgentActivity(value: GameAgentActivity) {
  revision++;
  gameAgentActivity.value = { running: value.running, kind: value.kind, files: value.files };
}

/** The sidebar stays mounted while an agent works, even when its page is hidden or has not opened yet. */
export function useGameAgentActivity() {
  let active = false;
  let timer = 0;
  async function poll() {
    const requestedAt = revision;
    try {
      const value = await api<GameAgentActivity>('game/agent/status?summary=true', 'GET');
      // A start response or the transcript's poll can supply a newer status while this request is pending.
      if (active && requestedAt === revision) updateGameAgentActivity(value);
    } catch {
      // Retain the last known activity until the backend answers again; the task page reports connection errors.
    } finally {
      if (active) timer = window.setTimeout(poll, gameAgentActivity.value?.running ? 1000 : 3000);
    }
  }
  onMounted(() => { active = true; void poll(); });
  onBeforeUnmount(() => { active = false; window.clearTimeout(timer); });
}
