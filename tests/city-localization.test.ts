import { computed } from 'vue'
import { describe, expect, it } from 'vitest'
import { formatCityNameZh } from '@/utils/city-name'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { installCityGazetteer } from '@/stores/city-names'
import { decodeCityGazetteer, decodeCityAsset, loadCityNames } from '@/services/city-names'

const rawRecords: unknown = JSON.parse(gunzipSync(readFileSync('src/assets/city-gazetteer.json.gz')).toString())
const CITY_GAZETTEER = decodeCityGazetteer(rawRecords)
installCityGazetteer(CITY_GAZETTEER)
import { buildEarthPoints } from '@/domain/advanced-tools'
import { filterServers } from '@/domain/dashboard'
import { apiSource } from '@/services/cfsm/config'
import { normalizeServer, toGlassServer } from '@/services/cfsm'

function node(city: string) {
  return toGlassServer(normalizeServer({ id: 'city-node', region: 'US', location: {
    latitude: 37.92448, longitude: -95.39998, country: 'US', city, source: 'cloudflare-ip', observed_at: 1794146121296,
  } }, apiSource('https://monitor.example')), null)
}

describe('simplified Chinese city presentation', () => {
  it.each([
    ['Iola', 'US', '艾奥拉'], ['Sultanbeyli', 'TR', '苏丹贝伊利'], ['Tung Chung', 'HK', '东涌'],
    ['Kampong Loyang', 'SG', '罗央'], ['Chengdu', 'CN', '成都'], ['Jeddah', 'SA', '吉达'],
    ['Montréal', 'CA', '蒙特利尔'], ['Năvodari', 'RO', '纳沃达里'], ['臺北', 'TW', '台北'],
    ['聖保羅', 'BR', '圣保罗'],
  ])('formats %s as %s', (city, country, expected) => {
    expect(formatCityNameZh(city, country)).toBe(expected)
  })

  it('uses the local country-scoped gazetteer beyond the former small alias map', () => {
    expect(formatCityNameZh('Vancouver', 'CA')).toBe('温哥华')
    expect(formatCityNameZh('Manchester', 'GB')).toBe('曼彻斯特')
    expect(formatCityNameZh('Vancouver', 'ZZ')).toBe('')
    expect(CITY_GAZETTEER.length).toBeGreaterThan(10000)
    expect(CITY_GAZETTEER.every(([country, alias, name, latitude, longitude]) => (
      /^[A-Z]{2}$/.test(country) && alias.length > 0 && /\p{Script=Han}/u.test(name) && !/[a-z]/i.test(name)
      && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    ))).toBe(true)
  })

  it('preserves the original city and coordinates while displaying and searching the Chinese name', () => {
    const server = node('Iola')
    expect(server.location?.city).toBe('Iola')
    expect(buildEarthPoints([server])[0]).toMatchObject({ city: 'Iola', region: '艾奥拉', latitude: 37.92448, longitude: -95.39998 })
    expect(filterServers([server], '艾奥拉')).toHaveLength(1)
    expect(filterServers([server], 'Iola')).toHaveLength(1)
  })

  it('does not show untranslated Latin names or infer a city from coordinates', () => {
    const server = node('Unlisted Test City')
    expect(formatCityNameZh('Unlisted Test City', 'US', { latitude: 37.92448, longitude: -95.39998 })).toBe('')
    expect(buildEarthPoints([server])[0]).toMatchObject({ city: 'Unlisted Test City', region: '城市译名待补充', latitude: 37.92448 })
    expect(formatCityNameZh(null)).toBe('')
  })
})


it('rejects malformed static gazetteer data', () => {
  for (const invalid of [{}, [["US", "city", "City", 1, 2]], [["US", "city", "城市", 91, 2]], [["US", "city", "城市", 1, "2"]]]) {
    expect(() => decodeCityGazetteer(invalid)).toThrow()
  }
})


it('refreshes translated labels after loading the local compressed asset without blocking server data', async () => {
  installCityGazetteer([])
  const label = computed(() => formatCityNameZh('Manchester', 'GB'))
  expect(label.value).toBe('')
  let requests = 0
  const fetcher: typeof fetch = async () => {
    requests += 1
    return new Response(new Uint8Array(readFileSync('src/assets/city-gazetteer.json.gz')))
  }
  expect(await loadCityNames(fetcher)).toBe(true)
  expect(label.value).toBe('曼彻斯特')
  expect(await loadCityNames(fetcher)).toBe(true)
  expect(requests).toBe(1)
})


it('accepts both file gzip bytes and a body already decoded by HTTP Content-Encoding', async () => {
  const compressed = new Uint8Array(readFileSync('src/assets/city-gazetteer.json.gz'))
  const alreadyDecoded = gunzipSync(compressed).toString()
  expect(await decodeCityAsset(new Response(compressed))).toEqual(CITY_GAZETTEER)
  expect(await decodeCityAsset(new Response(alreadyDecoded, { headers: { 'Content-Encoding': 'gzip' } }))).toEqual(CITY_GAZETTEER)
  await expect(decodeCityAsset(new Response('Not found', { status: 404 }))).rejects.toThrow()
})
