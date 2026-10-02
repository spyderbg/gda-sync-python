export type AssetType = 'texture' | 'model' | 'material' | 'audio' | 'other';
export type AssetStatus = 'new' | 'modified' | 'synced';
export type View = 'library' | 'pending' | 'synced' | 'activity' | 'settings';

export interface Asset {
  id: string; name: string; path: string; folder: string; extension: string;
  type: AssetType; status: AssetStatus; size: number; modifiedAt: string;
  dimensions?: { width: number; height: number; format: string; mipmaps?: number };
  preview: boolean; previewError?: string;
}
export interface WorkspaceConfig { name: string; source: string; destination: string; demo: boolean }
export interface Activity {
  id: string; date: string; action: 'sync' | 'scan' | 'settings';
  message: string; files: string[]; bytes?: number;
}
export interface LibraryResponse {
  assets: Asset[]; config: WorkspaceConfig; activity: Activity[];
  scannedAt: string; warnings: string[]; backupPath: string;
}
export interface Session { token: string; version: string; autoShutdownOnClose: boolean; platform: string }
export interface SyncResult { copied: string[]; failures: { name: string; message: string }[]; bytes: number; library: LibraryResponse }
