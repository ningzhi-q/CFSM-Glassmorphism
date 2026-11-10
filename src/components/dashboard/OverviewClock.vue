<script setup lang="ts">
import { computed, onActivated, onDeactivated, watch } from 'vue'
import { useDocumentVisibility, useNow } from '@vueuse/core'
import AppTooltip from '@/components/ui/AppTooltip.vue'
import { clockDate, clockTime } from '@/utils/clock-format'

// Keep second ticks inside this card; resource totals and node trees do not
// recompute with the clock, and network report cadence cannot freeze its value.
const { now, pause, resume } = useNow({ interval: 1000, controls: true })
const visibility = useDocumentVisibility()
let active = true
function sync(): void {
  if (!active || visibility.value === 'hidden') { pause(); return }
  now.value = new Date()
  resume()
}
watch(visibility, sync)
onActivated(() => { active = true; sync() })
onDeactivated(() => { active = false; pause() })
const time = computed(() => clockTime(now.value))
const date = computed(() => clockDate(now.value))
</script>

<template>
  <AppTooltip :content="date" placement="top" as="div" class="overview-card__value-slot">
    <div class="overview-card__value">
      <time class="overview-card__number" :datetime="now.toISOString()">{{ time }}</time>
    </div>
  </AppTooltip>
</template>
