export type AssetType = 'texture' | 'model' | 'material' | 'audio' | 'font' | 'other';
export type AssetStatus = 'new' | 'modified' | 'synced';
export type FolderKey = 'source' | 'destination';
export type View ='dashboard' | 'library' | 'pending' | 'rssSync' | 'history' | 'settings';

/** A file of the game folder, which the asset library lists. */
export interface Asset {
  id: string; name: string; path: string; folder: string; extension: string;
  type: AssetType; size: number; modifiedAt: string;
  dimensions?: { width: number; height: number; format: string; mipmaps?: number };
  preview: boolean; previewError?: string;
}
/** A file of the GDA folder with its status against the game file at the same relative path, as the dashboard counts it. */
export interface ComparedAsset extends Asset { status: AssetStatus }
/** `source` is the GDA folder files are copied from, `destination` the game folder they are copied to. */
export interface WorkspaceEntry { id: string; name: string; source: string; destination: string; demo?: boolean }
export interface WorkspaceConfig { name: string; source: string; destination: string; demo: boolean; port?: number; defaultWorkspace?: string; workspaces?: WorkspaceEntry[] }
export interface Activity {
  /** cleanup removes the declarations of invalid resources, or deletes supplementary ones; report generates an asset report. */
  id: string; date: string; action: 'sync' | 'scan' | 'settings' | 'cleanup' | 'report';
  message: string; files: string[]; bytes?: number;
}
export interface LibraryResponse {
  config: WorkspaceConfig; activity: Activity[]; scannedAt: string; backupPath: string; rssSync: RssSyncStatus;
  /** The newest asset report of the active workspace, which the asset library shows. */
  assetReport: AssetReportStatus;
  /** The active workspace's folders that do not exist on disk. */
  missingFolders: FolderKey[];
}

/** The asset report: the game's assets, without a comparison with the GDA. A declared file is "available" when it
 * exists, "missing" when it does not and "invalid" when its path leads outside the resources folder; a file of the game
 * that nothing declares is "supplementary". An image sequence takes the status of its frames, like in the GDA sync. */
export type AssetCategory = 'available' | 'missing' | 'invalid' | 'supplementary';
/** A descriptor entry that loads a file: where it is, the entry's type (Image, ImageSequence, AudioEvent…) and id, and a
 * Font entry's declared characters and size in pixels. In the asset report, a Font entry of a font file also has how
 * many of its characters the font has. GDA sync reports from earlier versions have only the descriptor and line. */
export interface AssetDeclaration { descriptor: string; line: number; type?: string; id?: string; chars?: string; size?: number; coverage?: FontCoverage }
/** Of the characters a Font entry declares, without the ones that are never drawn: how many the font has, and the
 * code points of the first ones it misses. */
export interface FontCoverage { declared: number; covered: number; missing: number[]; missingCount: number }
/** A sample text of a writing system that a font can draw, with the two characters a card shows large. */
export interface FontSample { script: string; pair: string; text: string }
/** A TrueType or OpenType font's format, names, version, glyph count and the samples it can draw. Reports from before
 * version 2 have no samples. */
export interface FontFacts {
  format: string; family?: string; style?: string; fullName?: string; version?: string; glyphs?: number; samples?: FontSample[];
}
/** What the report knows of a file that exists; a font file also has its font facts, or why they cannot be read. */
export interface FileFacts {
  size?: number; modifiedAt?: string; dimensions?: { width: number; height: number; format: string; mipmaps?: number };
  preview?: boolean; previewError?: string; font?: FontFacts; fontError?: string;
}
export interface AssetFrame extends FileFacts { category: AssetCategory; status: string; resource: string; resourcePath: string; source?: RssRectangle }
export interface AssetSequence {
  id: string | null; guessed?: boolean; frameTime: number; loopCount: number; loopTo: number | null; paths: string[]; frames: AssetFrame[];
}
/** One asset; a sequence's facts are the total size of its files and those of its first and newest frames. */
export interface ReportAsset extends FileFacts {
  id: string; category: AssetCategory; status: string; resource: string; resourcePath: string; type: AssetType;
  scope: 'game' | 'common' | 'outside'; requiredBy: AssetDeclaration[]; sequence?: AssetSequence;
}
export interface AssetReportSummary extends RssSyncRun, Record<AssetCategory, number> {
  assets: number; size: number; types: Partial<Record<AssetType, number>>;
}
export interface AssetReportStatus { reportPath: string | null; version?: number | null; summary: AssetReportSummary | null }
export interface AssetReport {
  version: number; workspace: RssSyncWorkspace; summary: AssetReportSummary; assets: ReportAsset[];
  descriptors: { name: string; path: string; type: string; declarations: number; resources: number }[];
}

