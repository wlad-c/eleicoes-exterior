import { useEffect, type RefObject } from 'react'

/**
 * Drive overflow-x scrollLeft from horizontal touch drags.
 * Needed on iOS Safari when a parent also scrolls vertically (nested
 * virtualized tables) — native overflow-x pans are often ignored.
 */
export function useHorizontalTouchScroll(
  scrollRef: RefObject<HTMLElement | null>,
  onScrollLeft: () => void,
  deps: unknown[] = [],
): void {
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let startX = 0
    let startY = 0
    let startLeft = 0
    let axis: 'x' | 'y' | null = null

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      startX = e.touches[0]!.clientX
      startY = e.touches[0]!.clientY
      startLeft = el.scrollLeft
      axis = null
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const dx = startX - e.touches[0]!.clientX
      const dy = startY - e.touches[0]!.clientY
      if (axis == null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
        axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
      }
      if (axis !== 'x') return
      e.preventDefault()
      el.scrollLeft = Math.max(
        0,
        Math.min(el.scrollWidth - el.clientWidth, startLeft + dx),
      )
      onScrollLeft()
    }
    const onTouchEnd = () => {
      axis = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies deps
  }, deps)
}
