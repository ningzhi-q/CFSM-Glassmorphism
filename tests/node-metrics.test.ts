import { describe, expect, it } from 'vitest'
import { loadCapacityPercent } from '@/domain/node-metrics'
import { probeChartPoints } from '@/domain/probe-window'

describe('labelled node metrics', () => {
  it('scales load by cores without clamping overload or confusing it with CPU utilization', () => {
    expect(loadCapacityPercent(2, 4)).toBe(50)
    expect(loadCapacityPercent(3.5, 1)).toBe(350)
    expect(loadCapacityPercent(0, 2)).toBe(0)
    for (const cores of [null, 0, -1, Infinity, NaN]) expect(loadCapacityPercent(2, cores)).toBeNull()
    for (const load of [null, -1, Infinity, NaN]) expect(loadCapacityPercent(load, 2)).toBeNull()
  })

  it('preserves timestamps and missing probe buckets while retaining genuine zero loss', () => {
    expect(probeChartPoints([
      { timestamp: 1_700_000_000, value: 0 },
      { timestamp: 1_700_000_360_000, value: null },
      { timestamp: 1_700_000_720_000, value: false },
      { timestamp: 1_700_001_080_000, value: 32 },
    ])).toEqual([
      [1_700_000_000_000, 0], [1_700_000_360_000, null], [1_700_000_720_000, null], [1_700_001_080_000, 32],
    ])
  })
})
