import cityNamesUrl from '@/assets/city-gazetteer.json.gz?url'
import { installCityGazetteer } from '@/stores/city-names'
import type { CityGazetteerRecord } from '@/types/city-names'

/** Validate the static asset at its boundary just like other external JSON. */
export function decodeCityGazetteer(value: unknown): CityGazetteerRecord[] {
  if (!Array.isArray(value) || value.length > 50000) throw new Error('Invalid city gazetteer')
  return value.map((row: unknown) => {
    if (!Array.isArray(row) || row.length !== 5) throw new Error('Invalid city record')
    const [country, alias, name, latitude, longitude]: unknown[] = row
    if (typeof country !== 'string' || !/^[A-Z]{2}$/.test(country)
      || typeof alias !== 'string' || !alias || alias.length > 200
      || typeof name !== 'string' || !/\p{Script=Han}/u.test(name) || /[a-z]/i.test(name) || name.length > 200
      || typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error('Invalid city record')
    return [country, alias, name, latitude, longitude]
  })
}

export async function decodeCityAsset(response: Response): Promise<CityGazetteerRecord[]> {
  if (!response.ok) throw new Error('City asset unavailable')
  // Browsers may already decode HTTP Content-Encoding. Inspect the body rather than decoding twice.
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 4 * 1024 * 1024) throw new Error('City asset too large')
  const text = bytes[0] === 0x1f && bytes[1] === 0x8b
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(bytes)
  if (text.length > 4 * 1024 * 1024) throw new Error('City asset too large')
  const value: unknown = JSON.parse(text)
  return decodeCityGazetteer(value)
}

let loading: Promise<boolean> | null = null
/** One local theme asset, no translation/IP endpoint; metric initialization stays independent. */
export function loadCityNames(fetcher: typeof fetch = fetch): Promise<boolean> {
  if (loading) return loading
  loading = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      try {
        const response = await fetcher(cityNamesUrl, { signal: controller.signal })
        installCityGazetteer(await decodeCityAsset(response))
        return true
      } catch {
        // Unknown names retain an explicit Chinese label; server data never depends on this asset.
      } finally { clearTimeout(timeout) }
    }
    return false
  })()
  return loading
}
