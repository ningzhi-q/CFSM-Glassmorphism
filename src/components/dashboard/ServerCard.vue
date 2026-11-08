<script setup lang="ts">
import { computed } from 'vue'
import type { GlassServer } from '@/types/glassmorphism'
import type { NodeCardSize } from '@/theme/settings'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppProgressThin from '@/components/ui/AppProgressThin.vue'
import AppTooltip from '@/components/ui/AppTooltip.vue'
import { loadCapacityPercent } from '@/domain/node-metrics'
import { resolveRegionCoordinates } from '@/domain/advanced-tools'
import { probeSeriesFor, windowAverage, type ProbeSeriesMap } from '@/domain/probe-window'
import {
  daysUntilExpiry,
  remainingValue,
  trafficDisplay,
  trafficDisplayPercent,
  trafficHeadText,
  trafficRatioText,
} from '@/domain/theme-presentation'
import { flagUrl, hideMissingFlag } from '@/utils/flags'
import { osDisplayName, osIconUrl } from '@/utils/os-icon'
import {
  formatCurrencyValue,
  formatDisplayBytes,
  formatDisplayMebibytes,
  formatDisplayPrice,
  formatDisplaySpeed,
  formatHomeUptimeDays,
  formatLatency,
  formatLoad,
  formatPercent,
  formatProbePercent,
  MISSING_TEXT,
  normalizeTimestampMilliseconds,
} from '@/utils/format'
import { trafficTextTone, usageStatus } from '@/utils/progress-status'

/**
 * 对齐 Komari `NodeCard` 的节点卡片。
 *
 * 区块顺序与上游一致：状态点 + 名称 / 收藏 + OS + 旗帜 / 运行与价格芯片 /
 * CPU·内存·硬盘·负载四项进度 / 网速·累计上下行·配额流量三列指标盒 /
 * 延迟与丢包双面板 / 自定义标签 / 离线遮罩。
 *
 * 数据全部来自既有 normalized model，不解析 wire payload，也不补造缺失值。
 */
const props = defineProps<{
  server: GlassServer
  showSource: boolean
  /** 卡片密度直接来自主题设置 `nodeCardSize`，与 Komari 的 NodeCard 一致。 */
  density: NodeCardSize
  favorite: boolean
  /** 主题级价格隐私（未登录隐藏价格）。每台节点自身的 showPrice 仍单独生效。 */
  priceVisible: boolean
}>()

const emit = defineEmits<{
  open: []
  toggleFavorite: []
  probe: [metric: 'latency' | 'loss']
}>()

const isMini = computed(() => props.density === 'mini')

function ratio(used: number | null, total: number | null): number | null {
  if (used === null || total === null || total <= 0) return null
  return Math.min(100, Math.max(0, (used / total) * 100))
}

const memoryPercent = computed(() => ratio(props.server.memory.used, props.server.memory.total))
const diskPercent = computed(() => ratio(props.server.disk.used, props.server.disk.total))
// 显示口径见 `trafficDisplay`：不限流量显示真实已用量，站点关闭流量展示时不呈现任何数值。
const trafficView = computed(() => trafficDisplay(props.server))
const trafficPercent = computed(() => trafficDisplayPercent(trafficView.value))
const trafficTone = computed(() => trafficTextTone(trafficPercent.value))
const trafficCritical = computed(() => trafficPercent.value !== null && trafficPercent.value >= 95)
const loadPercent = computed(() => loadCapacityPercent(props.server.load.one, props.server.cpuCores))
const loadTooltip = computed(() => `最近 1 / 5 / 15 分钟平均负载：${formatLoad(props.server.load.one)} / ${formatLoad(props.server.load.five)} / ${formatLoad(props.server.load.fifteen)}。`
  + (props.server.cpuCores && props.server.cpuCores > 0 ? `进度条按 ${props.server.cpuCores} 核容量计算，100% 表示平均每核有一个运行或等待任务。` : '未提供核心数，不计算负载进度。'))

