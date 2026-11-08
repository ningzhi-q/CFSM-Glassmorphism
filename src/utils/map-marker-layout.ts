export interface MapMarkerAnchor {
  id: string
  x: number
  y: number
}

/** Display positions only: geographic anchors remain unchanged. */
export function layoutMapFlags(
  anchors: readonly MapMarkerAnchor[],
  width: number,
  height: number,
  size: number,
  gap: number,
): Map<string, { x: number; y: number }> {
  const placed = new Map<string, { x: number; y: number }>()
  const step = size + gap
  const inset = step / 2
  // Stable placement across changes in node counts, status and input ordering.
  for (const anchor of [...anchors].sort((a, b) => a.id.localeCompare(b.id))) {
    let position = { x: anchor.x, y: anchor.y - size * 0.8 }
    outer: for (let ring = 0; ring <= anchors.length; ring++) {
      const candidates = ring === 0 ? 1 : ring * 8
      for (let index = 0; index < candidates; index++) {
        const angle = -Math.PI / 2 + index * 2 * Math.PI / candidates
        const x = Math.min(width - inset, Math.max(inset, anchor.x + Math.cos(angle) * ring * step))
        const y = Math.min(height - inset, Math.max(inset, anchor.y - size * 0.8 + Math.sin(angle) * ring * step))
        if ([...placed.values()].every(other => Math.abs(x - other.x) >= step || Math.abs(y - other.y) >= step)) {
          position = { x, y }
          break outer
        }
      }
    }
    placed.set(anchor.id, position)
  }
  return placed
}
