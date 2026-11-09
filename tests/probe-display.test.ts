import { describe, expect, it } from 'vitest'
import { parseProbeTargets, probeDisplayMetric, probeDisplayRows } from '@/domain/probe-display'
import { createThemeOptionsSnapshot, resolveThemeSettings } from '@/theme/settings'
import type { GlassLatencySample, GlassServer } from '@/types/glassmorphism'

const NOW = 1_800_000_000_000
const HOUR = 3_600_000
const server: Pick<GlassServer, 'latency' | 'history'> = {
  latency: [
    { target: 'ct', label: '主站电信', latency: 99, packetLoss: 9 },
    { target: 'node_2', label: '副站东京', latency: 70, packetLoss: 0 },
  ],
  history: { latencySeries: { ct: [{ timestamp: NOW, value: 10 }] }, packetLossSeries: {} },
}

describe('可配置的首页探测展示', () => {
  it('只接受八个真实目标，去重并保留用户顺序', () => {
    expect(parseProbeTargets('node_2\r\nct\nnode_2\nIPv6\n cu ')).toEqual(['node_2', 'ct', 'cu'])
    expect(parseProbeTargets('')).toEqual([])
  })

  it('多行按选择排序，跳过未配置目标并保留所属站点名称', () => {
    const rows = probeDisplayRows(server, 'node_4\nnode_2\nct', 'multiple', 1, NOW)
    expect(rows.map(row => [row.target, row.label])).toEqual([['node_2', '副站东京'], ['ct', '主站电信']])
    expect(rows[0]?.loss.value).toBe(0)
    expect(rows[0]?.loss.latest).toBe(true)
    expect(rows[1]?.latency.value).toBe(10)
  })

  it('单行取排序后的首个可用目标，全部取消会隐藏', () => {
    expect(probeDisplayRows(server, 'cu\nnode_2\nct', 'single', 2, NOW).map(row => row.target)).toEqual(['node_2'])
    expect(probeDisplayRows(server, '', 'multiple', 2, NOW)).toEqual([])
  })

  it('按当前时间裁切同一窗口，保留缺口与零值，丢弃无效与未来时间', () => {
    const raw: GlassLatencySample[] = [
      { timestamp: NOW - HOUR * 1.5, value: 90 },
      { timestamp: NOW - HOUR, value: 20 },
      { timestamp: (NOW - HOUR / 2) / 1000, value: null },
      { timestamp: NOW - 1000, value: false },
      { timestamp: NOW, value: 0 },
      { timestamp: NOW + 1000, value: 900 },
      { timestamp: Number.NaN, value: 900 },
    ]
    const short = probeDisplayMetric(raw, 'ct', 999, 1, NOW)
    expect(short.points.map(point => point.value)).toEqual([20, null, false, 0])
    expect(short).toMatchObject({ value: 10, samples: 2, latest: false })
    expect(probeDisplayMetric(raw, 'ct', 999, 2, NOW)).toMatchObject({ value: 110 / 3, samples: 3 })
  })

  it('已有窗口全过期、全缺口或值无效时不能回落最新值', () => {
    const windows: GlassLatencySample[][] = [
      [{ timestamp: NOW - HOUR * 3, value: 20 }],
      [{ timestamp: NOW, value: null }, { timestamp: NOW, value: false }],
      [{ timestamp: NOW, value: Number.NaN }, { timestamp: NOW, value: -1 }],
    ]
    for (const raw of windows) {
      expect(probeDisplayMetric(raw, 'ct', 99, 1, NOW)).toMatchObject({ value: null, samples: 0, latest: false })
    }
    expect(probeDisplayMetric([], 'ct', 99, 1, NOW)).toMatchObject({ value: 99, latest: true })
  })

  it('三层设置归一化与完整保存均包含新字段，空选择不被默认值覆盖', () => {
    const backend = { probeDisplayMode: 'multiple', probeTargets: 'node_2\nct', probeWindowHours: 1, futureOption: 'keep' }
    const runtime = resolveThemeSettings(backend, { probeTargets: '', probeWindowHours: 3 })
    expect(runtime).toMatchObject({ probeDisplayMode: 'multiple', probeTargets: '', probeWindowHours: 1 })
    expect(createThemeOptionsSnapshot(runtime, backend)).toMatchObject({ probeDisplayMode: 'multiple', probeTargets: '', probeWindowHours: 1, futureOption: 'keep' })
    expect(resolveThemeSettings({}, {})).toMatchObject({ probeDisplayMode: 'single', probeWindowHours: 2 })
  })
})
