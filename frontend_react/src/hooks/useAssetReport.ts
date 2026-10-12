import { useEffect, useRef, useState } from 'react';
import type { AssetReport } from '../types';
import { useWorkspace } from '../workspace';

/** The active workspace's newest asset report as stored, or null before the first one. It loads again whenever a new
 * report is generated or the workspace changes. */
export function useAssetReport() {
  const { assetReport, config } = useWorkspace();
  const [report, setReport] = useState<AssetReport | null>(null);
  const [loadError, setLoadError] = useState('');
  const request = useRef(0);
  const previousWorkspace = useRef<string | undefined>(undefined);
  const workspaceId = config?.defaultWorkspace;
  const reportPath = assetReport?.reportPath;

  useEffect(() => {
    if (previousWorkspace.current !== undefined && previousWorkspace.current !== workspaceId) setReport(null);
    previousWorkspace.current = workspaceId;
    const id = ++request.current;
    setLoadError('');
    if (!reportPath) {
      setReport(null);
      return;
    }
    void (async () => {
      try {
        const response = await fetch('/api/asset-report', { cache: 'no-store' });
        const body = await response.json();
        if (id !== request.current) return;
        if (response.status === 404) setReport(null);
        else if (!response.ok) throw new Error(body.error || 'Request failed');
        else setReport(body);
      } catch (e) {
        if (id === request.current) setLoadError((e as Error).message);
      }
    })();
  }, [workspaceId, reportPath]);

  return { report, loadError };
}
