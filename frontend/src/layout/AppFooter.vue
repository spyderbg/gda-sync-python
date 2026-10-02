<script setup lang="ts">
import { size } from '../format';
import { config, session, totalSize } from '../workspace';
</script>

<template>
  <footer class="footer">
    <div class="container-fluid clearfix">
      <span class="text-muted d-block text-center text-sm-left d-sm-inline-block">GDA Sync v{{ session.version }} · Your files stay on this computer.</span>
      <span class="float-none float-sm-right d-block mt-1 mt-sm-0 text-center">{{ config.demo ? 'Demo workspace' : 'Connected workspace' }} · {{ size(totalSize) }} total</span>
    </div>
  </footer>
</template>
