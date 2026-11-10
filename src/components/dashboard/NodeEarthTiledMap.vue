<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useElementSize } from '@vueuse/core'
import AppTooltip from '@/components/ui/AppTooltip.vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import { countryName } from '@/utils/country-name'
import type { RegionCluster } from '@/composables/useServerGeoClusters'
import EARTH_DAY_TEXTURE from '@/assets/earth/earth-blue-marble.jpg'
import EARTH_BUMP_MAP from '@/assets/earth/earth-topology.png'
import EARTH_SPECULAR_MAP from '@/assets/earth/earth-water.png'
import { useServerGeoClusters } from '@/composables/useServerGeoClusters'
import { flagUrl, hideMissingFlag } from '@/utils/flags'
import type { GlassServer } from '@/types/glassmorphism'
import { locationTitle, serverCityText, serverMapLocation } from '@/domain/advanced-tools'
import { layoutMapFlags, type MapMarkerAnchor } from '@/utils/map-marker-layout'

/**
 * `stopped` 与 `isDark` 由统一的 Earth 调度器传入以保持三种渲染器接口一致。
 * tiled 地图本身不旋转（与 Komari 相同），明暗完全由 CSS 主题变量驱动，
 * 因此这两个值在本组件内没有运行时行为。
 */
const props = defineProps<{
  servers: readonly GlassServer[]
  retainedServers?: readonly GlassServer[]
  stopped?: boolean
  isDark?: boolean
  selectedCountry?: string | null
}>()

const emit = defineEmits<{
  selectCountry: [code: string]
  selectServer: [server: GlassServer]
}>()
const legendMode = ref<'cities' | 'countries'>('countries')
const hoveredClusterId = ref<string | null>(null)
const selectedClusterId = ref<string | null>(null)
const dialogOpen = ref(false)
const mapElement = ref<HTMLElement | null>(null)
const { width: mapWidth, height: mapHeight } = useElementSize(mapElement)

const MAP_WIDTH = 1440
const MAP_HEIGHT = 720
const MAP_PADDING = 18
const VISIBLE_NORTH_LAT = 74
const VISIBLE_SOUTH_LAT = -58
const TEXTURE_FULL_HEIGHT = MAP_HEIGHT * 180 / (VISIBLE_NORTH_LAT - VISIBLE_SOUTH_LAT)
const TEXTURE_SOURCE_Y = TEXTURE_FULL_HEIGHT * (90 - VISIBLE_NORTH_LAT) / 180

interface MapPoint {
  x: number
  y: number
}

interface ClusterMarker {
  cluster: RegionCluster
  id: string
  index: number
  code: string
  label: string
  meta: string
  x: number
  y: number
  flagX: number
  flagY: number
  visible: boolean
  tooltip: string
  statusClass: string
}

const {
  regionClusters,
} = useServerGeoClusters(() => props.servers)
const { regionClusters: mountedClusters } = useServerGeoClusters(() => props.retainedServers ?? props.servers)
const activeClusters = computed(() => new Map(regionClusters.value.map(cluster => [cluster.id, cluster])))

const selectedServers = computed(() => props.selectedCountry
  ? regionClusters.value.filter((cluster) => cluster.code === props.selectedCountry).flatMap((cluster) => cluster.members)
  : props.servers)
