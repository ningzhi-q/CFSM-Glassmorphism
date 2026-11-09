<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Sortable, { type SortableEvent } from 'sortablejs'
import AppIcon from '@/components/ui/AppIcon.vue'
import { PROBE_TARGETS } from '@/constants/probes'
import { parseProbeTargets } from '@/domain/probe-display'
import type { ProbeLabels, ProbeTarget } from '@/types/cfsm'

const props = defineProps<{ modelValue: string; labels: Readonly<ProbeLabels> }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const selected = computed(() => parseProbeTargets(props.modelValue))
const items = computed(() => [...selected.value, ...PROBE_TARGETS.filter(target => !selected.value.includes(target))])
const list = ref<HTMLOListElement | null>(null)
const dragging = ref(false)
const announcement = ref('')
let sortable: Sortable | null = null
let originalNodes: Element[] = []
let originalItems: ProbeTarget[] = []
let cancelled = false

function update(next: readonly ProbeTarget[]): void {
  emit('update:modelValue', next.join('\n'))
}

function toggle(target: ProbeTarget): void {
  if (dragging.value) return
  update(selected.value.includes(target) ? selected.value.filter(item => item !== target) : [...selected.value, target])
}

function move(target: ProbeTarget, direction: -1 | 1): void {
  if (dragging.value) return
  const next = [...selected.value]
  const index = next.indexOf(target)
  const position = index + direction
  if (index < 0 || position < 0 || position >= next.length) return
  next.splice(index, 1)
  next.splice(position, 0, target)
  update(next)
  announcement.value = `${props.labels[target]} 已移到第 ${position + 1} 位。`
}

function finishDrag(event: SortableEvent): void {
  // 先还原 Sortable 移动的 DOM，再由 Vue 按 target key 更新。
  for (const node of originalNodes) list.value?.appendChild(node)
  dragging.value = false
  const target = originalItems[event.oldDraggableIndex ?? -1]
  const position = event.newDraggableIndex
  if (!cancelled && target !== undefined && position !== undefined) {
    const next = originalItems.filter(item => item !== target)
    next.splice(position, 0, target)
    update(next)
    announcement.value = `${props.labels[target]} 已移到第 ${position + 1} 位。`
    void nextTick(() => event.item.querySelector<HTMLButtonElement>('.probe-order-handle')?.focus({ preventScroll: true }))
  }
  originalNodes = []
  originalItems = []
}

function markCancelled(): void { cancelled = true }
function cancelDrag(): void {
  if (!dragging.value || !sortable) return
  cancelled = true
  document.dispatchEvent(new Event('pointercancel'))
  document.dispatchEvent(new Event('touchcancel'))
  dragging.value = false
  announcement.value = '已取消拖动，顺序未改变。'
}
function onVisibilityChange(): void { if (document.hidden) cancelDrag() }
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
    handle: '.probe-order-handle', draggable: 'li.is-selected',
    forceFallback: true, fallbackOnBody: true, fallbackTolerance: 4,
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150,
    ghostClass: 'probe-order-ghost', chosenClass: 'probe-order-chosen', fallbackClass: 'probe-order-floating',
    scroll: element, scrollSensitivity: 48, scrollSpeed: 10, bubbleScroll: false,
    onChoose() {
      cancelled = false
      originalNodes = [...element.children]
      originalItems = [...selected.value]
      dragging.value = true
    },
    onUnchoose() { dragging.value = false },
    onEnd: finishDrag,
  }) : null
}, { flush: 'post' })

watch(() => props.modelValue, cancelDrag, { flush: 'sync' })
onMounted(() => {
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('pointercancel', markCancelled, true)
  document.addEventListener('touchcancel', markCancelled, true)
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('blur', cancelDrag)
})
onBeforeUnmount(() => {
  cancelDrag()
  sortable?.destroy()
  document.removeEventListener('keydown', onKeyDown, true)
  document.removeEventListener('pointercancel', markCancelled, true)
  document.removeEventListener('touchcancel', markCancelled, true)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('blur', cancelDrag)
})
</script>

<template>
  <div class="probe-order-editor">
    <ol ref="list" class="probe-order-list" :class="{ 'is-dragging': dragging }" aria-label="探测线路显示顺序">
      <li v-for="target in items" :key="target" :class="{ 'is-selected': selected.includes(target) }" :data-probe-target="target">
        <button type="button" class="probe-order-handle" :disabled="!selected.includes(target)" :aria-label="`拖动 ${labels[target]}，也可用上下方向键调整`" @keydown.up.prevent="move(target, -1)" @keydown.down.prevent="move(target, 1)">
          <AppIcon name="tabler:grip-vertical" :size="18" />
        </button>
        <label class="probe-order-name">
          <input type="checkbox" :checked="selected.includes(target)" :disabled="dragging" @change="toggle(target)">
          <span>{{ labels[target] }}</span><small>{{ target }}</small>
        </label>
        <div class="probe-order-moves">
          <button type="button" :aria-label="`上移 ${labels[target]}`" :disabled="selected.indexOf(target) <= 0 || dragging" @click="move(target, -1)">
            <AppIcon name="tabler:chevron-up" :size="16" />
          </button>
          <button type="button" :aria-label="`下移 ${labels[target]}`" :disabled="!selected.includes(target) || selected.indexOf(target) === selected.length - 1 || dragging" @click="move(target, 1)">
            <AppIcon name="tabler:chevron-down" :size="16" />
          </button>
        </div>
      </li>
    </ol>
    <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
    <div class="probe-order-actions">
      <button type="button" class="settings-action" :disabled="dragging" @click="update(PROBE_TARGETS)">
        恢复默认选择
      </button>
      <button type="button" class="settings-action" :disabled="dragging" @click="update([])">
        全部取消
      </button>
    </div>
  </div>
</template>

<style scoped>
.probe-order-list { list-style: none; margin: 0 0 10px; padding: 0; }
.probe-order-list li, .probe-order-floating { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 8px; }
.probe-order-list li:hover { background: var(--glass-hover); }
.probe-order-name { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; overflow-wrap: anywhere; cursor: pointer; }
.probe-order-name input { width: 16px; height: 16px; flex-shrink: 0; accent-color: var(--emerald); }
.probe-order-name small { font-size: 11px; color: var(--muted); }
.probe-order-moves { display: flex; gap: 4px; flex-shrink: 0; }
.probe-order-moves button, .probe-order-handle { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; padding: 0; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--glass-soft); color: var(--ink); cursor: pointer; }
.probe-order-handle { border-color: transparent; background: transparent; color: var(--muted); cursor: grab; touch-action: none; }
.probe-order-moves button:disabled, .probe-order-handle:disabled { opacity: .3; cursor: default; }
.probe-order-handle:focus-visible { outline: 2px solid var(--emerald); outline-offset: 2px; }
.probe-order-list.is-dragging { user-select: none; }
.probe-order-chosen { background: var(--glass-hover); }
.probe-order-ghost { opacity: .35; outline: 1px dashed var(--emerald); }
.probe-order-floating { background: var(--glass-strong); box-shadow: var(--shadow); list-style: none; z-index: 1000 !important; pointer-events: none; }
.probe-order-actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 430px) { .probe-order-name { gap: 6px; } .probe-order-name small { display: none; } }
</style>
