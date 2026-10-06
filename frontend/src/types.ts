export type AssetType = 'texture' | 'model' | 'material' | 'audio' | 'other';
export type AssetStatus = 'new' | 'modified' | 'synced';
export type FolderKey = 'source' | 'destination';
export type View ='dashboard' | 'library' | 'pending' | 'synced' | 'rssSync' | 'history' | 'settings';

export interface Asset {
  id: string; name: string; path: string; folder: string; extension: string;
  type: AssetType; status: AssetStatus; size: number; modifiedAt: string;
  dimensions?: { width: number; height: number; format: string; mipmaps?: number };
  preview: boolean; previewError?: string;
}
/** `source` is the GDA folder files are copied from, `destination` the game folder they are copied to. */
export interface WorkspaceEntry { id: string; name: string; source: string; destination: string; demo?: boolean }
export interface WorkspaceConfig { name: string; source: string; destination: string; demo: boolean; port?: number; defaultWorkspace?: string; workspaces?: WorkspaceEntry[] }
export interface Activity {
  id: string; date: string; action: 'sync' | 'scan' | 'settings';
  message: string; files: string[]; bytes?: number;
}
export interface LibraryResponse {
  assets: Asset[]; config: WorkspaceConfig; activity: Activity[];
  scannedAt: string; warnings: string[]; backupPath: string; rssSync: RssSyncStatus;
  /** The active workspace's folders that do not exist on disk. */
  missingFolders: FolderKey[];
}

/** The GDA sync: a workspace's game resources compared with its GDA folder, in a background process. */
export type RssCategory = 'identical' | 'missing' | 'different' | 'invalid';
export interface RssSyncSummary { compared: number; identical: number; identicalMipOnly: number; missing: number; different: number; invalid: number }
export interface RssSyncRun { state: 'succeeded' | 'failed'; startedAt: string; finishedAt: string; error?: string }
/** One finished run in a workspace's history, read from its report file; only a successful run has counts. */
export interface RssSyncHistoryEntry extends RssSyncRun { summary?: RssSyncSummary; workspace?: RssSyncWorkspace; descriptors?: number; file: string }
export interface RssSyncHistory { workspaceId: string; workspace: RssSyncWorkspace; history: RssSyncHistoryEntry[] }
export interface RssSyncStatus {
  workspaceId: string; reportPath: string | null; running: boolean; startedAt: string | null;
  progress: { phase: 'descriptors' | 'index' | 'compare'; done: number; total: number } | null;
  lastRun: RssSyncRun | null; comparedAt: string | null; summary: RssSyncSummary | null;
}
export interface RssResource {
  id: string; category: RssCategory; status: string; resource: string; resourcePath: string; scope: 'game' | 'common' | 'outside';
  gdaFiles: { tree: 'game' | 'common'; path: string; absolutePath: string }[];
  requiredBy: { descriptor: string; line: number }[]; mipOnly?: boolean;
}
/** The workspace settings a run used, named as in workspace.json, with defaults filled in. */
export interface RssSyncWorkspace {
  id: string; game_name: string; game_path: string; gda_path: string; common_gda_path: string | null;
  extensions: string[]; resource_paths: string[]; ignore_dds_mips: boolean;
}
/** A run's report file. Its summary starts with the run's state and times; a failed run's file holds only those and the
 * workspace settings, which are the report's only copy of the settings the run used. Reports from earlier versions keep
 * the times at the top level instead. */
export interface RssSyncReport {
  version: number; workspace: RssSyncWorkspace; run: RssSyncRun;
  startedAt?: string; finishedAt?: string;
  descriptors?: { name: string; path: string; type: string; declarations: number; resources: number }[];
  summary?: RssSyncSummary & Partial<RssSyncRun>;
  differences?: RssResource[]; identical?: RssResource[];
}
export interface Session { token: string; version: string; autoShutdownOnClose: boolean; platform: string }
export interface SyncResult { copied: string[]; failures: { name: string; message: string }[]; bytes: number; library: LibraryResponse }
