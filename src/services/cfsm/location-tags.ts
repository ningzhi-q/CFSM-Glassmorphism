/** Operator supplied location metadata; never query or infer an IP in the theme. */
import type { ServerLocation } from '@/types/glassmorphism'

const LOCATION_TAG = /^geo-(lat|lon|country|city|source)\s+(.+)$/i
const DECIMAL = /^-?\d+(?:\.\d+)?$/

export function splitLocationTags(tags: readonly string[]): {
  tags: string[]
  location: ServerLocation | null
} {
  const values = new Map<string, string>()
  const rest: string[] = []
  for (const tag of tags) {
    const match = LOCATION_TAG.exec(tag.trim())
    if (match?.[1] && match[2]) values.set(match[1].toLowerCase(), match[2].trim())
    else rest.push(tag)
  }
  const lat = values.get('lat') ?? ''
  const lon = values.get('lon') ?? ''
  const countryCode = values.get('country')?.toUpperCase() ?? ''
  const latitude = Number(lat)
  const longitude = Number(lon)
  if (!DECIMAL.test(lat) || !DECIMAL.test(lon) || !/^[A-Z]{2}$/.test(countryCode)
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    || (latitude === 0 && longitude === 0)) {
    return { tags: [...tags], location: null }
  }
  return {
    tags: rest,
    location: {
      latitude, longitude, countryCode,
      city: values.get('city') || null,
      source: values.get('source') === 'legacy-ip' ? 'legacy-ip' : 'operator',
    },
  }
}
