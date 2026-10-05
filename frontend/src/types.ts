export type AssetType = 'texture' | 'model' | 'material' | 'audio' | 'other';
export type AssetStatus = 'new' | 'modified' | 'synced';
export type View = 'dashboard' | 'library' | 'pending' | 'synced' | 'rssSync' | 'history' | 'settings';

export interface Asset {
  id: string; name: string; path: string; folder: string; extension: string;
  type: AssetType; status: AssetStatus; size: number; modifiedAt: string;
  dimensions?: { width: number; height: number; format: string; mipmaps?: number };
  preview: boolean; previewError?: string;
}
export interface WorkspaceEntry { id: string; name: string; source: string; destination: string; demo?: boolean }
export interface WorkspaceConfig { name: string; source: string; destination: string; demo: boolean; port?: number; defaultWorkspace?: string; workspaces?: WorkspaceEntry[] }
export interface Activity {
  id: string; date: string; action: 'sync' | 'scan' | 'settings';
  message: string; files: string[]; bytes?: number;
}
export interface LibraryResponse {
  assets: Asset[]; config: WorkspaceConfig; activity: Activity[];
  scannedAt: string; warnings: string[]; backupPath: string; rssSync: RssSyncStatus;
}

/** The GDA sync: a workspace's game resources compared with its GDA folder, in a background process. */
export type RssCategory = 'identical' | 'missing' | 'different' | 'invalid';
export interface RssSyncSummary { compared: number; identical: number; identicalMipOnly: number; missing: number; different: number; invalid: number }
export interface RssSyncRun { state: 'succeeded' | 'failed'; startedAt: string; finishedAt: string; error?: string }
/** One finished run in a workspace's history; only a successful run has counts. */
export interface RssSyncHistoryEntry extends RssSyncRun { summary?: RssSyncSummary }
export interface RssSyncHistory { workspaceId: string; history: RssSyncHistoryEntry[] }
export interface RssSyncStatus {
  workspaceId: string; reportPath: string; running: boolean; startedAt: string | null;
  progress: { phase: 'descriptors' | 'index' | 'compare'; done: number; total: number } | null;
  lastRun: RssSyncRun | null; comparedAt: string | null; summary: RssSyncSummary | null;
}
export interface RssResource {
  id: string; category: RssCategory; status: string; resource: string; resourcePath: string; scope: 'game' | 'common' | 'outside';
  gdaFiles: { tree: 'game' | 'common'; path: string; absolutePath: string }[];
  requiredBy: { descriptor: string; line: number }[]; mipOnly?: boolean;
}
/** The stored report. Before the first successful run it holds only the workspace and the failed lastRun. */
export interface RssSyncReport {
  version: number; workspace: { id: string; name: string }; lastRun: RssSyncRun;
  startedAt?: string; finishedAt?: string; game?: string; resourcesDir?: string; gameDir?: string; gdaDir?: string;
  commonGdaDir?: string | null; extensions?: string[]; ignoreDdsMips?: boolean; summary?: RssSyncSummary;
  differences?: RssResource[]; identical?: RssResource[];
}
export interface Session { token: string; version: string; autoShutdownOnClose: boolean; platform: string }
export interface SyncResult { copied: string[]; failures: { name: string; message: string }[]; bytes: number; library: LibraryResponse }