const totalServers = computed(() => selectedServers.value.length)
const onlineServers = computed(() => selectedServers.value.filter((server) => server.online).length)
const offlineServers = computed(() => totalServers.value - onlineServers.value)
const countryClusters = computed<RegionCluster[]>(() => {
  const countries = new Map<string, RegionCluster>()
  for (const cluster of regionClusters.value) {
    const country = countries.get(cluster.code)
    if (country) {
      country.servers += cluster.servers
      country.onlineServers += cluster.onlineServers
      country.members = [...country.members, ...cluster.members]
    } else {
      countries.set(cluster.code, { ...cluster, id: cluster.code, label: countryName(cluster.code), members: [...cluster.members] })
    }
  }
  return [...countries.values()].sort((a, b) => b.servers - a.servers || a.code.localeCompare(b.code))
})
const legendClusters = computed(() => legendMode.value === 'countries' ? countryClusters.value : regionClusters.value)
const selectedCluster = computed(() => regionClusters.value.find((cluster) => cluster.id === selectedClusterId.value))
watch(regionClusters, () => {
  if (selectedClusterId.value && !selectedCluster.value) dialogOpen.value = false
})
function clusterTitle(cluster: RegionCluster): string {
  const country = countryName(cluster.code)
  return cluster.city ? locationTitle(cluster.label, cluster.code) : country
}
function clusterLocationDescription(cluster: RegionCluster): string {
  const sources = new Set(cluster.members.map(server => serverMapLocation(server)?.source))
  const descriptions: string[] = []
  if (sources.has('cloudflare-ip')) descriptions.push('上报 IP 自动识别的属地参考，不代表物理位置')
  if (sources.has('legacy-ip')) descriptions.push('旧站 IP 属地参考，不代表实时或物理位置')
  if (sources.has('operator')) descriptions.push('运营者提供的位置')
  if (sources.has('country')) descriptions.push('国家/地区中心参考位置')
  for (const [source, name] of [['db-ip', 'DB-IP'], ['ipapi-is', 'IPapi.is']]) {
    if (cluster.members.some(server => server.location?.citySource === source)) descriptions.push(`城市名称由 ${name} 补充，坐标仍为 Cloudflare IP 属地参考`)
    if (cluster.members.some(server => server.location?.subdivisionSource === source)) descriptions.push(`地区名称由 ${name} 补充，不代表已精确到城市或机房；坐标仍为 Cloudflare IP 属地参考`)
  }
  return descriptions.join('；')
}
function clusterTooltip(cluster: RegionCluster): string {
  const names = cluster.members.map((server) => `${server.name}（${server.online ? '在线' : '离线'}，${serverCityText(server)}）`).join('\n')
  return `${clusterTitle(cluster)} · ${cluster.onlineServers}/${cluster.servers} 在线\n${names}\n${clusterLocationDescription(cluster)}`
}
function openCluster(cluster: RegionCluster): void {
  selectedClusterId.value = cluster.id
  dialogOpen.value = true
}
function openMember(server: GlassServer): void {
  dialogOpen.value = false
  const live = props.servers.find(node => node.key === server.key)
  if (live) emit('selectServer', live)
}

