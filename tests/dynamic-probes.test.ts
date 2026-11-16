import { describe, expect, it } from 'vitest'
import { PROBE_TARGETS } from '@/constants/probes'
import { activeProbeTargets, labeledProbeTargets } from '@/domain/server-detail'
import { parseProbeTargets, probeDisplayRows } from '@/domain/probe-display'
import { normalizeHistory, normalizeServer, normalizeSiteConfig, mergeRealtimeSample } from '@/services/cfsm/adapters'
import { apiSource } from '@/services/cfsm/config'
import { toGlassServer } from '@/services/cfsm/glassmorphism-adapter'
import { dynamicProbeValues } from '@/services/cfsm/probes'
import type { DynamicProbeTarget } from '@/types/cfsm'

const source = apiSource('https://primary.example')
const ts = 1_800_000_000_000
const ids = Array.from({ length: 18 }, (_, i): DynamicProbeTarget => `p_${i}`)
const probes = Object.fromEntries(ids.map((id, i) => [id, { ts, latency: i === 1 ? null : i === 2 ? false : i, loss: i === 1 ? 100 : i === 2 ? false : 0 }]))
const catalog = { enabled: true, groups: [{ id: 'g_ipv4', name: 'IPv4', family: 'ipv4', targets: ids.map(id => ({ id, name: '线路' })) }] }

describe('动态 Ping 协议与显示', () => {
  it('公开分组验证并保留超过八个目标及三态历史', () => {
    const config = normalizeSiteConfig({ probe_catalog: catalog })
    expect(config.probeCatalog?.groups[0]?.targets).toHaveLength(18)
    const server = normalizeServer({ id: 'server', timestamp: ts, probes }, source, ts)
    const history = normalizeHistory([{ timestamp: ts, probes }])
    expect(server.latency.p_0).toBe(0)
    expect(history[0]?.latency.p_1).toBeNull()
    expect(history[0]?.latency.p_2).toBe(false)
    expect(activeProbeTargets(server, history)).toHaveLength(17)
    expect(labeledProbeTargets(ids, config.probeLabels).map(t => t.label)).toEqual(ids.map(id => `线路 (${id})`))
  })

  it('WebSocket 缺少动态字段时保留，完整快照清除已删除目标，空对象全清除', () => {
    const server = normalizeServer({ id: 'server', timestamp: ts, probes }, source, ts)
    const same = mergeRealtimeSample(server, { serverId: 'server', timestamp: ts, data: { cpu: 5 } }, ts)
    expect(same.latency).toBe(server.latency)
    const changed = mergeRealtimeSample(same, { serverId: 'server', timestamp: ts, data: { probes: { p_0: probes.p_0 } } }, ts)
    expect(changed.latency.p_0).toBe(0)
    expect(changed.latency.p_1).toBeUndefined()
    const cleared = mergeRealtimeSample(changed, { serverId: 'server', timestamp: ts, data: { probes: {} } }, ts)
    expect(Object.keys(cleared.latency).filter(id => id.startsWith('p_'))).toEqual([])
    const identical = mergeRealtimeSample(server, { serverId: 'server', timestamp: ts, data: { probes } }, ts)
    expect(identical.latency).toBe(server.latency)
  })

  it('卡片默认显示实际动态目标，手动空选择隐藏，名称来自所属站点', () => {
    const a = normalizeServer({ id: 'same-id', timestamp: ts, probes }, source, ts)
    const configA = normalizeSiteConfig({ probe_catalog: catalog })
    const configB = normalizeSiteConfig({ probe_catalog: { ...catalog, groups: [{ ...catalog.groups[0], targets: [{ id: 'p_0', name: '副站线路' }] }] } })
    const glass = toGlassServer(a, configA)
    const rows = probeDisplayRows(glass, PROBE_TARGETS.join('\n'), 'multiple', 1, ts)
    expect(rows.some(row => row.target === 'p_17')).toBe(true)
    expect(probeDisplayRows(glass, '', 'multiple', 1, ts)).toEqual([])
    expect(parseProbeTargets('p_17\np_0\np_17\np_bad.id')).toEqual(['p_17', 'p_0'])
    const b = toGlassServer(normalizeServer({ id: 'same-id', timestamp: ts, probes }, apiSource('https://secondary.example'), ts), configB)
    expect(b.latency.find(t => t.target === 'p_0')?.label).toBe('副站线路')
    expect(glass.sourceBase).not.toBe(b.sourceBase)
  })

  it('拒绝不符合约定的 ID、时间与数值', () => {
    expect(dynamicProbeValues({ ping_ct: probes.p_0, p_bad: { ts: 'bad', latency: 0 } }, 'ping')).toEqual({})
    expect(dynamicProbeValues({ p_invalid: { ts, latency: '0', loss: 101 } }, 'ping')).toEqual({ p_invalid: false })
    const invalid = normalizeSiteConfig({ probe_catalog: { enabled: true, groups: [{ id: 'invalid', name: 'bad', family: 'ipv4', targets: [] }] } })
    expect(invalid.probeCatalog?.groups).toEqual([])
  })
})
