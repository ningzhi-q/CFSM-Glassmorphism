<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import { metricSeriesChartOption, type MetricSeriesData } from '@/domain/detail-chart-options'
import { probeChartPoints } from '@/domain/probe-window'
import { probeDisplayGroups, probeDialogRows } from '@/domain/probe-display'
import { useThemeSettingsStore } from '@/stores/theme-settings'
import type { GlassServer } from '@/types/glassmorphism'
import type { ProbeTarget, ProbeValue } from '@/types/cfsm'
import { formatLatency, formatProbePercent } from '@/utils/format'
import { getChartSeriesPalette, getChartThemeColors } from '@/utils/chart-palette'
import '@/utils/echarts'

const props = defineProps<{
  server: GlassServer
  initialMetric: 'latency' | 'loss'
  initialTarget?: ProbeTarget
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ detail: [] }>()
const theme = useThemeSettingsStore()
const metric = ref<string>(props.initialMetric)
const activeGroupId = ref('')
const tabs = [{ value: 'latency', label: '延迟' }, { value: 'loss', label: '丢包' }]
const rows = computed(() => probeDialogRows(props.server, theme.runtime.probeTargets, Date.now()))
const groups = computed(() => probeDisplayGroups(props.server.probeCatalog, rows.value))
const groupTabs = computed(() => groups.value.map(group => ({ value: group.id, label: group.label })))
const activeGroup = computed(() => groups.value.find(group => group.id === activeGroupId.value) ?? groups.value[0])
const tasks = computed(() => (activeGroup.value?.rows ?? []).map(probe => ({
  ...probe,
  average: metric.value === 'loss' ? probe.loss : probe.latency,
})))
watch([() => open.value, () => props.server.key, () => props.initialTarget], () => {
  if (!open.value) return
  metric.value = props.initialMetric
  activeGroupId.value = groups.value.find(group => group.rows.some(row => row.target === props.initialTarget))?.id ?? groups.value[0]?.id ?? ''
}, { immediate: true })
const series = computed<MetricSeriesData[]>(() => {
  const palette = getChartSeriesPalette(theme.runtime.colorVisionMode === '色觉友好')
  return tasks.value.map((probe, index) => ({
    name: probe.label,
    color: palette[index % palette.length] ?? '#60A5FA',
    kind: metric.value === 'loss' ? 'percent' : 'milliseconds',
    data: probeChartPoints(probe.average.points),
  }))
})
const hasSamples = computed(() => series.value.some(line => line.data.some(point => point[1] !== null)))
const option = computed(() => metricSeriesChartOption(series.value, getChartThemeColors(theme.resolvedTheme === 'dark'), metric.value === 'loss'))
function averageText(value: ProbeValue): string {
  if (value === null) return '-'
  return metric.value === 'loss' ? formatProbePercent(value) : formatLatency(value)
}
</script>

<template>
  <AppDialog v-model:open="open" :title="`${server.name} · 网络监测`" description="最近两小时的探测采样。悬停曲线查看时间与数值，点击图例开关线路。">
    <template #toolbar>
      <div class="node-probe-dialog__toolbar">
        <AppTabs v-model="metric" class="detail-range-tabs" :items="tabs" list-label="网络监测指标" />
        <AppTabs v-if="server.probeCatalog?.enabled && groupTabs.length" class="detail-range-tabs" :model-value="activeGroup?.id ?? ''" :items="groupTabs" list-label="网络监测分组" @update:model-value="activeGroupId = $event" />
      </div>
    </template>
    <div class="node-probe-dialog">
      <div class="node-probe-dialog__stats">
        <div v-for="probe in tasks" :key="probe.target" :data-probe-target="probe.target">
          <span>{{ probe.label }}</span>
          <strong>{{ averageText(probe.average.value) }}</strong>
          <small>{{ probe.average.samples }} 个有效采样</small>
        </div>
      </div>
      <div v-if="hasSamples" class="node-probe-dialog__chart" :aria-label="metric === 'loss' ? '丢包历史曲线' : '延迟历史曲线'">
        <VChart :key="`${server.key}-${metric}-${activeGroup?.id ?? ''}`" :option="option" autoresize />
      </div>
      <p v-else class="node-probe-dialog__empty">
        当前没有可用的历史采样；卡片上的最近值可在下次上报后更新。
      </p>
    </div>
    <template #footer>
      <button type="button" class="settings-action node-probe-dialog__detail" @click="emit('detail')">
        查看完整历史
      </button>
    </template>
  </AppDialog>
</template>
