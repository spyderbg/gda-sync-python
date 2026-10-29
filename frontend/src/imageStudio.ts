import { api } from './workspace';

export interface ImageMetadata {
  schema_version: number;
  image: { filename: string; width: number; height: number; transparency: boolean; sha256?: string; mime_type?: string; size_bytes?: number };
  generation: { width: number; height: number; prompt?: string };
  analysis: { description: string; scene: string; objects: string[]; tags: string[]; text: string };
  model: string; created_at: string;
  sequence?: { id: string | null; frameTime: number; loopCount: number; loopTo: number | null; paths: string[];
    frames: { path: string; source?: { x: number; y: number; w: number; h: number } }[]; sampledFrames?: number[] };
}
export interface MetadataDocument {
  file: string; path: string; exists: boolean; revision: string; metadata: ImageMetadata; generated: string | null; sourceError?: string | null; kind?: 'image' | 'sequence';
}
export interface StudioFile {
  file: string; name: string; path: string; folder: string;
  category: 'available' | 'missing' | 'invalid' | 'supplementary' | 'draft';
  exists: boolean; metadata: boolean; generated: boolean; kind: 'image' | 'sequence'; frameCount?: number;
}
export interface StudioCatalog { workspace: string; game: string; files: StudioFile[] }
export interface ImageJob {
  id: string; source: string; target?: string; label?: string; kind: 'metadata' | 'image';
  state: 'queued' | 'running' | 'cancelling' | 'succeeded' | 'skipped' | 'failed' | 'cancelled';
  createdAt: string; finishedAt?: string; error?: string; message?: string;
}
export interface ImageJobs { jobs: ImageJob[]; queued: number; running: boolean; submitted?: string[] }
export interface RemoteAnalysisSettings {
  enabled: boolean; base_url: string; model: string; timeout: number; max_tokens: number;
  load_model: boolean; unload_others: boolean; api_key_env: string;
}
export interface ComfySettings {
  enabled: boolean; base_url: string; timeout: number; api_key_env: string; workflow: string;
  prompt_node: string; size_node: string; sampler_node: string; output_node: string;
  steps: number; seed: number; cfg_scale: number; keep_original: boolean;
}
export interface ModelSettings {
  overwrite: boolean; recursive: boolean;
  remote: { analysis: RemoteAnalysisSettings; generation: ComfySettings };
  analysis: { base_url: string; model: string; timeout: number; max_tokens: number; load_model: boolean; unload_others: boolean };
  generation: { diffusion_model: string; text_encoder: string; vae: string; sd_cli: string; timeout: number;
    width: number; height: number; steps: number; seed: number; cfg_scale: number; unload_lm_studio: boolean; keep_original: boolean };
}
export interface ImageSettings { path: string; settings: ModelSettings }
export const studioAPI = <T>(path: string, body?: unknown) => api<T>(`image-studio/${path}`, body === undefined ? 'GET' : 'POST', body);
export const generatedURL = (file: string, revision: string) => `/api/image-studio/generated?${new URLSearchParams({ file, revision })}`;
