import { describe, expect, it } from 'vitest'
import { PROBE_TARGETS } from '@/constants/probes'
import { activeProbeTargets, labeledProbeTargets } from '@/domain/server-detail'
import { orderedCatalogTargets, parseProbeTargets, probeDisplayRows, probeDisplayGroups } from '@/domain/probe-display'
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
    expect(probeDisplayRows(glass, '', 'multiple', 1, ts, 'manual')).toEqual([])
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


describe('分组自动匹配与组内显示', () => {
  const config = normalizeSiteConfig({ probe_catalog: { enabled: true, groups: [
    { id: 'g_v4', name: 'IPv4', family: 'ipv4', targets: [{ id: 'p_a', name: '电信' }, { id: 'p_b', name: '联通' }] },
    { id: 'g_v6', name: 'IPv6', family: 'ipv6', targets: [{ id: 'p_c', name: '电信' }, { id: 'p_d', name: '联通' }] },
  ] } })
  const samples = Object.fromEntries(['p_a', 'p_b', 'p_c', 'p_d'].map(id => [id, { ts, latency: 10, loss: 0 }]))
  it('既有旧线路选择不会挡住自动模式，单栈只显示对应组、双栈显示两组', () => {
    for (const [ip_v4, ip_v6, expected] of [
      ['1', '0', ['p_a', 'p_b']], ['0', '1', ['p_c', 'p_d']], ['1', '1', ['p_a', 'p_b', 'p_c', 'p_d']], ['0', '0', []],
    ] as const) {
      const glass = toGlassServer(normalizeServer({ id: 's', timestamp: ts, ip_v4, ip_v6, probes: samples }, source, ts), config)
      const rows = probeDisplayRows(glass, 'bd\nnode_1\nnode_2', 'multiple', 1, ts, 'auto')
      expect(rows.map(row => row.target)).toEqual(expected)
      expect(rows.every(row => row.group === (row.target === 'p_a' || row.target === 'p_b' ? 'IPv4' : 'IPv6'))).toBe(true)
    }
  })
  it('排序保持组内独立，手动空选择仍能隐藏，已删除线路不被还原', () => {
    const glass = toGlassServer(normalizeServer({ id: 's', timestamp: ts, ip_v4: '1', ip_v6: '1', probes: samples }, source, ts), config)
    expect(config.probeCatalog).toBeDefined()
    if (!config.probeCatalog) throw new Error('missing catalog')
    expect(orderedCatalogTargets(config.probeCatalog, 'p_d\np_b\np_c\np_a\np_deleted')).toEqual(['p_b', 'p_a', 'p_d', 'p_c'])
    expect(probeDisplayRows(glass, 'p_d\np_b', 'multiple', 1, ts, 'manual').map(row => row.target)).toEqual(['p_b', 'p_d'])
    expect(probeDisplayRows(glass, '', 'multiple', 1, ts, 'manual')).toEqual([])
  })
  it('无动态目录的旧后端继续遵守显式旧线路选择', () => {
    const glass = toGlassServer(normalizeServer({ id: 's', timestamp: ts, ping_bd: 10, loss_bd: 0 }, source, ts), normalizeSiteConfig({}))
    expect(probeDisplayRows(glass, '', 'multiple', 1, ts, 'auto')).toEqual([])
  })

  it('网络监测的同名线路按目标身份分组，旧八路不混入，IPv6 点击可定位所属组', () => {
    const glass = toGlassServer(normalizeServer({ id: 's', timestamp: ts, ip_v4: '1', ip_v6: '1', ping_ct: 99, probes: samples }, source, ts), config)
    const groups = probeDisplayGroups(glass.probeCatalog, probeDisplayRows(glass, 'bd\nnode_1', 'multiple', 2, ts, 'auto'))
    expect(groups.map(group => [group.id, group.rows.map(row => row.target)])).toEqual([
      ['g_v4', ['p_a', 'p_b']], ['g_v6', ['p_c', 'p_d']],
    ])
    expect(groups.find(group => group.rows.some(row => row.target === 'p_c'))?.id).toBe('g_v6')
    expect(groups.flatMap(group => group.rows).some(row => row.target === 'ct')).toBe(false)
  })

  it('网络监测尊重组内手动选择与顺序，隐藏当前组不会借用另一个组或旧线路', () => {
    const glass = toGlassServer(normalizeServer({ id: 's', timestamp: ts, ip_v4: '1', ip_v6: '1', probes: samples }, source, ts), config)
    const groups = probeDisplayGroups(glass.probeCatalog, probeDisplayRows(glass, 'p_d\np_b\np_a', 'multiple', 2, ts, 'manual'))
    expect(groups.map(group => [group.id, group.rows.map(row => row.target)])).toEqual([
      ['g_v4', ['p_b', 'p_a']], ['g_v6', ['p_d']],
    ])
    expect(probeDisplayGroups(glass.probeCatalog, probeDisplayRows(glass, '', 'multiple', 2, ts, 'manual'))).toEqual([])
    expect(probeDisplayGroups(glass.probeCatalog, probeDisplayRows(glass, 'ct', 'multiple', 2, ts, 'manual'))).toEqual([])
  })

  it('网络监测单栈仅有兼容组，旧后端用单一线路页签保留原选择', () => {
    const glass = toGlassServer(normalizeServer({ id: 's', timestamp: ts, ip_v4: '0', ip_v6: '1', probes: samples }, source, ts), config)
    expect(probeDisplayGroups(glass.probeCatalog, probeDisplayRows(glass, '', 'multiple', 2, ts, 'auto')).map(group => group.id)).toEqual(['g_v6'])
    const legacy = toGlassServer(normalizeServer({ id: 'old', timestamp: ts, ping_ct: 10 }, source, ts), normalizeSiteConfig({}))
    expect(probeDisplayGroups(undefined, probeDisplayRows(legacy, 'ct', 'multiple', 2, ts)).map(group => group.rows.map(row => row.target))).toEqual([['ct']])
  })
})
