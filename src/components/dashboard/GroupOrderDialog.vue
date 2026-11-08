<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { moveGroup, orderedGroups, parseGroupOrder } from '@/domain/group-order'
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
const items = computed(() => orderedGroups(props.groups, order.value))
const authorized = computed(() => app.config?.authorization === true && theme.hasBackendCredential)

watch(open, value => {
  if (value) {
    order.value = theme.runtime.groupOrder
    error.value = null
  }
}, { immediate: true })

function move(name: string, direction: -1 | 1): void {
  const missing = parseGroupOrder(order.value).filter(item => !props.groups.includes(item))
  order.value = [...moveGroup(items.value, name, direction), ...missing].join('\n')
}

function saveLocal(): void {
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
  if (!base || !authorized.value || saving.value) return
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
  <AppDialog v-model:open="open" title="分组自定义排序" description="用上下箭头调整顺序。全部节点固定在最前，新分组自动追加在后面。">
    <div class="group-order-editor">
      <div class="group-order-fixed">
        全部节点 <small>固定最前</small>
      </div>
      <ol class="group-order-list" aria-label="分组显示顺序" aria-live="polite">
        <li v-for="(name, index) in items" :key="name">
          <span class="group-order-name"><small>{{ index + 1 }}</small>{{ name }}</span>
          <div class="group-order-moves">
            <button type="button" :aria-label="`上移 ${name}`" :disabled="index === 0 || saving" @click="move(name, -1)">
              <AppIcon name="tabler:chevron-up" :size="16" />
            </button>
            <button type="button" :aria-label="`下移 ${name}`" :disabled="index === items.length - 1 || saving" @click="move(name, 1)">
              <AppIcon name="tabler:chevron-down" :size="16" />
            </button>
          </div>
        </li>
      </ol>
      <p v-if="error" class="group-order-error" role="alert">
        {{ error }}
      </p>
      <div class="group-order-actions">
        <button type="button" class="settings-action" :disabled="saving" @click="order = ''">
          恢复默认顺序
        </button>
        <button type="button" class="settings-action settings-action--primary" :disabled="saving" @click="saveLocal">
          保存到此浏览器
        </button>
        <button v-if="authorized" type="button" class="settings-action settings-action--backend" :disabled="saving || theme.saveState === 'saving'" @click="saveSite">
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
.group-order-name { display: flex; align-items: center; gap: 10px; min-width: 0; overflow-wrap: anywhere; }
.group-order-name small { color: var(--muted); min-width: 16px; }
.group-order-moves { display: flex; gap: 4px; flex-shrink: 0; }
.group-order-moves button { display: grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--glass-soft); color: var(--ink); cursor: pointer; }
.group-order-moves button:hover:not(:disabled) { background: var(--glass-hover); color: var(--emerald); }
.group-order-moves button:disabled { opacity: .3; cursor: default; }
.group-order-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.group-order-actions button { flex: 1 1 140px; }
.group-order-error { color: var(--signal-1); font-size: 13px; }
.group-order-hint { margin: 12px 0 0; line-height: 1.6; }
</style>
