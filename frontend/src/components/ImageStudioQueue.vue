<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { baseName, reportPreviewURL, time } from '../format';
import { generatedURL, type ImageJob, type ImageJobs, type StudioCatalog } from '../imageStudio';

const props = defineProps<{ jobs: ImageJobs; catalog: StudioCatalog | null; working: boolean }>();
const emit = defineEmits<{
  retry: [id: string, force?: boolean]; cancel: [id: string]; cancelAll: []; view: [file: string]; compose: [];
}>();
const recentJobs = computed(() => [...props.jobs.jobs].reverse());
const cancellable = computed(() => props.jobs.jobs.some(job => ['queued', 'running'].includes(job.state)));
const files = computed(() => new Map(props.catalog?.files.map(file => [file.file, file]) ?? []));
const failedPreviews = ref<Record<string, string>>({});
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;
onMounted(() => { ticker = setInterval(() => { now.value = Date.now(); }, 1000); });
onBeforeUnmount(() => clearInterval(ticker));

function thumbnail(job: ImageJob) {
  if (job.kind !== 'image') return '';
  const file = job.target ?? job.source;
  const revision = job.finishedAt ?? job.createdAt;
  const url = files.value.get(file)?.generated ? generatedURL(file, revision) : reportPreviewURL(job.source, revision);
  return failedPreviews.value[job.id] === url ? '' : url;
}
function previewError(job: ImageJob) { failedPreviews.value[job.id] = thumbnail(job); }
function duration(job: ImageJob) {
  if (!job.startedAt || job.state === 'skipped') return '—';
  const seconds = Math.max(0, Math.floor(((job.finishedAt ? Date.parse(job.finishedAt) : now.value) - Date.parse(job.startedAt)) / 1000));
  if (!Number.isFinite(seconds)) return '—';
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return hours ? `${hours}h ${minutes}m ${seconds % 60}s` : minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
</script>

<template>
  <section class="studio-queue" aria-label="Generation jobs">
    <div class="studio-queue-panel">
      <header class="studio-queue-heading">
        <div>
          <h5>Generation queue</h5>
          <p>One job runs at a time. Jobs keep running when you leave Image studio.</p>
        </div>
        <div class="studio-queue-actions">
          <span class="studio-job-count">{{ jobs.jobs.length }} {{ jobs.jobs.length === 1 ? 'job' : 'jobs' }}<small v-if="jobs.queued"> · {{ jobs.queued }} queued</small></span>
          <button type="button" class="btn btn-outline-danger btn-sm" :disabled="working || !cancellable" @click="emit('cancelAll')">Cancel All</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="working" @click="emit('compose')"><i class="mdi mdi-plus" aria-hidden="true" /> Generate images</button>
        </div>
      </header>
      <p v-if="!recentJobs.length" class="studio-queue-empty">Analyze an image or generate one from saved metadata to start a job.</p>
      <div class="studio-queue-list">
        <div v-for="job in recentJobs" :key="job.id" class="studio-job">
          <div class="studio-job-preview" aria-hidden="true">
            <img v-if="thumbnail(job)" :src="thumbnail(job)" alt="" loading="lazy" decoding="async" @error="previewError(job)">
            <i v-else :class="['mdi', job.kind === 'metadata' ? 'mdi-file-document-outline' : 'mdi-image-outline']" />
          </div>
          <span :class="['badge studio-job-status', job.state === 'failed' ? 'badge-danger' : job.state === 'succeeded' ? 'badge-success' : job.state === 'skipped' ? 'badge-warning' : 'badge-light']">{{ job.state }}</span>
          <div class="studio-job-details">
            <strong class="studio-job-name" :title="job.source">{{ job.label ?? baseName(job.source) }}</strong>
            <p class="studio-job-model" :title="job.model || 'Model not configured'">{{ job.kind === 'metadata' ? 'Analyze' : 'Generate' }} <span aria-hidden="true">·</span> {{ job.model || 'Model not configured' }}</p>
          </div>
          <time class="studio-job-date" :datetime="job.createdAt" :title="new Date(job.createdAt).toLocaleString()">{{ time(job.createdAt) }}</time>
          <div class="studio-job-execution">
            <div v-if="job.state === 'running' || job.state === 'cancelling'" class="studio-job-progress" role="progressbar" :aria-label="job.state === 'cancelling' ? 'Cancelling job' : 'Job in progress'"><span /></div>
            <span class="studio-job-duration" :aria-label="`Elapsed time: ${duration(job)}`">{{ duration(job) }}</span>
          </div>
          <button v-if="job.state === 'skipped' && job.kind === 'image'" type="button" class="btn btn-outline-primary btn-sm" :disabled="working" title="Regenerate and replace the existing output after success" @click="emit('retry', job.id, true)">Generate</button>
          <button v-if="['failed', 'cancelled'].includes(job.state)" type="button" class="btn btn-outline-primary btn-sm" :disabled="working" @click="emit('retry', job.id)">Retry</button>
          <button v-if="['queued', 'running'].includes(job.state)" type="button" class="btn btn-outline-danger btn-sm" :disabled="working" @click="emit('cancel', job.id)">Cancel</button>
          <button v-if="job.state === 'succeeded'" type="button" class="btn btn-outline-primary btn-sm" @click="emit('view', job.target ?? job.source)">View</button>
          <p v-if="job.error" class="studio-job-note text-danger">{{ job.error }}</p>
          <p v-else-if="job.message" class="studio-job-note">{{ job.message }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.studio-queue { container-type: inline-size; }
.studio-queue-panel { border: 1px solid #e2e7f2; border-radius: 12px; overflow: hidden; background: #fff; }
.studio-queue-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; padding: 22px; background: #f8faff; border-bottom: 1px solid #e2e7f2; }
.studio-queue-heading h5 { font-size: 20px; font-weight: 600; color: #17184b; margin: 0 0 7px; }
.studio-queue-heading p { margin: 0; color: #687596; font-size: 13px; line-height: 1.5; }
.studio-queue-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.studio-job-count { font-size: 13px; color: #34365d; white-space: nowrap; }
.studio-job-count small { font-size: inherit; color: #77809a; }
.studio-queue-actions .btn { height: 36px; padding: 0 14px; }
.studio-queue-actions .mdi { margin-right: 5px; }
.studio-queue-empty { padding: 32px 22px; margin: 0; font-size: 13px; color: #77809a; }
.studio-queue-list { padding: 0 22px; }
.studio-job { display: grid; grid-template-columns: 68px 76px minmax(0, 1fr) 138px 86px 96px; align-items: center; gap: 12px 18px; padding: 18px 0; border-bottom: 1px solid #e5e9f2; }
.studio-job:last-child { border-bottom: 0; }
.studio-job-preview { width: 68px; height: 68px; border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #f0f3ff; color: #929ff2; }
.studio-job-preview img { width: 100%; height: 100%; object-fit: contain; padding: 5px; background: repeating-conic-gradient(#f0f1f5 0% 25%, white 0% 50%) 50% / 12px 12px; }
.studio-job-preview .mdi { font-size: 36px; }
.studio-job-status { justify-self: start; padding: 4px 6px; border-radius: 4px; }
.studio-job-status.badge-warning { background: #fff3cd; color: #856404; }
.studio-job-status.badge-light { background: #eef0f5; color: #586078; }
.studio-job-details { min-width: 0; }
.studio-job-name { display: block; color: #222344; font-size: 14px; overflow-wrap: anywhere; }
.studio-job-model { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #687596; margin: 7px 0 0; }
.studio-job-model span { padding: 0 4px; }
.studio-job-date, .studio-job-duration { font-size: 12px; color: #687596; font-variant-numeric: tabular-nums; }
.studio-job-date { white-space: nowrap; }
.studio-job-execution { min-width: 0; }
.studio-job > .btn { grid-column: 6; width: 96px; height: 32px; padding: 0 12px; }
.studio-job-note { grid-column: 2 / -1; margin: 0; font-size: 12px; color: #77809a; line-height: 1.6; overflow-wrap: anywhere; }
.studio-job-progress { height: 7px; overflow: hidden; border-radius: 8px; background: #eaf0ff; margin-bottom: 10px; }
.studio-job-progress span { display: block; width: 40%; height: 100%; border-radius: inherit; background: #4b49ac; animation: studio-job-progress 1.4s ease-in-out infinite alternate; }
@keyframes studio-job-progress { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
@media (prefers-reduced-motion: reduce) { .studio-job-progress span { animation: none; margin: auto; } }
@container (max-width: 850px) {
  .studio-job { grid-template-columns: 56px 76px minmax(0, 1fr) 96px; gap: 7px 14px; }
  .studio-job-preview { width: 56px; height: 56px; grid-column: 1; grid-row: 1 / 4; }
  .studio-job-status { grid-column: 2; grid-row: 1; }
  .studio-job-details { grid-column: 3; grid-row: 1; }
  .studio-job-date { grid-column: 3; grid-row: 2; }
  .studio-job-execution { grid-column: 3; grid-row: 3; }
  .studio-job > .btn { grid-column: 4; grid-row: 1 / 4; }
}
@container (max-width: 560px) {
  .studio-queue-heading { padding: 18px 14px; gap: 16px; }
  .studio-queue-list { padding: 0 14px; }
  .studio-queue-actions { gap: 10px; }
  .studio-job { grid-template-columns: 48px minmax(0, 1fr) 88px; gap: 8px 10px; }
  .studio-job-preview { width: 48px; height: 48px; grid-row: 1 / 3; }
  .studio-job-status { grid-column: 2; grid-row: 1; }
  .studio-job-details { grid-column: 2 / -1; grid-row: 2; }
  .studio-job-date { grid-column: 2 / -1; grid-row: 3; }
  .studio-job-execution { grid-column: 2 / -1; grid-row: 4; }
  .studio-job > .btn { grid-column: 3; grid-row: 1; width: 88px; }
}
</style>