/** 上游内存格挂 `Swap 已用 … / 总计 …` 的 title；CFSM 没有上报 Swap 时不挂，不写成 0。 */
const swapTooltip = computed(() => {
  const { used, total } = props.server.swap
  if (used === null) return undefined
  const usedText = formatDisplayMebibytes(Math.max(0, used))
  return total !== null && total > 0
    ? `Swap 已用 ${usedText} / 总计 ${formatDisplayMebibytes(total)}`
    : `Swap 已用 ${usedText}`
})

const osName = computed(() => osDisplayName(props.server.operatingSystem))
const regionCode = computed(() => resolveRegionCoordinates(props.server.region)?.code ?? null)

/** Komari NodeCard 的运行芯片只显示整天数（`在线 N 天`），不显示小时。 */
const uptimeText = computed(() => formatHomeUptimeDays(props.server.bootTime))
/**
 * 价格受两层控制：主题级 `hidePriceWhenLoggedOut` 与该节点自身的 `showPrice`。
 * 缺失或无法解析时返回占位符，此时不生成价格芯片，避免空标签。
 * 计费周期按 CFSM 官方枚举本地化；未知自由文本原样保留。
 */
const priceText = computed(() => {
  if (!props.priceVisible || !props.server.showPrice) return ''
  const text = formatDisplayPrice(props.server.price, props.server.currency, props.server.billingCycle)
  return text === MISSING_TEXT ? '' : text
})
const expireVisible = computed(() => props.server.showExpire && daysUntilExpiry(props.server.expireDate) !== null)
/*
 * 没有可显示到期日的付费节点：上游 NodeCard 仍画两行（`-` 与剩余价值），但它把未知到期的
 * 剩余价值算成 0，显示成「€0」。这里保留同样的两行结构，第二行如实为占位，不写成 0。
 */
const expiryInfo = computed(() => {
  const days = daysUntilExpiry(props.server.expireDate)
  if (days === null) return { text: MISSING_TEXT, prefix: '', value: '', unit: '', tone: 'neutral' }
  if (days <= 0) return { text: '已过期', prefix: '', value: '', unit: '', tone: 'danger' }
  if (days > 36_500) return { text: '长期', prefix: '', value: '', unit: '', tone: 'neutral' }
  return {
    text: '',
    prefix: '剩余',
    value: String(days),
    unit: '天',
    tone: days <= 5 ? 'danger' : days <= 10 ? 'warning' : 'neutral',
  }
})
const expiryFullText = computed(() => {
  const info = expiryInfo.value
  return info.text || `${info.prefix} ${info.value} ${info.unit}`
})
const remainingValueText = computed(() => {
  if (!props.priceVisible || !props.server.showPrice) return ''
  const rawPrice = props.server.price?.trim()
  if (!rawPrice) return ''
  const price = Number(rawPrice)
  if (!Number.isFinite(price) || (price < 0 && price !== -1)) return ''
  if (price === 0 || price === -1) return '无'
  return formatCurrencyValue(remainingValue(props.server), props.server.currency)
})

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 上游离线遮罩显示 `formatDateTime(node.time)`：`YYYY-MM-DD HH:mm:ss`，不带前缀。 */
const offlineText = computed(() => {
  const timestamp = normalizeTimestampMilliseconds(props.server.lastUpdated)
  if (timestamp === null) return '尚无上报'
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
})

const chips = computed(() => {
  const list: string[] = [uptimeText.value]
  if (priceText.value) list.push(priceText.value)
  if (expireVisible.value) {
    list.push(expiryFullText.value)
    if (remainingValueText.value) list.push(`剩余价值 ${remainingValueText.value}`)
  }
  if (props.showSource) list.push(props.server.sourceLabel)
  return list
})

