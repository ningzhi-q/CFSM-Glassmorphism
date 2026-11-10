<script setup lang="ts">
import { useWindowScroll, usePreferredReducedMotion } from '@vueuse/core'
import { onUnmounted } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'

const { y } = useWindowScroll()
const reducedMotion = usePreferredReducedMotion()
let frame: number | null = null
function cancelScroll(): void {
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
  window.removeEventListener('wheel', cancelScroll)
  window.removeEventListener('touchstart', cancelScroll)
  window.removeEventListener('pointerdown', cancelScroll)
  window.removeEventListener('keydown', cancelScroll)
}
function backToTop(): void {
  cancelScroll()
  if (reducedMotion.value === 'reduce') {
    window.scrollTo({ top: 0, behavior: 'instant' })
    return
  }
  const top = window.scrollY
  const started = performance.now()
  // Explicit frames also work when page animation settings override CSS
  // scroll-behavior; only the operating system's reduced motion skips this.
  function step(now: number): void {
    const progress = Math.min(1, (now - started) / 480)
    window.scrollTo({ top: top * (1 - progress) ** 3, behavior: 'instant' })
    if (progress < 1) frame = requestAnimationFrame(step)
    else cancelScroll()
  }
  window.addEventListener('wheel', cancelScroll, { passive: true })
  window.addEventListener('touchstart', cancelScroll, { passive: true })
  window.addEventListener('pointerdown', cancelScroll, { passive: true })
  window.addEventListener('keydown', cancelScroll)
  frame = requestAnimationFrame(step)
}
onUnmounted(cancelScroll)
</script>

<template>
  <button v-if="y > 200" type="button" class="back-to-top" aria-label="返回顶部" title="返回顶部" @click="backToTop">
    <AppIcon name="tabler:chevron-up" :size="20" />
    <span>顶部</span>
  </button>
</template>
