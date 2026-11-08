<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import { metricSeriesChartOption, type MetricSeriesData } from '@/domain/detail-chart-options'
import { probeChartPoints, windowAverage } from '@/domain/probe-window'
import { useThemeSettingsStore } from '@/stores/theme-settings'
import type { GlassServer } from '@/types/glassmorphism'
import { formatLatency, formatProbePercent } from '@/utils/format'
import { getChartSeriesPalette, getChartThemeColors } from '@/utils/chart-palette'
import '@/utils/echarts'

const props = defineProps<{
  server: GlassServer
  initialMetric: 'latency' | 'loss'
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ detail: [] }>()
const theme = useThemeSettingsStore()
const metric = ref<string>(props.initialMetric)
watch(() => open.value, value => { if (value) metric.value = props.initialMetric })
const tabs = [{ value: 'latency', label: '延迟' }, { value: 'loss', label: '丢包' }]
const source = computed(() => metric.value === 'loss' ? props.server.history.packetLossSeries : props.server.history.latencySeries)
const tasks = computed(() => props.server.latency.map(probe => ({
  ...probe,
  average: windowAverage(source.value, probe.target),
})))
const series = computed<MetricSeriesData[]>(() => {
  const palette = getChartSeriesPalette(theme.runtime.colorVisionMode === '色觉友好')
  return tasks.value.map((probe, index) => ({
    name: probe.label,
    color: palette[index % palette.length] ?? '#60A5FA',
    kind: metric.value === 'loss' ? 'percent' : 'milliseconds',
    data: probeChartPoints(source.value[probe.target] ?? []),
  }))
})
const hasSamples = computed(() => series.value.some(line => line.data.some(point => point[1] !== null)))
const option = computed(() => metricSeriesChartOption(series.value, getChartThemeColors(theme.resolvedTheme === 'dark'), metric.value === 'loss'))
function averageText(value: number | null): string {
  if (value === null) return '-'
  return metric.value === 'loss' ? formatProbePercent(value) : formatLatency(value)
}
</script>

<template>
  <AppDialog v-model:open="open" :title="`${server.name} · 网络监测`" description="最近两小时的探测采样。悬停曲线查看时间与数值，点击图例开关线路。">
    <div class="node-probe-dialog">
      <AppTabs v-model="metric" :items="tabs" list-label="网络监测指标" />
      <div class="node-probe-dialog__stats">
        <div v-for="probe in tasks" :key="probe.target">
          <span>{{ probe.label }}</span>
          <strong>{{ averageText(probe.average.value) }}</strong>
          <small>{{ probe.average.samples }} 个有效采样</small>
        </div>
      </div>
      <div v-if="hasSamples" class="node-probe-dialog__chart" :aria-label="metric === 'loss' ? '丢包历史曲线' : '延迟历史曲线'">
        <VChart :key="`${server.key}-${metric}`" :option="option" autoresize />
      </div>
      <p v-else class="node-probe-dialog__empty">
        当前没有可用的历史采样；卡片上的最近值可在下次上报后更新。
      </p>
      <button type="button" class="settings-action settings-action--primary" @click="emit('detail')">
        查看节点详情与完整历史
      </button>
    </div>
  </AppDialog>
</template>
