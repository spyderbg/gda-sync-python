<script setup lang="ts">
import { reportState } from '../workspace';

// A sync view without a result explains why there is no report to show.
const MESSAGES = {
  unknown: { icon: 'mdi-help-circle-outline', title: 'The GDA sync status could not be read', text: 'Reload the page. If this keeps happening, check that the application is still running.' },
  creating: { icon: 'mdi-loading mdi-spin', title: 'Creating the first GDA sync report…', text: 'The comparison runs in the background. The report appears here when it ends.' },
  none: { icon: 'mdi-file-search-outline', title: 'No GDA sync report yet', text: 'This workspace has not been compared with its GDA folder. Click Rescan to run the first GDA sync and create its report.' },
  failed: { icon: 'mdi-file-alert-outline', title: 'No successful GDA sync yet', text: 'Every run of this workspace so far has failed, so there is no result to show. See the error on this page, then click Rescan.' },
} as const;
</script>

<template>
  <div v-if="reportState !== 'ready'" class="card report-notice grid-margin" role="status">
    <div class="card-body">
      <i aria-hidden="true" :class="['mdi', 'report-notice-icon', MESSAGES[reportState].icon, 'text-muted']" />
      <h4>{{ MESSAGES[reportState].title }}</h4>
      <p class="text-muted">{{ MESSAGES[reportState].text }}</p>
    </div>
  </div>
</template>

<style scoped>
.report-notice .card-body { padding: 40px 24px; text-align: center; }
.report-notice-icon { display: block; margin-bottom: 10px; font-size: 40px; line-height: 1; }
.report-notice h4 { margin-bottom: 6px; }
.report-notice p { max-width: 560px; margin: 0 auto; }
</style>
