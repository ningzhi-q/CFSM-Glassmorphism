import { describe, expect, it } from 'vitest'
import { layoutMapFlags } from '@/utils/map-marker-layout'

describe('map display positions', () => {
  it('separates nearby flags without moving geographic anchors', () => {
    const anchors = [
      { id: 'sg-a', x: 1100, y: 395 },
      { id: 'sg-b', x: 1100.3, y: 395.2 },
      { id: 'sg-c', x: 1100.6, y: 395.4 },
    ]
    const before = structuredClone(anchors)
    const flags = [...layoutMapFlags(anchors, 1440, 720, 32, 8).values()]
    for (const [index, flag] of flags.entries()) {
      for (const other of flags.slice(index + 1)) {
        expect(Math.abs(flag.x - other.x) >= 40 || Math.abs(flag.y - other.y) >= 40).toBe(true)
      }
    }
    expect(anchors).toEqual(before)
  })

  it('keeps edge flags inside the map and placement stable when inputs reorder', () => {
    const anchors = [
      { id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 },
      { id: 'c', x: 1440, y: 720 },
    ]
    const flags = layoutMapFlags(anchors, 1440, 720, 32, 8)
    expect(layoutMapFlags([...anchors].reverse(), 1440, 720, 32, 8)).toEqual(flags)
    for (const flag of flags.values()) {
      expect(flag.x).toBeGreaterThanOrEqual(20)
      expect(flag.y).toBeGreaterThanOrEqual(20)
      expect(flag.x).toBeLessThanOrEqual(1420)
      expect(flag.y).toBeLessThanOrEqual(700)
    }
  })
})
