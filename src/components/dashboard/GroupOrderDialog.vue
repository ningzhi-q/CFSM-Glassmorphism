<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Sortable, { type SortableEvent } from 'sortablejs'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { moveGroup, moveGroupTo, orderedGroups, parseGroupOrder } from '@/domain/group-order'
import { useAppStore } from '@/stores/app'
import { useThemeSettingsStore } from '@/stores/theme-settings'
import { message } from '@/utils/message'

const props = defineProps<{ groups: string[] }>()
const open = defineModel<boolean>('open', { required: true })
const app = useAppStore()
const theme = useThemeSettingsStore()
const order = ref('')
const saving = ref(false)
const error = ref<string | null>(null)
const list = ref<HTMLOListElement | null>(null)
const dragging = ref(false)
const announcement = ref('')
const items = computed(() => orderedGroups(props.groups, order.value))
const authorized = computed(() => app.config?.authorization === true && theme.hasBackendCredential)
let sortable: Sortable | null = null
let originalNodes: Element[] = []
let originalItems: string[] = []
let cancelled = false

function setOrder(next: string[]): void {
  const missing = parseGroupOrder(order.value).filter(item => !props.groups.includes(item))
  order.value = [...next, ...missing].join('\n')
}

function finishDrag(event: SortableEvent): void {
  // Sortable 临时移动真实 DOM；先还原，再让 Vue 按稳定的 name key 更新。
  for (const node of originalNodes) list.value?.appendChild(node)
  dragging.value = false
  const name = originalItems[event.oldDraggableIndex ?? -1]
  const target = event.newDraggableIndex
  if (!cancelled && open.value && !saving.value && name !== undefined && target !== undefined) {
    setOrder(moveGroupTo(originalItems, name, target))
    announcement.value = `${name} 已移到第 ${target + 1} 位。`
    void nextTick(() => event.item.querySelector<HTMLButtonElement>('.group-order-handle')?.focus({ preventScroll: true }))
  }
  originalNodes = []
  originalItems = []
}

function markCancelled(): void {
  cancelled = true
}

function onVisibilityChange(): void {
  if (document.hidden) cancelDrag()
}

function cancelDrag(): void {
  if (!dragging.value || !sortable) return
  cancelled = true
  // 走 Sortable 的标准取消事件路径，清理浮层、滚动计时器和文档监听。
  document.dispatchEvent(new Event('pointercancel'))
  document.dispatchEvent(new Event('touchcancel'))
  dragging.value = false
  announcement.value = '已取消拖动，顺序未改变。'
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !dragging.value) return
  event.preventDefault()
  event.stopImmediatePropagation()
  cancelDrag()
}

watch(list, element => {
  cancelDrag()
  sortable?.destroy()
  sortable = element ? new Sortable(element, {
    handle: '.group-order-handle',
    draggable: 'li',
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 4,
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150,
    ghostClass: 'group-order-ghost',
    chosenClass: 'group-order-chosen',
    fallbackClass: 'group-order-floating',
    scroll: element,
    scrollSensitivity: 48,
    scrollSpeed: 10,
    bubbleScroll: false,
    disabled: saving.value,
    onChoose() {
      cancelled = false
      originalNodes = [...element.children]
      originalItems = [...items.value]
      dragging.value = true
    },
    onUnchoose() { dragging.value = false },
    onEnd: finishDrag,
  }) : null
}, { flush: 'post' })

watch(saving, value => {
  if (value) cancelDrag()
  sortable?.option('disabled', value)
})
// 实时指标更新可能产生同内容的新数组，只有分组名称变化才取消拖动。
watch(() => JSON.stringify(props.groups), cancelDrag, { flush: 'sync' })
watch(open, value => {
  if (!value) cancelDrag()
  if (value) {
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointercancel', markCancelled, true)
    document.addEventListener('touchcancel', markCancelled, true)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', cancelDrag)
  } else {
    document.removeEventListener('keydown', onKeyDown, true)
    document.removeEventListener('pointercancel', markCancelled, true)
    document.removeEventListener('touchcancel', markCancelled, true)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('blur', cancelDrag)
  }
}, { immediate: true, flush: 'sync' })

onBeforeUnmount(() => {
  cancelDrag()
  sortable?.destroy()
  document.removeEventListener('keydown', onKeyDown, true)
  document.removeEventListener('pointercancel', markCancelled, true)
  document.removeEventListener('touchcancel', markCancelled, true)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('blur', cancelDrag)
})

watch(open, value => {
  if (value) {
    order.value = theme.runtime.groupOrder
    error.value = null
    announcement.value = ''
  }
}, { immediate: true })

function move(name: string, direction: -1 | 1): void {
  if (saving.value || dragging.value) return
  setOrder(moveGroup(items.value, name, direction))
  announcement.value = `${name} 已移到第 ${items.value.indexOf(name) + 1} 位。`
}

function saveLocal(): void {
  if (saving.value || dragging.value) return
  const stored = theme.setLocalSetting('groupOrder', order.value)
  if (stored) {
    message.success('分组顺序已保存，刷新后会保留。')
    open.value = false
  } else {
    error.value = '浏览器不允许保存，当前顺序仅在本次页面有效。'
  }
}

