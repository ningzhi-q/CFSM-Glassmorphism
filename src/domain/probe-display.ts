import { PROBE_TARGETS } from '@/constants/probes'
import type { ProbeTarget, ProbeValue } from '@/types/cfsm'
import type { GlassLatencySample, GlassServer } from '@/types/glassmorphism'
import { normalizeTimestampMilliseconds } from '@/utils/format'
import { windowAverage } from './probe-window'

export function parseProbeTargets(value: string): ProbeTarget[] {
  const lines = new Set(value.split(/\r?\n/).map(line => line.trim()))
  return [...lines].flatMap(line => {
    const target = PROBE_TARGETS.find(target => target === line)
    return target ? [target] : []
  })
}

export interface ProbeDisplayMetric {
  points: GlassLatencySample[]
  value: ProbeValue
  samples: number
  latest: boolean
}

export interface ProbeDisplayRow {
  target: ProbeTarget
  label: string
  latency: ProbeDisplayMetric
  loss: ProbeDisplayMetric
}

/** 同一裁切序列用于色带与平均；空洞保留，窗口无有效值时不能冒充最新平均。 */
export function probeDisplayMetric(
  raw: readonly GlassLatencySample[], target: ProbeTarget, latestValue: ProbeValue,
  hours: 1 | 2, now: number,
): ProbeDisplayMetric {
  const start = now - hours * 3_600_000
  const points = raw.flatMap(point => {
    const timestamp = normalizeTimestampMilliseconds(point.timestamp)
    if (timestamp === null || timestamp < start || timestamp > now) return []
    const value = typeof point.value === 'number'
      ? Number.isFinite(point.value) && point.value >= 0 ? point.value : null
      : point.value
    return [{ timestamp, value }]
  }).sort((a, b) => a.timestamp - b.timestamp)
  const average = windowAverage({ [target]: points }, target)
  const latest = raw.length === 0
  const validLatest = typeof latestValue === 'number' && (!Number.isFinite(latestValue) || latestValue < 0)
    ? null : latestValue
  return { points, value: latest ? validLatest : average.value, samples: average.samples, latest }
}

export function probeDisplayRows(
  server: Pick<GlassServer, 'latency' | 'history'>,
  targets: string, mode: 'single' | 'multiple', hours: 1 | 2, now: number,
): ProbeDisplayRow[] {
  const selected = parseProbeTargets(targets).flatMap(target => {
    const metric = server.latency.find(item => item.target === target)
    return metric ? [metric] : []
  })
  return (mode === 'single' ? selected.slice(0, 1) : selected).map(metric => ({
    target: metric.target,
    label: metric.label,
    latency: probeDisplayMetric(server.history.latencySeries[metric.target] ?? [], metric.target, metric.latency, hours, now),
    loss: probeDisplayMetric(server.history.packetLossSeries[metric.target] ?? [], metric.target, metric.packetLoss, hours, now),
  }))
}
