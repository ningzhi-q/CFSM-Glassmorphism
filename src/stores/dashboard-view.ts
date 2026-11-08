import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { ALL_GROUPS } from '@/domain/dashboard'
import type { QuickControlKey } from '@/domain/theme-presentation'
import type { DashboardSort } from '@/types/glassmorphism'

/**
 * 首页的会话级浏览状态。
 *
 * 与 Komari 一致：从首页进入节点详情再返回时，搜索词、分组、排序与快捷筛选
 * 应当保持不变。用户选择的分组另存浏览器，刷新后恢复；其余筛选仅在会话中保留。
 * 浏览状态不进入后端 theme_options，视图模式仍由主题设置层拥有。
 * 视图模式（card/list）仍由主题设置层拥有，避免同一外观状态出现两个写入者。
 * 高级工具的展开状态同样属于会话浏览状态；默认收起，避免工具面板抢占首页主层级。
 */
export const DASHBOARD_GROUP_KEY = 'cfsm-glassmorphism.selected-group.v1'
function readGroup(): string {
  if (typeof window === 'undefined') return ALL_GROUPS
  try {
    const group = window.localStorage.getItem(DASHBOARD_GROUP_KEY)
    return group && group.length <= 512 ? group : ALL_GROUPS
  } catch { return ALL_GROUPS }
}

export const useDashboardViewStore = defineStore('dashboard-view', () => {
  const query = ref('')
  const selectedGroup = ref<string>(readGroup())
  watch(selectedGroup, group => {
    if (typeof window === 'undefined') return
    try { window.localStorage.setItem(DASHBOARD_GROUP_KEY, group) } catch { /* Browsing remains usable without storage. */ }
  }, { flush: 'sync' })
  const selectedCountry = ref<string | null>(null)
  const sort = ref<DashboardSort>('order')
  const activeQuickFilter = ref<QuickControlKey | null>(null)
  const advancedToolsVisible = ref(false)
  const scrollTop = ref(0)

  function clearFilters(): void {
    query.value = ''
    selectedGroup.value = ALL_GROUPS
    selectedCountry.value = null
  }

  return {
    query,
    selectedGroup,
    selectedCountry,
    sort,
    activeQuickFilter,
    advancedToolsVisible,
    scrollTop,
    clearFilters,
  }
})
