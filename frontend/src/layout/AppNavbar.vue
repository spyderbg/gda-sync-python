<script setup lang="ts">
import { computed } from 'vue';
import BaseDropdown from '../components/BaseDropdown.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { ago, plural, typeIcons } from '../format';
import { config, copy, data, inspect, navigate, openFolder, pending, session, ui } from '../workspace';

const recentPending = computed(() => [...pending.value].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)).slice(0, 4));
const recentActivity = computed(() => (data.value?.activity || []).slice(0, 4));
const initials = computed(() => config.value.name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase());
const activityIcons = { sync: 'mdi-sync', scan: 'mdi-magnify', settings: 'mdi-cog-outline' };
</script>

<template>
  <nav class="navbar default-layout col-lg-12 col-12 p-0 fixed-top d-flex flex-row">
    <div class="text-center navbar-brand-wrapper d-flex align-items-top justify-content-center">
      <a class="navbar-brand brand-logo" href="#" @click.prevent="navigate('dashboard')">
        <img class="brand-mark" src="/app-icon.png" alt=""><span class="brand-text">EGT GDA Sync</span>
      </a>
      <a class="navbar-brand brand-logo-mini" href="#" aria-label="EGT GDA Sync dashboard" @click.prevent="navigate('dashboard')">
        <img class="brand-mark" src="/app-icon.png" alt="">
      </a>
    </div>
    <div class="navbar-menu-wrapper d-flex align-items-center">
      <ul class="navbar-nav">
        <li class="nav-item font-weight-semibold d-none d-lg-block">{{ session.platform }} · local workspace</li>
        <BaseDropdown tag="li" class="nav-item language-dropdown" menu-class="dropdown-menu-left navbar-dropdown py-2">
          <template #toggle="{ open, toggle }">
            <a class="nav-link dropdown-toggle px-2 d-flex align-items-center" href="#" role="button" aria-haspopup="true" :aria-expanded="open" aria-label="Workspace folders" @click.prevent="toggle">
              <div class="d-inline-flex mr-0 mr-md-3"><div class="flag-icon-holder workspace-holder"><i aria-hidden="true" class="mdi mdi-folder-sync-outline" /></div></div>
              <span class="profile-text font-weight-medium d-none d-md-block">{{ config.name }}</span>
            </a>
          </template>
          <a class="dropdown-item" href="#" @click.prevent="openFolder('source')"><i aria-hidden="true" class="mdi mdi-folder-open-outline text-primary" />Open source folder</a>
          <a class="dropdown-item" href="#" @click.prevent="openFolder('destination')"><i aria-hidden="true" class="mdi mdi-folder-open text-success" />Open GDA folder</a>
          <a class="dropdown-item" href="#" @click.prevent="copy(config.source)"><i aria-hidden="true" class="mdi mdi-content-copy text-muted" />Copy source path</a>
          <a class="dropdown-item" href="#" @click.prevent="copy(config.destination)"><i aria-hidden="true" class="mdi mdi-content-copy text-muted" />Copy GDA path</a>
          <div class="dropdown-divider" />
          <a class="dropdown-item" href="#" @click.prevent="navigate('settings')"><i aria-hidden="true" class="mdi mdi-cog-outline text-muted" />Workspace settings</a>
        </BaseDropdown>
      </ul>

      <ul class="navbar-nav ml-auto">
        <BaseDropdown tag="li" class="nav-item" menu-class="dropdown-menu-right navbar-dropdown preview-list pb-0">
          <template #toggle="{ open, toggle }">
            <a class="nav-link count-indicator" href="#" role="button" aria-haspopup="true" :aria-expanded="open" :aria-label="`${pending.length} assets need sync`" @click.prevent="toggle">
              <i aria-hidden="true" class="mdi mdi-bell-outline" /><span v-if="pending.length" class="count">{{ pending.length }}</span>
            </a>
          </template>
          <a class="dropdown-item py-3" href="#" @click.prevent="navigate('pending')">
            <p class="mb-0 font-weight-medium float-left">{{ pending.length ? `${pending.length} asset${plural(pending.length)} need sync` : 'Everything is in sync' }}</p>
            <span class="badge badge-pill badge-primary float-right">View all</span>
          </a>
          <div class="dropdown-divider" />
          <a v-for="asset in recentPending" :key="asset.id" class="dropdown-item preview-item" href="#" @click.prevent="inspect(asset)">
            <div class="preview-thumbnail"><span class="preview-icon bg-light rounded-circle"><i aria-hidden="true" :class="['mdi', typeIcons[asset.type], 'text-primary']" /></span></div>
            <div class="preview-item-content flex-grow py-2">
              <p class="preview-subject ellipsis font-weight-medium text-dark">{{ asset.name }}</p>
              <p class="font-weight-light small-text mb-0"><StatusBadge :status="asset.status" /> {{ ago(asset.modifiedAt) }}</p>
            </div>
          </a>
        </BaseDropdown>
        <BaseDropdown tag="li" class="nav-item" menu-class="dropdown-menu-right navbar-dropdown preview-list pb-0">
          <template #toggle="{ open, toggle }">
            <a class="nav-link count-indicator" href="#" role="button" aria-haspopup="true" :aria-expanded="open" aria-label="Recent activity" @click.prevent="toggle">
              <i aria-hidden="true" class="mdi mdi-history" /><span v-if="recentActivity.length" class="count bg-success">{{ data!.activity.length }}</span>
            </a>
          </template>
          <a class="dropdown-item py-3 border-bottom" href="#" @click.prevent="navigate('activity')">
            <p class="mb-0 font-weight-medium float-left">{{ recentActivity.length ? 'Recent activity' : 'No activity yet' }}</p>
            <span class="badge badge-pill badge-primary float-right">View all</span>
          </a>
          <a v-for="entry in recentActivity" :key="entry.id" class="dropdown-item preview-item py-3" href="#" @click.prevent="navigate('activity')">
            <div class="preview-thumbnail"><i aria-hidden="true" :class="['mdi', activityIcons[entry.action], 'm-auto text-primary']" /></div>
            <div class="preview-item-content">
              <h6 class="preview-subject font-weight-normal text-dark mb-1">{{ entry.message }}</h6>
              <p class="font-weight-light small-text mb-0">{{ ago(entry.date) }}</p>
            </div>
          </a>
        </BaseDropdown>
        <li class="nav-item">
          <a class="nav-link" href="#" role="button" aria-label="Help and keyboard shortcuts" @click.prevent="ui.help = true"><i aria-hidden="true" class="mdi mdi-help-circle-outline" /></a>
        </li>
        <BaseDropdown tag="li" class="nav-item d-none d-xl-inline-block user-dropdown" menu-class="dropdown-menu-right navbar-dropdown">
          <template #toggle="{ open, toggle }">
            <a class="nav-link dropdown-toggle" href="#" role="button" aria-haspopup="true" :aria-expanded="open" aria-label="Workspace menu" @click.prevent="toggle">
              <span class="img-xs rounded-circle text-avatar bg-primary text-white">{{ initials }}</span>
            </a>
          </template>
          <div class="dropdown-header text-center">
            <span class="img-md rounded-circle text-avatar bg-primary text-white mx-auto">{{ initials }}</span>
            <p class="mb-1 mt-3 font-weight-semibold">{{ config.name }}</p>
            <p class="font-weight-light text-muted mb-0">{{ config.demo ? 'Environment demo' : 'Asset workspace' }} · {{ session.platform }}</p>
          </div>
          <a class="dropdown-item" href="#" @click.prevent="navigate('settings')">Workspace settings<i aria-hidden="true" class="dropdown-item-icon mdi mdi-cog-outline" /></a>
          <a class="dropdown-item" href="#" @click.prevent="navigate('activity')">Sync activity<i aria-hidden="true" class="dropdown-item-icon mdi mdi-history" /></a>
          <a class="dropdown-item" href="#" @click.prevent="ui.help = true">Help &amp; shortcuts<i aria-hidden="true" class="dropdown-item-icon mdi mdi-help-circle-outline" /></a>
          <a class="dropdown-item" href="#" @click.prevent="ui.shutdownConfirm = true">Stop application<i aria-hidden="true" class="dropdown-item-icon mdi mdi-power" /></a>
        </BaseDropdown>
      </ul>
      <button class="navbar-toggler navbar-toggler-right d-lg-none align-self-center" type="button" aria-label="Toggle navigation" @click="ui.sidebarOpen = !ui.sidebarOpen">
        <span class="mdi mdi-menu" />
      </button>
    </div>
  </nav>
</template>
