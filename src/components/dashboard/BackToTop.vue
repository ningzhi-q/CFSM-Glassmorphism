<script setup lang="ts">
import { useWindowScroll, usePreferredReducedMotion } from '@vueuse/core'
import AppIcon from '@/components/ui/AppIcon.vue'

const { y } = useWindowScroll()
const reducedMotion = usePreferredReducedMotion()
function backToTop(): void {
  window.scrollTo({ top: 0, behavior: reducedMotion.value === 'reduce' ? 'instant' : 'smooth' })
}
</script>

<template>
  <button v-if="y > 200" type="button" class="back-to-top" aria-label="返回顶部" title="返回顶部" @click="backToTop">
    <AppIcon name="tabler:chevron-up" :size="20" />
    <span>顶部</span>
  </button>
</template>
