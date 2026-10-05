<script setup lang="ts">
defineProps<{ kind: 'loading' | 'error' | 'closed'; message?: string }>();
const reload = () => window.location.reload();
</script>

<template>
  <div class="container-scroller">
    <div class="container-fluid page-body-wrapper full-page-wrapper">
      <div class="content-wrapper d-flex align-items-center text-center error-page startup-page">
        <div class="row flex-grow">
          <div class="col-lg-6 mx-auto text-white">
            <div class="startup-mark"><i aria-hidden="true" :class="['mdi', kind === 'loading' ? 'mdi-sync mdi-spin' : kind === 'error' ? 'mdi-lan-disconnect' : 'mdi-check-all']" /></div>
            <template v-if="kind === 'closed'">
              <h1>Workspace closed.</h1>
              <p>Your files, settings, and history are saved on your machine.<br>Launch EGT GDA Sync to pick up where you left off.</p>
            </template>
            <template v-else-if="kind === 'error'">
              <h1>Couldn’t connect to your workspace</h1>
              <p>{{ message }}</p>
              <button type="button" class="btn btn-light btn-lg" @click="reload"><i aria-hidden="true" class="mdi mdi-refresh" />Try again</button>
            </template>
            <template v-else>
              <h1>Opening your workspace</h1>
              <p>Getting your assets ready…</p>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
