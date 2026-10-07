import { ref, watch } from 'vue';
import type { AssetReport } from '../types';
import { assetReport, config } from '../workspace';

/** The active workspace's newest asset report as stored, or null before the first one. It loads again whenever a new
 * report is generated or the workspace changes. */
export function useAssetReport() {
  const report = ref<AssetReport | null>(null);
  const loadError = ref('');
  let request = 0;

  async function load() {
    const id = ++request;
    loadError.value = '';
    if (!assetReport.value?.reportPath) {
      report.value = null;
      return;
    }
    try {
      const response = await fetch('/api/asset-report', { cache: 'no-store' });
      const body = await response.json();
      if (id !== request) return;
      if (response.status === 404) report.value = null;
      else if (!response.ok) throw new Error(body.error || 'Request failed');
      else report.value = body;
    } catch (e) {
      if (id === request) loadError.value = (e as Error).message;
    }
  }

  watch(() => [config.value?.defaultWorkspace, assetReport.value?.reportPath] as const, ([workspace], previous) => {
    // Another workspace's assets never show under this one while its report loads.
    if (previous && previous[0] !== workspace) report.value = null;
    void load();
  }, { immediate: true });

  return { report, loadError };
}