async function saveSite(): Promise<void> {
  const base = app.primaryBase
  if (!base || !authorized.value || saving.value || dragging.value) return
  saving.value = true
  error.value = null
  try {
    const result = await theme.saveGroupOrderBackend(base, order.value)
    if (result.config) app.applyConfig(result.config)
    if (result.saved) {
      message.success(theme.message ?? '分组顺序已设为站点默认。')
      if (result.refetchWarning) message.info('已保存，重新读取配置失败，刷新后可确认。')
      open.value = false
    } else {
      error.value = '保存没有成功，顺序仍保留在这里。请确认管理员登录或人机验证后重试。'
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppDialog v-model:open="open" title="分组自定义排序" description="拖动左侧手柄或用上下箭头调整顺序。全部节点固定在最前，新分组自动追加在后面。">
    <div class="group-order-editor">
      <div class="group-order-fixed">
        全部节点 <small>固定最前</small>
      </div>
      <ol ref="list" class="group-order-list" :class="{ 'group-order-list--dragging': dragging }" aria-label="分组显示顺序">
        <li v-for="(name, index) in items" :key="name">
          <button type="button" class="group-order-handle" :aria-label="`拖动 ${name}，也可用上下方向键调整`" :disabled="saving" @keydown.up.prevent="move(name, -1)" @keydown.down.prevent="move(name, 1)">
            <AppIcon name="tabler:grip-vertical" :size="18" />
          </button>
          <span class="group-order-name"><small>{{ index + 1 }}</small>{{ name }}</span>
          <div class="group-order-moves">
            <button type="button" :aria-label="`上移 ${name}`" :disabled="index === 0 || saving || dragging" @click="move(name, -1)">
              <AppIcon name="tabler:chevron-up" :size="16" />
            </button>
            <button type="button" :aria-label="`下移 ${name}`" :disabled="index === items.length - 1 || saving || dragging" @click="move(name, 1)">
              <AppIcon name="tabler:chevron-down" :size="16" />
            </button>
          </div>
        </li>
      </ol>
      <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
      <p v-if="error" class="group-order-error" role="alert">
        {{ error }}
      </p>
      <div class="group-order-actions">
        <button type="button" class="settings-action" :disabled="saving || dragging" @click="order = ''">
          恢复默认顺序
        </button>
        <button type="button" class="settings-action settings-action--primary" :disabled="saving || dragging" @click="saveLocal">
          保存到此浏览器
        </button>
        <button v-if="authorized" type="button" class="settings-action settings-action--backend" :disabled="saving || dragging || theme.saveState === 'saving'" @click="saveSite">
          {{ saving ? '正在保存…' : '设为站点默认' }}
        </button>
      </div>
      <p class="group-order-hint">
        浏览器保存只影响自己；登录管理员后可设为站点默认，让所有访客使用此顺序。
      </p>
    </div>
  </AppDialog>
</template>

<style scoped>
.group-order-fixed, .group-order-list li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 10px; }
.group-order-fixed { color: var(--emerald); border-bottom: 1px solid var(--glass-border); }
.group-order-fixed small, .group-order-hint { color: var(--muted); font-size: 12px; }
.group-order-list { list-style: none; margin: 8px 0 14px; padding: 0; max-height: min(46vh, 420px); overflow-y: auto; }
.group-order-list li { border-radius: 8px; }
.group-order-list li:hover { background: var(--glass-hover); }
.group-order-name { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; overflow-wrap: anywhere; }
.group-order-name small { color: var(--muted); min-width: 16px; }
.group-order-moves { display: flex; gap: 4px; flex-shrink: 0; }
.group-order-moves button, .group-order-handle { display: grid; place-items: center; flex-shrink: 0; width: 36px; height: 36px; padding: 0; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--glass-soft); color: var(--ink); cursor: pointer; }
.group-order-moves button:hover:not(:disabled) { background: var(--glass-hover); color: var(--emerald); }
.group-order-moves button:disabled { opacity: .3; cursor: default; }
.group-order-handle { border-color: transparent; background: transparent; color: var(--muted); cursor: grab; touch-action: none; }
.group-order-handle:hover:not(:disabled) { color: var(--emerald); background: var(--glass-hover); }
.group-order-handle:disabled { opacity: .3; cursor: default; }
.group-order-handle:focus-visible { outline: 2px solid var(--emerald); outline-offset: 2px; }
.group-order-list--dragging { user-select: none; }
.group-order-list .group-order-chosen { background: var(--glass-hover); }
.group-order-list .group-order-ghost { opacity: .35; outline: 1px dashed var(--emerald); }
.group-order-floating { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 10px; border-radius: 8px; background: var(--glass-strong); box-shadow: var(--shadow); list-style: none; z-index: 1000 !important; pointer-events: none; }
.group-order-floating .group-order-handle { cursor: grabbing; }
.group-order-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.group-order-actions button { flex: 1 1 140px; }
.group-order-error { color: var(--signal-1); font-size: 13px; }
.group-order-hint { margin: 12px 0 0; line-height: 1.6; }
</style>