/*
 * 延迟与丢包柱状图对齐 Komari `useNodePingDisplay`：
 * 柱子一律满高，数值由 signal-1..5 五级颜色表达，而不是由柱子高度表达；
 * 色觉友好模式再叠加 ping-signal-pattern 纹理。
 * 没有采样时渲染 20 根中性占位柱，与上游 EMPTY_PING_BAR_COUNT 一致，
 * 这样丢包为 0 时面板依然是一条完整的柱带，而不是一片空白。
 */
const EMPTY_PING_BAR_COUNT = 20

function latencyToneClass(latency: number): string {
  if (latency <= 60) return 'is-signal-1'
  if (latency <= 100) return 'is-signal-2'
  if (latency <= 160) return 'is-signal-3 ping-signal-pattern-2'
  if (latency <= 200) return 'is-signal-4 ping-signal-pattern-3'
  return 'is-signal-5 ping-signal-pattern-4'
}

function lossToneClass(loss: number): string {
  if (loss <= 1) return 'is-signal-1'
  if (loss <= 3) return 'is-signal-2'
  if (loss <= 6) return 'is-signal-3 ping-signal-pattern-2'
  if (loss <= 9) return 'is-signal-4 ping-signal-pattern-3'
  return 'is-signal-5 ping-signal-pattern-4'
}

interface PingBar {
  key: string
  className: string
  tooltip: string
}

function emptyBars(metric: string): PingBar[] {
  return Array.from({ length: EMPTY_PING_BAR_COUNT }, (_, index) => ({
    key: `${metric}-empty-${index}`,
    className: 'is-empty',
    tooltip: '暂无探测采样',
  }))
}

const primaryProbe = computed(() => props.server.latency[0] ?? null)

/*
 * 延迟与丢包显示的是**窗口平均**，与上游一致：Komari `useNodePingDisplay` 的
 * `latencyDisplay` / `lossDisplay` 取的是 `pingStats.avgLatency` / `avgLoss`，
 * 不是最近一次采样。窗口就是 `/api/servers` 已经返回的 `ping` / `loss`
 * （最近 2 小时、最多 20 个真实采样），因此不需要任何额外请求。
 *
 * 站点关闭三网详情时后端返回空数组，此时回落到本次上报的最新值，并在标题里
 * 说明口径，不把"没有窗口"伪装成平均值。
 */
const latencyWindow = computed(() => {
  const target = primaryProbe.value?.target
  return target ? windowAverage(props.server.history.latencySeries, target) : { value: null, samples: 0 }
})
const lossWindow = computed(() => {
  const target = primaryProbe.value?.target
  return target ? windowAverage(props.server.history.packetLossSeries, target) : { value: null, samples: 0 }
})
const latencyText = computed(() => (
  latencyWindow.value.value === null
    ? formatLatency(primaryProbe.value?.latency ?? false)
    : formatLatency(latencyWindow.value.value)
))
const lossText = computed(() => (
  lossWindow.value.value === null
    ? formatProbePercent(primaryProbe.value?.packetLoss ?? false)
    : formatProbePercent(lossWindow.value.value)
))

function probeTitle(label: string, samples: number): string | undefined {
  const probe = primaryProbe.value
  if (!probe) return undefined
  return samples === 0
    ? `${probe.label} 最近一次上报`
    : `${probe.label} ${label}：按窗口内 ${samples} 个真实采样计算`
}

const latencyTitle = computed(() => probeTitle('平均延迟', latencyWindow.value.samples))
const lossTitle = computed(() => probeTitle('平均丢包', lossWindow.value.samples))

