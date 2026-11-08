import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ALL_GROUPS } from '@/domain/dashboard'
import { DASHBOARD_GROUP_KEY, useDashboardViewStore } from '@/stores/dashboard-view'

afterEach(() => vi.unstubAllGlobals())
describe('remember selected group', () => {
  it('restores the selected group on reload without persisting other filters', () => {
    const saved = new Map<string, string>([[DASHBOARD_GROUP_KEY, '柒云']])
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) } })
    setActivePinia(createPinia())
    const first = useDashboardViewStore()
    expect(first.selectedGroup).toBe('柒云')
    first.selectedGroup = '独角鲸'
    first.query = 'private search'
    setActivePinia(createPinia())
    const reloaded = useDashboardViewStore()
    expect(reloaded.selectedGroup).toBe('独角鲸')
    expect(reloaded.query).toBe('')
    expect(saved.size).toBe(1)
    reloaded.clearFilters()
    expect(saved.get(DASHBOARD_GROUP_KEY)).toBe(ALL_GROUPS)
  })

  it('stays usable when browser storage is disabled', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw Error('disabled') }, setItem: () => { throw Error('disabled') } } })
    setActivePinia(createPinia())
    const view = useDashboardViewStore()
    expect(view.selectedGroup).toBe(ALL_GROUPS)
    view.selectedGroup = 'example'
    expect(view.selectedGroup).toBe('example')
  })
})