function onLegendWheel(event: WheelEvent): void {
  const list = event.currentTarget
  // Leave horizontal scrolling and browser pinch-to-zoom to the browser.
  if (!(list instanceof HTMLElement) || event.ctrlKey || event.metaKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? list.clientHeight : 1
  const delta = event.deltaY * unit
  const maximum = Math.max(0, list.scrollHeight - list.clientHeight)
  const available = delta > 0 ? maximum - list.scrollTop : list.scrollTop
  if (Math.abs(delta) <= available) return
  // A single gesture can reach the list boundary and continue down the page.
  // Forward only the unused distance so it never gets scrolled twice.
  event.preventDefault()
  const consumed = Math.sign(delta) * Math.max(0, available)
  list.scrollTop += consumed
  window.scrollBy({ top: delta - consumed, behavior: 'instant' })
}
const legendTooltips = computed(() => new Map(legendClusters.value.map(cluster => [cluster.id, clusterTooltip(cluster)])))
const legendDensityClass = computed(() => {
  const count = legendClusters.value.length
  if (count > 36) return 'legend-ultra-dense'
  if (count > 28) return 'legend-very-dense'
  if (count > 20) return 'legend-dense'
  return ''
})

const onlineRate = computed(() => {
  if (totalServers.value === 0) return 0
  return Math.round((onlineServers.value / totalServers.value) * 100)
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function projectCoord(coord: [number, number]): MapPoint {
  const [lat, lng] = coord
  const visibleLat = clamp(lat, VISIBLE_SOUTH_LAT, VISIBLE_NORTH_LAT)
  return {
    x: clamp(((lng + 180) / 360) * MAP_WIDTH, MAP_PADDING, MAP_WIDTH - MAP_PADDING),
    y: clamp(
      ((VISIBLE_NORTH_LAT - visibleLat) / (VISIBLE_NORTH_LAT - VISIBLE_SOUTH_LAT)) * MAP_HEIGHT,
      MAP_PADDING,
      MAP_HEIGHT - MAP_PADDING,
    ),
  }
}

const flagSize = computed(() => {
  const scale = Math.min(mapWidth.value / MAP_WIDTH, mapHeight.value / MAP_HEIGHT)
  return scale > 0 ? Math.max(26, 16 / scale) : 26
})
const markerAnchors = computed<MapMarkerAnchor[]>((previous) => {
  const next = mountedClusters.value.map(cluster => ({ id: cluster.id, ...projectCoord(cluster.coord) }))
  return previous && previous.length === next.length && next.every((anchor, index) => {
    const old = previous[index]
    return old?.id === anchor.id && old.x === anchor.x && old.y === anchor.y
  }) ? previous : next
})
const flagPositions = computed(() => layoutMapFlags(markerAnchors.value, MAP_WIDTH, MAP_HEIGHT, flagSize.value, flagSize.value * 0.25))
const clusterMarkers = computed<ClusterMarker[]>(() => {
  return mountedClusters.value.map((mountedCluster, index) => {
    const cluster = activeClusters.value.get(mountedCluster.id) ?? mountedCluster
    const point = projectCoord(cluster.coord)
    const flag = flagPositions.value.get(cluster.id) ?? point
    return {
      cluster,
      id: cluster.id,
      index: index + 1,
      code: cluster.code,
      label: cluster.label,
      // ASN 仅来自运营者明确填写的标签。
      meta: `${cluster.asn ? `${cluster.asn} · ` : ''}${countryName(cluster.code)}`,
      x: point.x,
      y: point.y,
      flagX: flag.x,
      flagY: flag.y,
      visible: activeClusters.value.has(cluster.id),
      tooltip: activeClusters.value.has(cluster.id) ? clusterTooltip(cluster) : '',
      statusClass: cluster.onlineServers > 0 ? 'is-online' : 'is-offline',
    }
  })
})

// SVG uses paint order, not z-index. Keep hit targets in place while painting
// hovered/focused flags last, including every city of a highlighted country.
const visualClusterMarkers = computed(() => {
  const activeId = hoveredClusterId.value
  if (!activeId) return clusterMarkers.value
  const active = (marker: ClusterMarker) => marker.id === activeId || marker.code === activeId
  return [
    ...clusterMarkers.value.filter((marker) => !active(marker)),
    ...clusterMarkers.value.filter(active),
  ]
})
</script>

<template>
  <div class="earth-map-scroll">
    <div class="earth-map-shell">
      <div ref="mapElement" class="earth-map">
        <svg
          class="map-svg map-svg--texture"
          :viewBox="`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <filter id="earth-relief" x="-4%" y="-4%" width="108%" height="108%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#ffffff" flood-opacity="0.14" />
              <feDropShadow dx="0" dy="-5" stdDeviation="9" flood-color="#082f49" flood-opacity="0.16" />
            </filter>
          </defs>

          <image
            :href="EARTH_DAY_TEXTURE" x="0" :y="-TEXTURE_SOURCE_Y" :width="MAP_WIDTH"
            :height="TEXTURE_FULL_HEIGHT" preserveAspectRatio="none" class="earth-image earth-image-base"
          />
          <image
            :href="EARTH_BUMP_MAP" x="0" :y="-TEXTURE_SOURCE_Y" :width="MAP_WIDTH"
            :height="TEXTURE_FULL_HEIGHT" preserveAspectRatio="none" class="earth-image earth-image-bump"
            filter="url(#earth-relief)"
          />
          <image
            :href="EARTH_SPECULAR_MAP" x="0" :y="-TEXTURE_SOURCE_Y" :width="MAP_WIDTH"
            :height="TEXTURE_FULL_HEIGHT" preserveAspectRatio="none" class="earth-image earth-image-water"
          />
          <rect :width="MAP_WIDTH" :height="MAP_HEIGHT" class="earth-overlay" />
        </svg>
        <svg
          class="map-svg map-svg--markers"
          :viewBox="`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`"
          preserveAspectRatio="xMidYMid meet"
          role="group" aria-label="真实地球贴图节点世界地图"
        >
          <g class="city-points">
            <g
              v-for="marker in visualClusterMarkers" v-show="marker.visible" :key="`${marker.id}-visual`"
              v-memo="[marker.visible, marker.x, marker.y, marker.flagX, marker.flagY, flagSize, marker.statusClass, props.selectedCountry, hoveredClusterId === marker.id || hoveredClusterId === marker.code]"
              :class="{ 'marker-visual-muted': props.selectedCountry && marker.code !== props.selectedCountry, 'marker-visual-active': hoveredClusterId === marker.id || hoveredClusterId === marker.code }"
            >
              <line :x1="marker.x" :y1="marker.y" :x2="marker.flagX" :y2="marker.flagY" class="marker-leader" />
              <circle :cx="marker.x" :cy="marker.y" r="11" class="city-region" :class="marker.statusClass" />
              <circle :cx="marker.x" :cy="marker.y" r="3.8" class="city-dot" :class="marker.statusClass" />
              <g v-if="marker.code" class="map-flag-frame">
                <image
                  :href="flagUrl(marker.code)"
                  :x="marker.flagX - flagSize / 2" :y="marker.flagY - flagSize / 2" :width="flagSize" :height="flagSize"
                  preserveAspectRatio="xMidYMid slice" class="map-flag"
                />
              </g>
            </g>
            <foreignObject
              v-for="marker in clusterMarkers" v-show="marker.visible" :key="marker.id"
              v-memo="[marker.visible, marker.flagX, marker.flagY, flagSize, marker.label, marker.cluster.servers, marker.tooltip, props.selectedCountry, hoveredClusterId === marker.id || hoveredClusterId === marker.code]"
              :x="marker.flagX - flagSize / 2" :y="marker.flagY - flagSize / 2" :width="flagSize" :height="flagSize"
              class="marker-trigger-box"
            >
              <div
                xmlns="http://www.w3.org/1999/xhtml" class="marker-trigger-wrapper"
                @focusin="hoveredClusterId = marker.id"
                @focusout="hoveredClusterId = null"
              >
                <AppTooltip
                  as="button"
                  :content="marker.tooltip"
                  class="map-cluster-trigger"
                  content-class="map-cluster-tooltip"
                  :class="{ 'is-active': hoveredClusterId === marker.id || hoveredClusterId === marker.code, 'is-muted': props.selectedCountry && marker.code !== props.selectedCountry }"
                  type="button"
                  tabindex="0"
                  :aria-label="`${marker.label}，查看 ${marker.cluster.servers} 台节点`"
                  @mouseenter="hoveredClusterId = marker.id"
                  @mouseleave="hoveredClusterId = null"
                  @click="openCluster(marker.cluster)"
                  @keydown.enter.prevent="openCluster(marker.cluster)"
                  @keydown.space.prevent="openCluster(marker.cluster)"
                >
                  <span class="sr-only">{{ marker.label }}</span>
                </AppTooltip>
              </div>
            </foreignObject>
          </g>
        </svg>

        <div class="map-status">
          <span class="map-status__online">
            <span class="map-status__dot" />
            {{ onlineServers }} ONLINE
          </span>
          <span v-if="offlineServers > 0" class="map-status__offline">
            <span class="map-status__dot map-status__dot--offline" />
            {{ offlineServers }} OFF
          </span>
        </div>
      </div>

      <div class="legend-panel" :class="legendDensityClass">
        <div class="legend-title">
          节点地图
          <span v-if="totalServers > 0">在线率 {{ onlineRate }}%</span>
        </div>
        <div class="legend-modes" role="group" aria-label="地图列表显示方式">
          <button type="button" :aria-pressed="legendMode === 'countries'" @click="legendMode = 'countries'">
            国家 / 地区
          </button>
          <button type="button" :aria-pressed="legendMode === 'cities'" @click="legendMode = 'cities'">
            城市 / 节点
          </button>
          <button v-if="props.selectedCountry" type="button" @click="emit('selectCountry', props.selectedCountry)">
            清除筛选
          </button>
        </div>
        <div class="legend-list" role="group" aria-label="节点位置列表" @wheel="onLegendWheel">
          <button
            v-for="(cluster, index) in legendClusters" :key="cluster.id" v-memo="[cluster, index, legendMode, hoveredClusterId === cluster.id, props.selectedCountry]"
            type="button"
            class="legend-item" :class="{
              'is-online': cluster.onlineServers > 0, 'is-offline': cluster.onlineServers === 0,
              'is-active': hoveredClusterId === cluster.id || props.selectedCountry === cluster.code,
              'is-muted': props.selectedCountry && cluster.code !== props.selectedCountry,
            }"
            :aria-label="legendMode === 'countries' ? `筛选${cluster.label}，${cluster.servers}台节点` : `查看${cluster.label}，${cluster.servers}台节点`"
            :aria-pressed="legendMode === 'countries' ? props.selectedCountry === cluster.code : undefined"
            :title="legendTooltips.get(cluster.id)"
            @mouseenter="hoveredClusterId = cluster.id"
            @mouseleave="hoveredClusterId = null"
            @focus="hoveredClusterId = cluster.id"
            @blur="hoveredClusterId = null"
            @click="legendMode === 'countries' ? emit('selectCountry', cluster.code) : openCluster(cluster)"
          >
            <span class="legend-index">{{ index + 1 }}</span>
            <img :src="flagUrl(cluster.code)" :alt="countryName(cluster.code)" class="legend-flag" @error="hideMissingFlag">
            <span class="legend-copy">
              <span class="legend-name">{{ legendMode === 'cities' ? clusterTitle(cluster) : cluster.label }}</span>
              <span class="legend-meta">{{ cluster.onlineServers }}/{{ cluster.servers }} 在线 · {{ legendMode === 'cities' && !cluster.city ? '国家参考位置' : countryName(cluster.code) }}</span>
            </span>
          </button>
        </div>
      </div>
    </div>
    <AppDialog
      v-model:open="dialogOpen"
      :title="selectedCluster ? clusterTitle(selectedCluster) : '节点位置'"
      :description="selectedCluster ? `${selectedCluster.onlineServers}/${selectedCluster.servers} 在线，点击节点查看详情。${clusterLocationDescription(selectedCluster)}。` : undefined"
    >
      <div class="location-members">
        <button v-for="server in selectedCluster?.members ?? []" :key="server.key" type="button" @click="openMember(server)">
          <span :class="server.online ? 'member-online' : 'member-offline'">{{ server.online ? '在线' : '离线' }}</span>
          <strong>{{ server.name }}</strong>
          <span>{{ server.group || '未分组' }}</span>
          <span>查看详情 →</span>
        </button>
      </div>
      <a v-if="selectedCluster?.members.some(server => server.location?.citySource === 'db-ip' || server.location?.subdivisionSource === 'db-ip')" href="https://db-ip.com" target="_blank" rel="noopener noreferrer">属地数据：DB-IP</a>
      <a v-if="selectedCluster?.members.some(server => server.location?.citySource === 'ipapi-is' || server.location?.subdivisionSource === 'ipapi-is')" href="https://ipapi.is" target="_blank" rel="noopener noreferrer">属地数据：IPapi.is</a>
    </AppDialog>
  </div>
</template>

<style scoped>

/* Tooltip renders a fragment: reach its actual HTML trigger through deep scope. */
.marker-trigger-wrapper :deep(.map-cluster-trigger) { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; appearance: none; cursor: pointer; outline: none; }
.marker-trigger-box { overflow: visible; }
.marker-trigger-wrapper { width: 100%; height: 100%; }
.marker-hit-area { fill: transparent; }
.marker-leader { stroke: rgb(253 224 71 / 80%); stroke-width: 1; vector-effect: non-scaling-stroke; pointer-events: none; }
.map-svg--texture { transform: translateZ(0); pointer-events: none; }
.marker-visual-active .city-region { stroke: var(--emerald); stroke-width: 3; }
/* Apply the shadow outside the clipped image so rounded flag edges do not cut it off. */
.marker-visual-active .map-flag-frame {
  filter: drop-shadow(0 3px 4px rgb(15 23 42 / 85%)) drop-shadow(0 0 1px rgb(255 255 255 / 95%));
}
.is-muted, .marker-visual-muted { opacity: 0.3; }
.marker-trigger-wrapper :deep(.map-cluster-trigger:focus-visible) { outline: 2px solid var(--emerald); border-radius: 4px; }
.legend-modes { display: flex; grid-column: 1 / -1; flex-wrap: wrap; gap: 0.25rem; }
.legend-modes button { border: 1px solid var(--glass-border); border-radius: 999px; background: var(--control-surface); color: var(--glass-text); padding: 0.25rem 0.45rem; font: inherit; font-size: 0.65rem; cursor: pointer; }
.legend-modes button[aria-pressed='true'] { color: var(--emerald); border-color: var(--emerald); }
.legend-item { cursor: pointer; text-align: left; font: inherit; min-height: 1.7rem; }
.legend-item:hover, .legend-item:focus-visible, .legend-item.is-active { outline: 2px solid var(--emerald); outline-offset: -1px; }
.location-members { display: grid; gap: 0.5rem; }
.location-members button { display: flex; align-items: center; gap: 0.65rem; padding: 0.75rem; border: 1px solid var(--glass-border); border-radius: 0.75rem; background: var(--control-surface); color: var(--glass-text); text-align: left; cursor: pointer; flex-wrap: wrap; }
.location-members button:hover, .location-members button:focus-visible { outline: 2px solid var(--emerald); }
.member-online { color: var(--emerald); }
.member-offline { color: var(--red); }

.earth-map-scroll {
  position: relative;
  z-index: 0;
  width: 100%;
  height: 100%;
  overflow-x: auto;
  overflow-y: visible;
  pointer-events: auto;
}

.earth-map-shell {
  position: relative;
  display: grid;
  isolation: isolate;
  width: 100%;
  height: 100%;
  min-height: 18rem;
  grid-template-columns: minmax(0, 1fr) minmax(14rem, 26%);
  margin-inline: auto;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  border-radius: 1.5rem;
  background: color-mix(in oklab, var(--page) 68%, rgb(56 189 248 / 24%));
  box-shadow: 0 24px 80px rgb(15 23 42 / 18%);
  backdrop-filter: blur(24px);
}

.earth-map {
  position: relative;
  height: 100%;
  min-width: 0;
  min-height: 18rem;
  overflow: hidden;
  border-right: 1px solid rgb(255 255 255 / 24%);
}

.earth-map::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(circle at 18% 18%, rgb(255 255 255 / 18%), transparent 32%),
    linear-gradient(135deg, rgb(255 255 255 / 10%), transparent 38%, rgb(15 23 42 / 8%));
  content: '';
  pointer-events: none;
}

.map-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding-inline: 0;
}

