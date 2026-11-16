import { PROBE_TARGETS, isProbeTarget, isDynamicProbeTarget } from '@/constants/probes'
import type { ProbeCatalog, ProbeTarget, ProbeValue } from '@/types/cfsm'
import type { GlassLatencySample, GlassServer } from '@/types/glassmorphism'
import { normalizeTimestampMilliseconds } from '@/utils/format'
import { windowAverage } from './probe-window'

export function parseProbeTargets(value: string): ProbeTarget[] {
  const lines = new Set(value.split(/\r?\n/).map(line => line.trim()))
  return [...lines].flatMap(line => {
    return isProbeTarget(line) ? [line] : []
  })
}

/** Catalog order groups targets; saved order applies only within each group. */
export function orderedCatalogTargets(catalog: ProbeCatalog, value: string): ProbeTarget[] {
  const saved = parseProbeTargets(value)
  return catalog.groups.flatMap(group => {
    const ids = group.targets.map(target => target.id)
    return [...saved.filter(id => ids.some(target => target === id)), ...ids.filter(id => !saved.includes(id))]
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
  group: string | null
  label: string
  latency: ProbeDisplayMetric
  loss: ProbeDisplayMetric
}

export interface ProbeDisplayGroup {
  id: string
  label: string
  rows: ProbeDisplayRow[]
}

/** Group by catalog identity: identical labels across families are separate targets. */
export function probeDisplayGroups(catalog: ProbeCatalog | undefined, rows: ProbeDisplayRow[]): ProbeDisplayGroup[] {
  if (!catalog?.enabled) return rows.length ? [{ id: '__all__', label: '探测线路', rows }] : []
  return catalog.groups.flatMap(group => {
    const members = rows.filter(row => group.targets.some(target => target.id === row.target))
    return members.length ? [{ id: group.id, label: group.name, rows: members }] : []
  })
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
  server: Pick<GlassServer, 'latency' | 'history'> & Partial<Pick<GlassServer, 'probeCatalog' | 'connectivity'>>,
  targets: string, mode: 'single' | 'multiple', hours: 1 | 2, now: number, selectionMode: 'auto' | 'manual' = 'auto',
): ProbeDisplayRow[] {
  const defaults = PROBE_TARGETS.join('\n')
  const catalog = server.probeCatalog?.enabled ? server.probeCatalog : undefined
  const eligible = catalog?.groups.filter(group => group.family === 'auto'
    ? server.connectivity?.ipv4 !== '0' || server.connectivity?.ipv6 !== '0'
    : server.connectivity?.[group.family] !== '0').flatMap(group => group.targets.map(target => target.id))
  const ordered = catalog
    ? orderedCatalogTargets(catalog, targets).filter(target => eligible?.some(id => id === target) && (selectionMode === 'auto' || parseProbeTargets(targets).includes(target)))
    : targets === defaults ? [...parseProbeTargets(targets), ...server.latency.filter(metric => isDynamicProbeTarget(metric.target)).map(metric => metric.target)] : parseProbeTargets(targets)
  const selected = ordered.flatMap(target => {
    const metric = server.latency.find(item => item.target === target)
    return metric ? [metric] : []
  })
  return (mode === 'single' ? selected.slice(0, 1) : selected).map(metric => ({
    target: metric.target,
    group: catalog?.groups.find(group => group.targets.some(target => target.id === metric.target))?.name ?? null,
    label: metric.label,
    latency: probeDisplayMetric(server.history.latencySeries[metric.target] ?? [], metric.target, metric.latency, hours, now),
    loss: probeDisplayMetric(server.history.packetLossSeries[metric.target] ?? [], metric.target, metric.packetLoss, hours, now),
  }))
}