/*
 * 一根柱子 = 一个时间桶，与 Komari `useNodePingDisplay.buildPingBars` 一致
 * （上游是 `points.map(...)`，逐点渲染）。
 *
 * 柱子只画**当前面板所标注的那个探测目标**的序列。此前的实现把
 * 20 个时间桶 × 4 条线路拍平成一个数组，还顺手过滤掉了空洞，
 * 结果既不是时间序列、柱数随缺口变化，柱子与标题上的线路也对不上——
 * 这就是第 14 轮修掉的 BUG-001。
 *
 * `null`（该桶无采样）保留为原位的中性柱，对应上游的 `bg-muted-foreground/15`；
 * 整体无数据时才回落到 20 根更淡的占位柱（`bg-muted-foreground/10`）。
 */
function buildBars(
  metric: string,
  series: ProbeSeriesMap,
  tone: (value: number) => string,
): PingBar[] {
  const target = primaryProbe.value?.target
  const points = target ? probeSeriesFor(series, target) : []
  if (points.length === 0) return emptyBars(metric)
  return points.map((point, index) => ({
    key: `${metric}-${point.timestamp}-${index}`,
    className: typeof point.value === 'number' ? tone(point.value) : 'is-gap',
    tooltip: `${new Date(normalizeTimestampMilliseconds(point.timestamp) ?? point.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}\n${typeof point.value === 'number' ? (metric === 'latency' ? formatLatency(point.value) : formatProbePercent(point.value)) : point.value === false ? '探测未配置' : '该时间段暂无采样'}`,
  }))
}

const latencyBars = computed(() => buildBars(
  'latency',
  props.server.history.latencySeries,
  latencyToneClass,
))
const lossBars = computed(() => buildBars(
  'loss',
  props.server.history.packetLossSeries,
  lossToneClass,
))

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  emit('open')
}

function hideMissingImage(event: Event): void {
  const target = event.target
  if (target instanceof HTMLImageElement) target.style.display = 'none'
}
</script>

