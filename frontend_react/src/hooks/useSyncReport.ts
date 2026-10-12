import { useEffect, useRef, useState } from 'react';
import type { RssSyncReport } from '../types';
import { useWorkspace } from '../workspace';

/** The active workspace's GDA sync report as stored: the file of its last successful run, or null before the first one.
 * It loads again whenever a run ends or the workspace changes. */
export function useSyncReport() {
  const { rssSync } = useWorkspace();
  const [report, setReport] = useState<RssSyncReport | null>(null);
  const [loadError, setLoadError] = useState('');
  const request = useRef(0);
  const previousWorkspace = useRef<string | undefined>(undefined);
  const workspaceId = rssSync?.workspaceId;
  const finishedAt = rssSync?.lastRun?.finishedAt;

  useEffect(() => {
    if (previousWorkspace.current !== undefined && previousWorkspace.current !== workspaceId) setReport(null);
    previousWorkspace.current = workspaceId;
    const id = ++request.current;
    setLoadError('');
    void (async () => {
      try {
        const response = await fetch('/api/rss-sync/report', { cache: 'no-store' });
        const body = await response.json();
        if (id !== request.current) return;
        if (response.status === 404) setReport(null);
        else if (!response.ok) throw new Error(body.error || 'Request failed');
        else setReport(body);
      } catch (e) {
        if (id === request.current) setLoadError((e as Error).message);
      }
    })();
  }, [workspaceId, finishedAt]);

  return { report, loadError };
}
