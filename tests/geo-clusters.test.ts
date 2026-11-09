import { shallowRef } from 'vue'
import { describe, expect, it } from 'vitest'
import { useServerGeoClusters } from '@/composables/useServerGeoClusters'
import { apiSource } from '@/services/cfsm/config'
import { normalizeServer, toGlassServer } from '@/services/cfsm'

const node = () => toGlassServer(normalizeServer({ id: 'map', name: '节点', region: 'HK', location: {
  latitude: 22.36828, longitude: 114.13877, country: 'HK', city: 'Kwai Chung', source: 'cloudflare-ip', observed_at: 1794140000000,
} }, apiSource('https://monitor.example')), null)

describe('map metadata snapshots', () => {
  it('不为指标或观测时间更新重新聚合地图', () => {
    const servers = shallowRef([node()])
    const { regionClusters } = useServerGeoClusters(servers)
    const first = regionClusters.value
    servers.value = servers.value.map(server => ({ ...server, cpu: 80, location: server.location ? { ...server.location, observedAt: 1794140001000 } : undefined, network: { ...server.network, inSpeed: 1000 } }))
    expect(regionClusters.value).toBe(first)
    expect(first[0]?.label).toBe('葵涌')
  })
  it('保持名称、分组、在线状态、位置和节点增删的变化', () => {
    const servers = shallowRef([node()])
    const { regionClusters } = useServerGeoClusters(servers)
    const first = regionClusters.value
    servers.value = servers.value.map(server => ({ ...server, name: '新名称', group: '新分组', online: true }))
    expect(regionClusters.value).not.toBe(first)
    expect(regionClusters.value[0]).toMatchObject({ onlineServers: 1, members: [expect.objectContaining({ name: '新名称', group: '新分组' })] })
    const current = servers.value[0]
    if (!current) throw new Error('Expected map node')
    servers.value = [{ ...current, location: { latitude: 22.3167, longitude: 114.2167, countryCode: 'HK', city: 'Kwun Tong', source: 'cloudflare-ip', citySource: 'db-ip' } }]
    expect(regionClusters.value[0]).toMatchObject({ label: '观塘', coord: [22.3167, 114.2167] })
    servers.value = []
    expect(regionClusters.value).toEqual([])
  })
})
