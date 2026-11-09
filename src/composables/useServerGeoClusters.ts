import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { buildEarthPoints } from '@/domain/advanced-tools'
import type { GlassServer } from '@/types/glassmorphism'

/**
 * Komari `useNodeGeoClusters` 的 CFSM 等价实现。
 *
 * 接受运营者在 tags 中明确提供的坐标与城市；缺失时回退到 region 中心。
 * 不在浏览器查询 IP，不把 ip_v4/ip_v6 可达性标志当作地址。
 */
export interface RegionCluster {
  id: string
  code: string
  coord: [number, number]
  label: string
  city?: string | null
  asn?: string | null
  servers: number
  onlineServers: number
  members: readonly GlassServer[]
}

export function clusterKey(cluster: RegionCluster): string {
  return [
    cluster.id,
    `${cluster.coord[0]},${cluster.coord[1]}`,
    cluster.label,
    cluster.servers,
    cluster.onlineServers,
  ].join(':')
}

export function useServerGeoClusters(source: MaybeRefOrGetter<readonly GlassServer[]>) {
  const allServers = computed(() => toValue(source))

  // Keep map snapshots stable when only CPU, traffic or probe samples change.
  // Members are map metadata snapshots; a detail action resolves the live node by key.
  const mapSnapshot = computed((previous: { fingerprint: string, servers: readonly GlassServer[] } | undefined) => {
    const servers = allServers.value
    const fingerprint = JSON.stringify(servers.map(server => [
      server.key, server.name, server.group, server.online, server.region, server.providerTags.asn,
      server.location?.latitude, server.location?.longitude, server.location?.countryCode,
      server.location?.city, server.location?.source, server.location?.citySource,
      server.location?.subdivision, server.location?.subdivisionSource,
    ]))
    return previous?.fingerprint === fingerprint ? previous : { fingerprint, servers }
  })

  const regionClusters = computed<RegionCluster[]>(() => buildEarthPoints(mapSnapshot.value.servers)
    .map((point) => ({
      id: point.id,
      code: point.code,
      coord: [point.latitude, point.longitude] as [number, number],
      label: point.region,
      city: point.city,
      asn: point.asn,
      servers: point.total,
      onlineServers: point.online,
      members: point.servers,
    }))
    // 与 Komari 一致：节点多的聚合优先，保证标记与图例编号顺序稳定。
    .sort((left, right) => right.servers - left.servers || left.code.localeCompare(right.code)))

  const totalServers = computed(() => allServers.value.length)
  const onlineServers = computed(() => allServers.value.reduce(
    (sum, server) => sum + (server.online ? 1 : 0),
    0,
  ))
  const offlineServers = computed(() => totalServers.value - onlineServers.value)
  const locatedServers = computed(() => regionClusters.value.reduce(
    (sum, cluster) => sum + cluster.servers,
    0,
  ))
  const unlocatedServers = computed(() => totalServers.value - locatedServers.value)

  return {
    regionClusters,
    totalServers,
    onlineServers,
    offlineServers,
    locatedServers,
    unlocatedServers,
    clusterKey,
  }
}
