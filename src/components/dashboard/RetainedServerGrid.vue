<script setup lang="ts">
import ServerCard from '@/components/dashboard/ServerCard.vue'
import type { GlassServer } from '@/types/glassmorphism'
import type { NodeCardSize } from '@/theme/settings'

defineProps<{
  servers: GlassServer[]
  visibleKeys: ReadonlySet<string>
  favoriteKeys: ReadonlySet<string>
  showSource: boolean
  density: NodeCardSize
  priceVisible: boolean
  probeDisplayMode: 'single' | 'multiple'
  probeTargets: string
  probeWindowHours: 1 | 2
  probeNow: number
}>()
const emit = defineEmits<{
  open: [server: GlassServer]
  probe: [server: GlassServer, metric: 'latency' | 'loss']
  toggleFavorite: [key: string]
}>()
</script>

<template>
  <!-- TransitionGroup clones its children, so its original v-for memo cache
       never receives the mounted el. Dense dashboards already disable motion;
       a native grid lets memo retain hidden cards and unchanged probe trees. -->
  <div :class="['server-grid', `server-grid--size-${density}`]">
    <ServerCard
      v-for="server in servers"
      v-show="visibleKeys.has(server.key)"
      :key="server.key"
      v-memo="[visibleKeys.has(server.key) ? server : server.key, showSource, density, probeDisplayMode, probeTargets, probeWindowHours, visibleKeys.has(server.key) ? probeNow : 0, favoriteKeys.has(server.key), priceVisible, visibleKeys.has(server.key)]"
      :server="server"
      :show-source="showSource"
      :density="density"
      :probe-display-mode="probeDisplayMode"
      :probe-targets="probeTargets"
      :probe-window-hours="probeWindowHours"
      :probe-now="probeNow"
      :favorite="favoriteKeys.has(server.key)"
      :price-visible="priceVisible"
      @open="emit('open', server)"
      @probe="emit('probe', server, $event)"
      @toggle-favorite="emit('toggleFavorite', server.key)"
    />
  </div>
</template>