<template>
  <article
    class="node-card"
    :class="[
      `node-card--${density}`,
      { 'node-card--offline': !server.online },
    ]"
    role="button"
    tabindex="0"
    :aria-label="`查看节点 ${server.name} 详情`"
    @click="emit('open')"
    @keydown="handleKeydown"
  >
    <header class="node-card__header">
      <div class="node-card__identity">
        <span class="node-status-wrap" aria-hidden="true">
          <span
            class="node-status"
            :class="server.online ? 'node-status--online' : 'node-status--offline'"
          />
          <span
            class="node-status-pulse"
            :class="server.online ? 'node-status-pulse--online' : 'node-status-pulse--offline'"
          />
        </span>
        <span class="node-card__name" :title="server.name">{{ server.name }}</span>
      </div>
      <div class="node-card__header-extra">
        <button
          type="button"
          class="favorite-button"
          :class="{ 'is-favorite': favorite }"
          :aria-label="favorite ? `取消收藏 ${server.name}` : `收藏 ${server.name}`"
          :title="favorite ? '取消收藏' : '收藏节点'"
          @click.stop="emit('toggleFavorite')"
          @keydown.stop
        >
          <AppIcon :name="favorite ? 'tabler:star-filled' : 'tabler:star'" :size="14" />
        </button>
        <img
          class="node-card__os"
          :src="osIconUrl(server.operatingSystem)"
          :alt="osName"
          :title="server.operatingSystem ?? osName"
          @error="hideMissingImage"
        >
        <img
          v-if="regionCode"
          class="node-card__flag"
          :src="flagUrl(regionCode)"
          :alt="server.region ?? regionCode"
          :title="server.region ?? regionCode"
          @error="hideMissingFlag"
        >
      </div>
    </header>

    <div class="node-card__body">
      <div class="node-card__chips">
        <span v-for="chip in chips" :key="chip" class="node-chip">{{ chip }}</span>
      </div>

      <!--
        上游 mini 档的指标区是另一套结构（`grid-cols-[3fr_2fr]`）：左栏 CPU / 内存
        只放图标，内存用量占满左栏；右栏是带文字的流量。不是把四项挤进三列。
      -->
      <div v-if="isMini" class="node-metrics node-metrics--mini">
        <div class="node-metrics__pair">
          <div class="node-metric">
            <div class="node-metric__head">
              <span class="node-metric__label node-metric__label--cpu" role="img" title="CPU" aria-label="CPU">
                <AppIcon name="tabler:cpu" :size="12" />
              </span>
              <span class="node-metric__value">{{ formatPercent(server.cpu) }}</span>
            </div>
            <AppProgressThin :percentage="server.cpu" :status="usageStatus(server.cpu)" />
          </div>

          <div class="node-metric" :title="swapTooltip">
            <div class="node-metric__head">
              <span class="node-metric__label node-metric__label--memory" role="img" title="内存" aria-label="内存">
                <AppIcon name="icon-park-outline:memory" :size="12" />
              </span>
              <span class="node-metric__value">{{ formatPercent(memoryPercent) }}</span>
            </div>
            <AppProgressThin :percentage="memoryPercent" :status="usageStatus(memoryPercent)" />
          </div>

          <div class="node-metric__hint">
            {{ formatDisplayMebibytes(server.memory.used) }}
            /
            {{ formatDisplayMebibytes(server.memory.total) }}
          </div>
        </div>

        <div class="node-metric" :title="loadTooltip" data-node-metric="load">
          <div class="node-metric__head">
            <span class="node-metric__label node-metric__label--load">
              <AppIcon name="tabler:activity" :size="13" /><span>负载</span>
            </span>
            <span class="node-metric__value">{{ formatLoad(server.load.one) }}</span>
          </div>
          <AppProgressThin :percentage="loadPercent" :status="usageStatus(loadPercent)" />
          <div class="node-metric__hint" :title="loadTooltip">
            5分 {{ formatLoad(server.load.five) }} · 15分 {{ formatLoad(server.load.fifteen) }}
          </div>
        </div>
      </div>

      <div v-else class="node-metrics">
        <div class="node-metric">
          <div class="node-metric__head">
            <span class="node-metric__label node-metric__label--cpu">
              <AppIcon name="tabler:cpu" :size="13" /><span>CPU</span>
            </span>
            <span class="node-metric__value">{{ formatPercent(server.cpu) }}</span>
          </div>
          <AppProgressThin :percentage="server.cpu" :status="usageStatus(server.cpu)" />
          <div class="node-metric__hint">
            {{ server.cpuCores === null ? MISSING_TEXT : `${server.cpuCores} 核` }}
          </div>
        </div>

        <div class="node-metric" :title="swapTooltip">
          <div class="node-metric__head">
            <span class="node-metric__label node-metric__label--memory">
              <AppIcon name="icon-park-outline:memory" :size="13" /><span>内存</span>
            </span>
            <span class="node-metric__value">{{ formatPercent(memoryPercent) }}</span>
          </div>
          <AppProgressThin :percentage="memoryPercent" :status="usageStatus(memoryPercent)" />
          <div class="node-metric__hint">
            {{ formatDisplayMebibytes(server.memory.used) }}
            /
            {{ formatDisplayMebibytes(server.memory.total) }}
          </div>
        </div>

        <div class="node-metric">
          <div class="node-metric__head">
            <span class="node-metric__label node-metric__label--disk">
              <AppIcon name="tabler:server-2" :size="13" /><span>硬盘</span>
            </span>
            <span class="node-metric__value">{{ formatPercent(diskPercent) }}</span>
          </div>
          <AppProgressThin :percentage="diskPercent" :status="usageStatus(diskPercent)" />
          <div class="node-metric__hint">
            {{ formatDisplayMebibytes(server.disk.used) }}
            /
            {{ formatDisplayMebibytes(server.disk.total) }}
          </div>
        </div>

        <div class="node-metric" :title="loadTooltip" data-node-metric="load">
          <div class="node-metric__head">
            <span class="node-metric__label node-metric__label--load">
              <AppIcon name="tabler:activity" :size="13" /><span>负载</span>
            </span>
            <span class="node-metric__value">{{ formatLoad(server.load.one) }}</span>
          </div>
          <AppProgressThin :percentage="loadPercent" :status="usageStatus(loadPercent)" />
          <div class="node-metric__hint" :title="loadTooltip">
            5分 {{ formatLoad(server.load.five) }} · 15分 {{ formatLoad(server.load.fifteen) }}
          </div>
        </div>
      </div>

      <div class="node-boxes">
        <div class="node-box">
          <span class="node-box__row node-box__row--up">
            <AppIcon name="tabler:chevron-up" :size="11" />
            <span class="node-box__text">{{ formatDisplaySpeed(server.network.outSpeed) }}</span>
          </span>
          <span class="node-box__row node-box__row--down">
            <AppIcon name="tabler:chevron-down" :size="11" />
            <span class="node-box__text">{{ formatDisplaySpeed(server.network.inSpeed) }}</span>
          </span>
        </div>
        <div class="node-box">
          <span class="node-box__row">
            <AppIcon name="tabler:upload" :size="11" />
            <span class="node-box__text">{{ formatDisplayBytes(server.network.transmitted) }}</span>
          </span>
          <span class="node-box__row">
            <AppIcon name="tabler:download" :size="11" />
            <span class="node-box__text">{{ formatDisplayBytes(server.network.received) }}</span>
          </span>
        </div>
        <div class="node-box node-box--traffic" data-node-box="traffic" :title="`流量：${trafficRatioText(trafficView)}`">
          <span class="node-box__row">
            <AppIcon name="tabler:arrows-transfer-up-down" :size="11" />
            <span>流量</span>
            <span class="node-box__text" :class="`node-metric__value--${trafficTone}`">{{ trafficHeadText(trafficView) }}</span>
          </span>
          <span class="node-box__row" :class="{ 'node-metric__hint--danger': trafficCritical }">
            <span class="node-box__text">{{ trafficRatioText(trafficView) }}</span>
          </span>
        </div>
      </div>

      <div v-if="primaryProbe" class="node-probes">
        <button type="button" class="node-probe" :aria-label="`${server.name} 延迟监测`" @click.stop="emit('probe', 'latency')" @keydown.stop>
          <div class="node-probe__head" :title="latencyTitle">
            <span>延迟</span>
            <span class="node-probe__value">{{ latencyText }}</span>
          </div>
          <div
            class="node-probe__bars"
            :style="{ gridTemplateColumns: `repeat(${latencyBars.length}, minmax(0, 1fr))` }"
          >
            <AppTooltip v-for="bar in latencyBars" :key="bar.key" :content="bar.tooltip" class="node-probe__bar-tip">
              <span :class="bar.className" />
            </AppTooltip>
          </div>
        </button>
        <button type="button" class="node-probe" :aria-label="`${server.name} 丢包监测`" @click.stop="emit('probe', 'loss')" @keydown.stop>
          <div class="node-probe__head" :title="lossTitle">
            <span>丢包</span>
            <span class="node-probe__value">{{ lossText }}</span>
          </div>
          <div
            class="node-probe__bars"
            :style="{ gridTemplateColumns: `repeat(${lossBars.length}, minmax(0, 1fr))` }"
          >
            <AppTooltip v-for="bar in lossBars" :key="bar.key" :content="bar.tooltip" class="node-probe__bar-tip">
              <span :class="bar.className" />
            </AppTooltip>
          </div>
        </button>
      </div>

      <div v-if="server.tags.length > 0" class="node-tags" aria-label="节点标签">
        <span v-for="tag in server.tags" :key="tag" class="node-tag">{{ tag }}</span>
      </div>

      <div v-if="!server.online" class="node-card__offline" aria-hidden="true">
        <strong>离线</strong>
        <span>{{ offlineText }}</span>
      </div>
    </div>
  </article>
</template>
