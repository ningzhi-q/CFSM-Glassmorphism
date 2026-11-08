import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it } from 'vitest'
import ServerCard from '@/components/dashboard/ServerCard.vue'
import type { GlassServer } from '@/types/glassmorphism'

function server(overrides: Partial<GlassServer> = {}): GlassServer {
  return {
    key: 'example:node', id: 'node', sourceBase: 'https://example.invalid', sourceLabel: 'Example',
    name: 'Example Node', group: '', tags: [], providerTags: { asn: null, org: null }, region: 'HK',
    price: '12', billingCycle: 'year', currency: 'USD', expireDate: null, trafficLimit: null,
    trafficCalculationType: null, showPrice: true, showExpire: true, showTraffic: true,
    online: true, sortOrder: null, cpu: 5, load: { one: 1.11, five: 2.22, fifteen: 3.33 },
    memory: { used: null, total: null, percentage: null },
    swap: { used: null, total: null, percentage: null },
    disk: { used: null, total: null, percentage: null },
    network: { inSpeed: null, outSpeed: null, received: null, transmitted: null, monthlyReceived: null, monthlyTransmitted: null },
    processes: null, tcpConnections: null, udpConnections: null, latency: [],
    history: { latencySeries: {}, packetLossSeries: {} }, gpus: [],
    connectivity: { ipv4: null, ipv6: null }, operatingSystem: null, architecture: null,
    cpuInfo: null, cpuCores: null, kernelVersion: null, agentVersion: null, bootTime: null, lastUpdated: null,
    ...overrides,
  }
}

async function renderCard(overrides: Partial<GlassServer> = {}, priceVisible = true) {
  const html = await renderToString(createSSRApp(ServerCard, {
    server: server(overrides), showSource: false, density: 'comfortable', favorite: false, priceVisible,
  }))
  const boxes = [...html.matchAll(/<div class="node-box[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
  expect(boxes).toHaveLength(3)
  return { html, thirdBox: boxes[2]![1]! }
}

describe('首页节点卡流量与到期信息', () => {
  it('公开到期信息移到芯片，第三个盒子始终显示流量', async () => {
    const { html, thirdBox } = await renderCard({ expireDate: '2030-01-01' })
    const chips = /class="node-card__chips">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''
    expect(chips).toContain('剩余')
    expect(chips).toContain('剩余价值 USD12')
    expect(thirdBox).toContain('流量')
    expect(thirdBox).not.toContain('1.11')
    expect(thirdBox).not.toContain('剩余')
    expect(html).toContain('data-node-metric="load"')
    expect(html).toContain('5分 2.22 · 15分 3.33')
  })

  it.each([null, 'not-a-date'])('未知到期日不生成剩余价值或虚假的零金额：%s', async expireDate => {
    const { html, thirdBox } = await renderCard({ expireDate })
    expect(html).not.toContain('剩余价值')
    expect(html).not.toMatch(/USD\s*0/)
    expect(thirdBox).toContain('流量')
    expect(html).toContain('5分 2.22 · 15分 3.33')
  })

  it('隐藏到期日期时所有芯片和信息盒都不泄露日期或剩余价值', async () => {
    const { html } = await renderCard({ showExpire: false, expireDate: '2030-01-01' })
    expect(html).not.toContain('剩余')
    expect(html).not.toContain('2030')
  })

  it.each([
    [{ price: '0', expireDate: null }, true],
    [{ price: '-1', expireDate: null }, true],
    [{ price: null, expireDate: null }, true],
    [{ price: 'invalid', expireDate: null }, true],
    [{ price: '12', expireDate: null }, false],
    [{ price: '12', showPrice: false, expireDate: null }, true],
  ] as const)('免费、无价、无效价或隐藏价格均保留单独负载格与流量盒 %#', async (overrides, priceVisible) => {
    const { html, thirdBox } = await renderCard(overrides, priceVisible)
    expect(html).toContain('data-node-metric="load"')
    expect(html).toContain('5分 2.22 · 15分 3.33')
    expect(thirdBox).toContain('流量')
    expect(thirdBox).not.toContain('1.11')
    expect(thirdBox).not.toContain('2.22 / 3.33')
  })
})
