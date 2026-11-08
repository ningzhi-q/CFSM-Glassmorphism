import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { normalizeServer, toGlassServer } from '@/services/cfsm'
import { apiSource } from '@/services/cfsm/config'
import { splitLocationTags } from '@/services/cfsm/location-tags'
import { buildEarthPoints, serverMapLocation } from '@/domain/advanced-tools'
import { filterServers, summarizeServers } from '@/domain/dashboard'
import { useDashboardViewStore } from '@/stores/dashboard-view'
import { countryName } from '@/utils/country-name'

const source = apiSource('https://monitor.example')
const tags = ['geo-lat 34.05', 'geo-lon -118.24', 'geo-country US', 'geo-city 洛杉矶', 'geo-source legacy-ip']

function server(id: string, group: string, tagged: string[] = tags) {
  return toGlassServer(normalizeServer({
    id, name: id, region: 'US', server_group: group, tags: tagged.join(','),
    ip_v4: '1', is_online: '1', net_in_speed: 10, net_out_speed: 20,
  }, source), null)
}

describe('explicit operator location metadata', () => {
  it('preserves user tags, parses signed coordinates and hides valid metadata from decorative tags', () => {
    const parsed = splitLocationTags(['production', ...tags])
    expect(parsed.tags).toEqual(['production'])
    expect(parsed.location).toEqual({ latitude: 34.05, longitude: -118.24, countryCode: 'US', city: '洛杉矶', source: 'legacy-ip' })
    expect(server('a', 'one').location).toEqual(parsed.location)
  })

  it('rejects incomplete, out of range, nonnumeric, and placeholder coordinates', () => {
    for (const invalid of [tags.filter(tag => !tag.startsWith('geo-lon')), ['geo-lat 91', 'geo-lon 10', 'geo-country US'], ['geo-lat 1bad', 'geo-lon 10', 'geo-country US'], ['geo-lat 0', 'geo-lon 0', 'geo-country US']]) {
      expect(splitLocationTags(invalid).location).toBeNull()
    }
    expect(server('Tokyo only in name', 'one', ['JP']).location).toBeNull()
  })

  it('separates cities in one country while keeping an unlocated node at a country centre', () => {
    const points = buildEarthPoints([
      server('la1', 'one'), server('la2', 'one'),
      server('ny', 'one', ['geo-lat 40.71', 'geo-lon -74.00', 'geo-country US', 'geo-city 纽约']),
      server('region-only', 'one', []),
    ])
    expect(points).toHaveLength(3)
    expect(points.find(point => point.city === '洛杉矶')).toMatchObject({ total: 2, online: 2, latitude: 34.05 })
    expect(points.find(point => point.city === '纽约')?.total).toBe(1)
    expect(points.find(point => !point.city)?.region).toBe('美国')
  })

  it('keeps registered Japan and Malaysia out of legacy US IP clusters', () => {
    const japan = { ...server('japan', 'one'), region: 'JP' }
    const malaysia = { ...server('malaysia', 'one'), region: 'MY' }
    const usa = server('usa', 'one')
    expect(serverMapLocation(japan)).toMatchObject({ code: 'JP', city: null, source: 'country' })
    expect(serverMapLocation(malaysia)).toMatchObject({ code: 'MY', city: null, source: 'country' })
    expect(buildEarthPoints([japan, malaysia, usa]).map(point => point.code).sort()).toEqual(['JP', 'MY', 'US'])
    expect(buildEarthPoints([japan])[0]?.region).toBe('日本')
  })

  it('honours explicitly supplied operator locations and supports unknown registered regions', () => {
    const explicit = { ...server('moved', 'one', tags.filter(tag => !tag.includes('source'))), region: 'JP' }
    expect(serverMapLocation(explicit)).toMatchObject({ code: 'US', city: '洛杉矶', source: 'operator' })
    expect(serverMapLocation({ ...server('unknown', 'one'), region: null })?.code).toBe('US')
  })

  it('uses the same selected group for map clusters and totals, and supports searching cities', () => {
    const all = [server('a', 'one'), server('b', 'two')]
    const scoped = filterServers(all, '', 'one')
    expect(summarizeServers(scoped)).toMatchObject({ total: 1, online: 1, networkInSpeed: 10 })
    expect(buildEarthPoints(scoped)[0]?.total).toBe(1)
    expect(filterServers(all, '洛杉矶')).toHaveLength(2)
    expect(countryName('HK')).toBe('香港')
  })

  it('clears country selection together with the other browsing filters', () => {
    setActivePinia(createPinia())
    const view = useDashboardViewStore()
    view.selectedCountry = 'US'
    view.query = '洛杉矶'
    view.clearFilters()
    expect(view.selectedCountry).toBeNull()
    expect(view.query).toBe('')
  })
})