.earth-image-base {
  opacity: 0.92;
  filter: saturate(1.08) contrast(1) brightness(1.12);
}

.earth-image-bump {
  opacity: 0.2;
  mix-blend-mode: overlay;
  filter: contrast(1.35) brightness(1.12);
}

.earth-image-water {
  opacity: 0.16;
  mix-blend-mode: screen;
  filter: saturate(0.42) contrast(1.22) brightness(1.04);
}

.earth-overlay {
  fill: rgb(255 255 255 / 5%);
  mix-blend-mode: soft-light;
}

:global(html[data-theme='dark'] .earth-map-shell .earth-image-base) {
  filter: saturate(1.1) contrast(1.04) brightness(0.92);
}

:global(html[data-theme='dark'] .earth-map-shell .earth-image-bump) {
  opacity: 0.28;
}

:global(html[data-theme='dark'] .earth-map-shell .earth-image-water) {
  opacity: 0.2;
}

.map-status {
  position: absolute;
  left: 0.75rem;
  top: 0.75rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid color-mix(in srgb, var(--glass-border) 35%, transparent);
  border-radius: 999px;
  padding: 0.25rem 0.625rem;
  background: color-mix(in srgb, var(--glass) 55%, transparent);
  box-shadow: var(--shadow-soft);
  color: var(--muted);
  font-size: 10px;
  font-weight: 500;
  backdrop-filter: blur(20px);
}