/** Dashboard files keep their owning workspace so matching paths in different games remain distinct. */
export interface DashboardAsset extends ComparedAsset { workspaceId: string; workspaceName: string }
export interface DashboardResponse {
  assets: DashboardAsset[]; workspaces: (WorkspaceEntry & { missingFolders: FolderKey[]; error?: string })[];
  activity: Activity[]; scannedAt: string; warnings: string[];
}

/** The GDA sync: a workspace's game resources compared with its GDA folder, in a background process. A file in the
 * game folder that no descriptor declares is "supplementary" and not compared; reports from earlier versions do not
 * count them. */
export type RssCategory = 'identical' | 'missing' | 'different' | 'invalid' | 'supplementary';
export interface RssSyncSummary { compared: number; identical: number; identicalMipOnly: number; missing: number; different: number; invalid: number; supplementary?: number }
/** The counts that every successful run's summary has. */
export type RssSyncCount = Exclude<keyof RssSyncSummary, 'supplementary'>;
export interface RssSyncRun { state: 'succeeded' | 'failed'; startedAt: string; finishedAt: string; error?: string }
/** One finished run in a workspace's history, read from its report file; only a successful run has counts. */
export interface RssSyncHistoryEntry extends RssSyncRun { summary?: RssSyncSummary; workspace?: RssSyncWorkspace; descriptors?: number; file: string }
export interface RssSyncHistory { workspaceId: string; workspace: RssSyncWorkspace; history: RssSyncHistoryEntry[] }
export interface RssSyncStatus {
  workspaceId: string; reportPath: string | null; running: boolean; startedAt: string | null;
  progress: { phase: 'descriptors' | 'index' | 'compare'; done: number; total: number } | null;
  lastRun: RssSyncRun | null; comparedAt: string | null; summary: RssSyncSummary | null;
}
export interface RssGdaFile { tree: 'game' | 'common'; path: string; absolutePath: string }
export interface RssResource {
  id: string; category: RssCategory; status: string; resource: string; resourcePath: string; scope: 'game' | 'common' | 'outside';
  gdaFiles: RssGdaFile[];
  requiredBy: AssetDeclaration[]; mipOnly?: boolean;
  /** An image sequence is one resource: resource is its first frame path, often a {N-M} range, and its status is
   * that of its frames. Its gdaFiles are the GDA file of each frame that has one. */
  sequence?: RssSequence;
}
export interface RssRectangle { x: number; y: number; w: number; h: number }
/** One frame of an image sequence: one file of its range. A frame whose file is not compared is "skipped". */
export interface RssFrame {
  category: RssCategory | 'skipped'; status: string; resource: string; resourcePath: string; gdaFiles: RssGdaFile[];
  mipOnly?: boolean; source?: RssRectangle;
}
/** A file the GDA sync report names, as POST /api/rss-sync/details describes it: only an error when it does not exist.
 * A font also has its coverage of each character list the request named. */
export interface RssFileDetails {
  size?: number; modifiedAt?: string; dimensions?: { width: number; height: number; format: string; mipmaps?: number };
  dimensionsError?: string; error?: string; font?: FontFacts; fontError?: string; coverage?: FontCoverage[];
}
/** A frame as SequencePreview plays it: the absolute path of its image, null when it has none, and the part it shows. */
export interface PreviewFrame { file: string | null; source?: RssRectangle }
/** loopCount 0 repeats forever; each loop after the first starts at frame loopTo. A guessed sequence is numbered
 * supplementary images that no descriptor declares, so it has no id and plays with guessed settings. */
export interface RssSequence {
  id: string | null; guessed?: boolean; frameTime: number; loopCount: number; loopTo: number | null; paths: string[]; frames: RssFrame[];
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
/** resources counts the report rows a GDA sync copy synced: a sequence is one, however many of its files were copied.
 * Applying report rows also counts the invalid rows whose declarations were removed and the supplementary rows deleted. */
export interface SyncResult {
  copied: string[]; resources?: number; removed?: number; deleted?: number;
  failures: { name: string; message: string }[]; bytes: number; library: LibraryResponse;
}
