<script setup lang="ts">
import ServerCard from '@/components/dashboard/ServerCard.vue'
import type { GlassServer } from '@/types/glassmorphism'
import type { ProbeTarget } from '@/types/cfsm'
import type { NodeCardSize } from '@/theme/settings'

defineProps<{
  servers: GlassServer[]
  visibleKeys: ReadonlySet<string>
  favoriteKeys: ReadonlySet<string>
  showSource: boolean
  density: NodeCardSize
  priceVisible: boolean
  infoFields: string
  probeDisplayMode: 'single' | 'multiple'
  probeSelectionMode: 'auto' | 'manual'
  probeDefaultFamily: 'auto' | 'ipv4' | 'ipv6'
  hideProbeGroupNames: boolean
  probeTargets: string
  probeWindowHours: 1 | 2
  probeNow: number
}>()
const emit = defineEmits<{
  open: [server: GlassServer]
  probe: [server: GlassServer, metric: 'latency' | 'loss', target: ProbeTarget]
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
      v-memo="[visibleKeys.has(server.key) ? server : server.key, showSource, density, infoFields, probeDisplayMode, probeSelectionMode, probeDefaultFamily, hideProbeGroupNames, probeTargets, probeWindowHours, visibleKeys.has(server.key) ? probeNow : 0, favoriteKeys.has(server.key), priceVisible, visibleKeys.has(server.key)]"
      :server="server"
      :show-source="showSource"
      :density="density"
      :probe-display-mode="probeDisplayMode"
      :probe-selection-mode="probeSelectionMode"
      :probe-default-family="probeDefaultFamily"
      :hide-probe-group-names="hideProbeGroupNames"
      :probe-targets="probeTargets"
      :probe-window-hours="probeWindowHours"
      :probe-now="probeNow"
      :favorite="favoriteKeys.has(server.key)"
      :price-visible="priceVisible"
      :info-fields="infoFields"
      @open="emit('open', server)"
      @probe="(metric, target) => emit('probe', server, metric, target)"
      @toggle-favorite="emit('toggleFavorite', server.key)"
    />
  </div>
</template>