@media (min-width: 768px) {
  .map-status {
    left: 1rem;
    top: 1rem;
  }
}

.map-status__online,
.map-status__offline {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.map-status__online {
  color: var(--emerald);
}

.map-status__offline {
  color: var(--red);
}

.map-status__dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 999px;
  background: var(--emerald);
  box-shadow: 0 0 10px color-mix(in srgb, var(--emerald) 85%, transparent);
}

.map-status__dot--offline {
  background: var(--red);
  box-shadow: 0 0 10px color-mix(in srgb, var(--red) 70%, transparent);
}

.city-region {
  fill: rgb(253 224 71 / 24%);
  stroke: rgb(253 224 71 / 46%);
  stroke-width: 1.1;
  vector-effect: non-scaling-stroke;
}

.city-region.is-offline {
  fill: rgb(251 113 133 / 14%);
  stroke: rgb(251 113 133 / 38%);
}

.city-dot {
  fill: rgb(253 224 71 / 95%);
  stroke: rgb(21 128 61 / 84%);
  stroke-width: 1.3;
  vector-effect: non-scaling-stroke;
}

.city-dot.is-offline {
  fill: rgb(251 113 133 / 90%);
  stroke: rgb(190 18 60 / 80%);
}

.map-flag {
  overflow: hidden;
  clip-path: inset(0 round 1.6px);
  filter: drop-shadow(0 3px 5px rgb(15 23 42 / 32%));
}

