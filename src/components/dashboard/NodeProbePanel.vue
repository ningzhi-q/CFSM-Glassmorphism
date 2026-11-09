<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import AppTooltip from '@/components/ui/AppTooltip.vue'
import type { GlassLatencySample } from '@/types/glassmorphism'
import { formatLatency, formatProbePercent } from '@/utils/format'

interface PingBar {
  key: string
  className: string
  sample: GlassLatencySample | null
}

const props = defineProps<{
  label: string
  value: string
  title: string
  accessibleLabel: string
  bars: readonly PingBar[]
  metric: 'latency' | 'loss'
}>()
const emit = defineEmits<{ select: [] }>()
// One real reka-ui tooltip per band; samples remain plain spans. CPU updates
// no longer reconcile thousands of independent Tooltip/Popper component trees.
const activeIndex = ref<number | null>(null)
const reference = shallowRef<HTMLElement>()
const content = computed(() => {
  const sample = props.bars[activeIndex.value ?? props.bars.length - 1]?.sample
  if (!sample) return '暂无探测采样'
  const value = typeof sample.value === 'number'
    ? (props.metric === 'latency' ? formatLatency(sample.value) : formatProbePercent(sample.value))
    : sample.value === false ? '探测未配置' : '该时间段暂无采样'
  return `${new Date(sample.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}\n${value}`
})

function pointAt(event: PointerEvent): void {
  if (event.pointerType === 'touch' || !(event.target instanceof HTMLElement)) return
  const bar = event.target.closest<HTMLElement>('[data-probe-bar]')
  if (!bar) {
    reset()
    return
  }
  const index = Number(bar.dataset.probeBar)
  if (!Number.isInteger(index) || !props.bars[index]) return
  activeIndex.value = index
  reference.value = bar
}

function reset(): void {
  activeIndex.value = null
  reference.value = undefined
}

watch(() => props.bars, reset)

function keydown(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  if (!(event.currentTarget instanceof HTMLElement) || props.bars.length === 0) return
  event.preventDefault()
  const index = Math.max(0, Math.min(props.bars.length - 1,
    (activeIndex.value ?? props.bars.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1)))
  activeIndex.value = index
  reference.value = event.currentTarget.querySelector<HTMLElement>(`[data-probe-bar="${index}"]`) ?? undefined
}
</script>

<template>
  <AppTooltip
    as="button"
    type="button"
    class="node-probe"
    :content="content"
    :reference="reference"
    :aria-label="accessibleLabel"
    @pointermove="pointAt"
    @focus="reset"
    @blur="reset"
    @click.stop="emit('select')"
    @keydown.stop="keydown"
  >
    <div class="node-probe__head" :title="title">
      <span class="node-probe__label">{{ label }}</span>
      <span class="node-probe__value">{{ value }}</span>
    </div>
    <div class="node-probe__bars" :style="{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }">
      <span v-for="(bar, index) in bars" :key="bar.key" :class="bar.className" :data-probe-bar="index" />
    </div>
  </AppTooltip>
</template>
