import { isDynamicProbeTarget } from '@/constants/probes'
import type { DynamicProbeTarget, ProbeCatalog, ProbeValue } from '@/types/cfsm'

const record = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

export function normalizeProbeCatalog(value: unknown): ProbeCatalog {
  const result: ProbeCatalog = { enabled: false, groups: [] }
  if (!record(value) || typeof value.enabled !== 'boolean' || !Array.isArray(value.groups)) return result
  result.enabled = value.enabled
  const seen = new Set<string>()
  for (const group of value.groups) {
    if (!record(group) || typeof group.id !== 'string' || !/^g_[a-zA-Z0-9_-]{1,60}$/.test(group.id)
      || seen.has(group.id) || typeof group.name !== 'string' || !group.name.trim()
      || (group.family !== 'ipv4' && group.family !== 'ipv6' && group.family !== 'auto') || !Array.isArray(group.targets)) continue
    seen.add(group.id)
    const targets = group.targets.flatMap(target => {
      if (!record(target) || typeof target.id !== 'string' || !isDynamicProbeTarget(target.id)
        || seen.has(target.id) || typeof target.name !== 'string' || !target.name.trim()) return []
      seen.add(target.id)
      return [{ id: target.id, name: target.name.trim() }]
    })
    result.groups.push({ id: group.id, name: group.name.trim(), family: group.family, targets })
  }
  return result
}

export function dynamicProbeValues(value: unknown, metric: 'ping' | 'loss'): Partial<Record<DynamicProbeTarget, ProbeValue>> {
  if (!record(value)) return {}
  const result: Partial<Record<DynamicProbeTarget, ProbeValue>> = {}
  for (const [id, sample] of Object.entries(value)) {
    if (!isDynamicProbeTarget(id) || !record(sample) || typeof sample.ts !== 'number' || !Number.isFinite(sample.ts) || sample.ts <= 0) continue
    const raw = metric === 'ping' ? sample.latency : sample.loss
    result[id] = raw === false || raw === null ? raw
      : typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && (metric !== 'loss' || raw <= 100) ? raw : false
  }
  return result
}