.legend-panel {
  --legend-grid-columns: repeat(2, minmax(0, 1fr));
  --legend-gap: 0.22rem;
  --legend-item-columns: 1.05rem 0.85rem minmax(0, 1fr);
  --legend-item-gap: 0.26rem;
  --legend-item-radius: 0.55rem;
  --legend-item-padding: 0.2rem 0.32rem;
  --legend-index-size: 1rem;
  --legend-index-font-size: 0.58rem;
  --legend-flag-size: 0.86rem;
  --legend-copy-line-height: 1.05;
  --legend-name-font-size: 0.58rem;
  --legend-meta-font-size: 0.46rem;

  position: relative;
  z-index: 14;
  display: grid;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: var(--legend-gap);
  overflow: hidden;
  padding: 0.7rem 0.75rem;
  background: rgb(255 255 255 / 8%);
  pointer-events: auto;
}

.legend-list {
  display: grid;
  grid-template-columns: var(--legend-grid-columns);
  align-content: start;
  gap: var(--legend-gap);
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: auto;
  backdrop-filter: blur(12px) saturate(150%);
}

.legend-title {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 1px solid rgb(255 255 255 / 36%);
  border-radius: 999px;
  background: rgb(255 255 255 / 45%);
  box-shadow: 0 8px 18px rgb(15 23 42 / 10%);
  padding: 0.22rem 0.7rem;
  color: rgb(14 116 144 / 86%);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  backdrop-filter: blur(12px) saturate(150%);
}

