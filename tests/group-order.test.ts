import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { moveGroup, orderedGroups, parseGroupOrder } from '@/domain/group-order'
import { useThemeSettingsStore } from '@/stores/theme-settings'
import { resolveThemeSettings, THEME_SETTINGS_STORAGE_KEY } from '@/theme/settings'
import { STORAGE_KEYS } from '@/services/cfsm/config'

class MemoryStorage implements Storage {
  values = new Map<string, string>()
  get length(): number { return this.values.size }
  clear(): void { this.values.clear() }
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null }
  removeItem(key: string): void { this.values.delete(key) }
  setItem(key: string, value: string): void { this.values.set(key, value) }
}

describe('分组自定义顺序', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('保留名称中的空格逗号，去重并排除全部节点标识', () => {
    expect(parseGroupOrder(' Foo Bar\r\n独角鲸\nFoo Bar\nA,B\n__all__\n')).toEqual(['Foo Bar', '独角鲸', 'A,B'])
  })

  it('指定项优先，忽略不存在的项，新增组追加且默认顺序稳定', () => {
    const groups = ['A', 'B', 'C', '未分组', '新分组']
    expect(orderedGroups(groups, 'C\n已停用\nA\nC\n__all__')).toEqual(['C', 'A', 'B', '未分组', '新分组'])
    expect(orderedGroups(groups, '')).toEqual(groups)
    expect(groups[0]).toBe('A')
  })

  it('边界移动不丢失分组且不修改原数组', () => {
    const groups = ['A', 'B', 'C']
    expect(moveGroup(groups, 'B', -1)).toEqual(['B', 'A', 'C'])
    expect(moveGroup(groups, 'B', 1)).toEqual(['A', 'C', 'B'])
    expect(moveGroup(groups, 'A', -1)).toEqual(groups)
    expect(moveGroup(groups, 'C', 1)).toEqual(groups)
    expect(moveGroup(groups, '不存在', 1)).toEqual(groups)
  })

  it('本地保存可以在新会话恢复，清空后恢复默认', () => {
    const storage = new MemoryStorage()
    const first = useThemeSettingsStore()
    first.initialize(storage)
    first.hydrateBackend({ groupOrder: 'B\nA' })
    expect(first.setLocalSetting('groupOrder', 'C\nA')).toBe(true)
    setActivePinia(createPinia())
    const second = useThemeSettingsStore()
    second.initialize(storage)
    second.hydrateBackend({ groupOrder: 'B\nA' })
    expect(second.runtime.groupOrder).toBe('C\nA')
    second.setLocalSetting('groupOrder', '')
    expect(second.runtime.groupOrder).toBe('')
    expect(storage.getItem(THEME_SETTINGS_STORAGE_KEY)).toContain('groupOrder')
    expect(resolveThemeSettings({ groupOrder: 'A\nA' }, { groupOrder: 123 }).groupOrder).toBe('A')
  })

  it('设为站点默认只改变顺序，保留最新后端配置和其它本地偏好', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEYS.jwt, 'test-credential')
    const store = useThemeSettingsStore()
    store.initialize(storage)
    store.hydrateBackend({ themeMode: 'system', groupOrder: 'A\nB' })
    store.setLocalSetting('themeMode', 'dark')
    store.setLocalSetting('groupOrder', 'A\nB')
    let posted: Record<string, unknown> = {}
    let reads = 0
    const latest = { themeMode: 'light', alertTitle: '最新公告', futureOption: { keep: true }, groupOrder: 'A\nB' }
    const fetcher: typeof fetch = async (input, init) => {
      if (String(input).endsWith('/api/theme_options')) {
        const body: { theme_options: Record<string, unknown> } = JSON.parse(String(init?.body))
        posted = body.theme_options
        return new Response(JSON.stringify({ success: true, theme_options: posted }))
      }
      reads += 1
      return new Response(JSON.stringify({ authorization: true, preferred_theme: 'auto', theme_options: reads === 1 ? latest : posted }))
    }
    const outcome = await store.saveGroupOrderBackend('https://status.example', 'B\nA', { storage, fetcher })
    expect(outcome.saved).toBe(true)
    expect(reads).toBe(2)
    expect(posted).toMatchObject({ themeMode: 'light', alertTitle: '最新公告', futureOption: { keep: true }, groupOrder: 'B\nA' })
    expect(store.runtime.themeMode).toBe('dark')
    expect(store.localOverrides.groupOrder).toBeUndefined()
    expect(store.runtime.groupOrder).toBe('B\nA')
  })

  it('保存失败不修改已保存顺序和本地覆盖', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEYS.jwt, 'test-credential')
    const store = useThemeSettingsStore()
    store.initialize(storage)
    store.hydrateBackend({ groupOrder: 'B\nA' })
    store.setLocalSetting('groupOrder', 'A\nB')
    const outcome = await store.saveGroupOrderBackend('https://status.example', 'C\nA', {
      storage, fetcher: async () => new Response('{}', { status: 401 }),
    })
    expect(outcome.saved).toBe(false)
    expect(store.runtime.groupOrder).toBe('A\nB')
    expect(store.backendRaw.groupOrder).toBe('B\nA')
    expect(store.saveError?.kind).toBe('unauthorized')
  })

  it('等待站点回读期间拒绝并发保存，避免旧回包覆盖新顺序', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEYS.jwt, 'test-credential')
    const store = useThemeSettingsStore()
    store.initialize(storage)
    let reads = 0
    let writes = 0
    let release: (() => void) | undefined
    let reached: (() => void) | undefined
    const waiting = new Promise<void>(resolve => { reached = resolve })
    const fetcher: typeof fetch = async input => {
      if (String(input).endsWith('/api/theme_options')) {
        writes += 1
        return new Response(JSON.stringify({ success: true, theme_options: { groupOrder: 'B\nA' } }))
      }
      reads += 1
      if (reads === 2) {
        reached?.()
        await new Promise<void>(resolve => { release = resolve })
      }
      return new Response(JSON.stringify({ preferred_theme: 'auto', theme_options: { groupOrder: 'B\nA' } }))
    }
    const first = store.saveGroupOrderBackend('https://status.example', 'B\nA', { storage, fetcher })
    await waiting
    expect(store.saveState).toBe('saving')
    expect((await store.saveGroupOrderBackend('https://status.example', 'A\nB', { storage, fetcher })).saved).toBe(false)
    expect((await store.saveBackend('https://status.example', { storage, fetcher })).saved).toBe(false)
    expect(writes).toBe(1)
    release?.()
    expect((await first).saved).toBe(true)
  })
})
