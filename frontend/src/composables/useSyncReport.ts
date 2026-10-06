import { ref, watch } from 'vue';
import type { RssSyncReport } from '../types';
import { rssSync } from '../workspace';

/** The active workspace's GDA sync report as stored: the file of its last successful run, or null before the first one.
 * It loads again whenever a run ends or the workspace changes. */
export function useSyncReport() {
  const report = ref<RssSyncReport | null>(null);
  const loadError = ref('');
  let request = 0;

  async function load() {
    const id = ++request;
    loadError.value = '';
    try {
      const response = await fetch('/api/rss-sync/report', { cache: 'no-store' });
      const body = await response.json();
      if (id !== request) return;
      if (response.status === 404) report.value = null;
      else if (!response.ok) throw new Error(body.error || 'Request failed');
      else report.value = body;
    } catch (e) {
      if (id === request) loadError.value = (e as Error).message;
    }
  }

  watch(() => [rssSync.value?.workspaceId, rssSync.value?.lastRun?.finishedAt] as const, ([workspaceId], previous) => {
    // Another workspace's rows never show under this one while its report loads.
    if (previous && previous[0] !== workspaceId) report.value = null;
    void load();
  }, { immediate: true });

  return { report, loadError };
}