.legend-title span {
  color: rgb(5 150 105 / 95%);
  letter-spacing: normal;
}

.legend-dense {
  --legend-gap: 0.16rem;
  --legend-item-columns: 0.92rem 0.74rem minmax(0, 1fr);
  --legend-item-gap: 0.18rem;
  --legend-item-radius: 0.45rem;
  --legend-item-padding: 0.14rem 0.24rem;
  --legend-index-size: 0.82rem;
  --legend-index-font-size: 0.5rem;
  --legend-flag-size: 0.74rem;
  --legend-copy-line-height: 1;
  --legend-name-font-size: 0.52rem;
  --legend-meta-font-size: 0.4rem;
}

.legend-very-dense {
  --legend-gap: 0.12rem;
  --legend-item-columns: 0.82rem 0.66rem minmax(0, 1fr);
  --legend-item-gap: 0.14rem;
  --legend-item-radius: 0.38rem;
  --legend-item-padding: 0.1rem 0.2rem;
  --legend-index-size: 0.72rem;
  --legend-index-font-size: 0.44rem;
  --legend-flag-size: 0.66rem;
  --legend-copy-line-height: 0.96;
  --legend-name-font-size: 0.48rem;
  --legend-meta-font-size: 0.36rem;
}

.legend-ultra-dense {
  --legend-gap: 0.1rem;
  --legend-item-columns: 0.74rem 0.58rem minmax(0, 1fr);
  --legend-item-gap: 0.12rem;
  --legend-item-radius: 0.34rem;
  --legend-item-padding: 0.08rem 0.16rem;
  --legend-index-size: 0.64rem;
  --legend-index-font-size: 0.38rem;
  --legend-flag-size: 0.58rem;
  --legend-copy-line-height: 0.94;
  --legend-name-font-size: 0.44rem;
  --legend-meta-font-size: 0.32rem;
}

