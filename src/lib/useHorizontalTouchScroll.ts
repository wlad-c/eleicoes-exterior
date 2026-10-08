import { useEffect, type RefObject } from 'react'

/**
 * Drive nested table pans from touch:
 * - horizontal → overflow-x scroller (scrollLeft)
 * - vertical → nearest `.table-y-scroll--virtual` parent (scrollTop), if any
 *
 * Native overflow-x often fails on iOS inside a vertical virtualizer; locking
 * touch-action to pan-x alone also killed vertical scrolling — handle both.
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
    let startTop = 0
    let yParent: HTMLElement | null = null
    let axis: 'x' | 'y' | null = null

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      startX = e.touches[0]!.clientX
      startY = e.touches[0]!.clientY
      startLeft = el.scrollLeft
      yParent = el.closest('.table-y-scroll--virtual')
      startTop = yParent?.scrollTop ?? 0
      axis = null
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const dx = startX - e.touches[0]!.clientX
      const dy = startY - e.touches[0]!.clientY
      if (axis == null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        // Prefer vertical when close — table lists are mostly scrolled on Y.
        axis =
          Math.abs(dy) > Math.abs(dx) * 1.15
            ? 'y'
            : Math.abs(dx) > Math.abs(dy) * 1.15
              ? 'x'
              : Math.abs(dy) >= Math.abs(dx)
                ? 'y'
                : 'x'
      }
      if (axis === 'y') {
        if (!yParent) return // let the page scroll
        e.preventDefault()
        const max = yParent.scrollHeight - yParent.clientHeight
        yParent.scrollTop = Math.max(0, Math.min(max, startTop + dy))
        return
      }
      e.preventDefault()
      const maxX = el.scrollWidth - el.clientWidth
      el.scrollLeft = Math.max(0, Math.min(maxX, startLeft + dx))
      onScrollLeft()
    }
    const onTouchEnd = () => {
      axis = null
      yParent = null
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