.legend-item {
  display: grid;
  grid-template-columns: var(--legend-item-columns);
  align-items: center;
  gap: var(--legend-item-gap);
  border: 1px solid rgb(255 255 255 / 38%);
  border-radius: var(--legend-item-radius);
  background: rgb(255 255 255 / 44%);
  box-shadow: 0 8px 18px rgb(15 23 42 / 12%);
  padding: var(--legend-item-padding);
}

.legend-index {
  display: inline-grid;
  width: var(--legend-index-size);
  height: var(--legend-index-size);
  place-items: center;
  border-radius: 999px;
  background: rgb(253 224 71 / 92%);
  color: rgb(15 23 42 / 86%);
  font-size: var(--legend-index-font-size);
  font-weight: 800;
}

.legend-item.is-offline .legend-index {
  background: rgb(251 113 133 / 85%);
  color: white;
}

.legend-flag {
  width: var(--legend-flag-size);
  height: var(--legend-flag-size);
  border-radius: 0.12rem;
  object-fit: cover;
}

.legend-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  line-height: var(--legend-copy-line-height);
}

.legend-name {
  overflow: hidden;
  color: rgb(15 23 42 / 84%);
  font-size: var(--legend-name-font-size);
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-meta {
  overflow: hidden;
  color: rgb(71 85 105 / 76%);
  font-size: var(--legend-meta-font-size);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(html[data-theme='dark'] .earth-map-shell .earth-map) {
  border-right-color: rgb(125 211 252 / 12%);
}

:global(html[data-theme='dark'] .earth-map-shell .legend-panel) {
  background: rgb(15 23 42 / 18%);
}

:global(html[data-theme='dark'] .earth-map-shell .legend-title),
:global(html[data-theme='dark'] .earth-map-shell .legend-item) {
  border-color: rgb(125 211 252 / 18%);
  background: rgb(15 23 42 / 58%);
}

:global(html[data-theme='dark'] .earth-map-shell .legend-title) {
  color: rgb(186 230 253 / 86%);
}

:global(html[data-theme='dark'] .earth-map-shell .legend-title) span {
  color: rgb(110 231 183 / 92%);
}

:global(html[data-theme='dark'] .earth-map-shell .legend-name) {
  color: rgb(255 255 255 / 90%);
}

:global(html[data-theme='dark'] .earth-map-shell .legend-meta) {
  color: rgb(186 230 253 / 66%);
}

/* 手机使用完整地图 + 下方可滚动列表，取消桌面侧栏的强制最小宽度。 */
@media (max-width: 767px) {
  .earth-map-scroll { height: auto; overflow: visible; }
  .earth-map-shell { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: auto; border-radius: 1rem; }
  .earth-map { width: 100%; height: auto; min-height: 0; aspect-ratio: 2 / 1; flex-shrink: 0; border-right: 0; border-bottom: 1px solid var(--glass-border); }
  .map-status { top: 0.3rem; left: 0.3rem; gap: 0.3rem; padding: 0.15rem 0.4rem; font-size: 9px; }
  .legend-panel, .legend-dense, .legend-very-dense, .legend-ultra-dense {
    --legend-grid-columns: repeat(2, minmax(0, 1fr));
    --legend-gap: 0.4rem;
    --legend-item-columns: 1rem 1rem minmax(0, 1fr);
    --legend-item-gap: 0.3rem;
    --legend-item-radius: 0.5rem;
    --legend-item-padding: 0.45rem 0.4rem;
    --legend-index-size: 1rem;
    --legend-index-font-size: 0.6rem;
    --legend-flag-size: 1rem;
    --legend-copy-line-height: 1.2;
    --legend-name-font-size: 0.75rem;
    --legend-meta-font-size: 0.6rem;
    width: 100%; height: 20rem; max-height: 20rem; padding: 0.6rem; overscroll-behavior-y: auto;
  }
  .legend-item { min-height: 44px; }
  .legend-modes button { min-height: 36px; padding: 0.3rem 0.6rem; font-size: 12px; }
  .legend-title { font-size: 12px; letter-spacing: 0.08em; }
}
</style>
