import { useEffect, useState, type RefObject } from 'react'
import { useMediaQuery } from './useMediaQuery'

/** Matches the single-column filter stack — phones only. */
export const MOBILE_SCROLL_COLLAPSE_MQ = '(max-width: 640px)'

const DELTA_PX = 12
const TOP_REVEAL_PX = 48
/** Ignore scrollY jumps caused by the chrome height animation itself. */
const TOGGLE_LOCK_MS = 360

/**
 * On small screens, collapse a sticky chrome while scrolling down and
 * expand it again on scroll up (or when focus moves into the chrome).
 */
export function useMobileScrollCollapse(
  ref: RefObject<HTMLElement | null>,
): boolean {
  const enabled = useMediaQuery(MOBILE_SCROLL_COLLAPSE_MQ)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setCollapsed(false)
      return
    }

    let lastY = window.scrollY
    let ticking = false
    let lockUntil = 0
    let current = false

    const setCollapsedSafe = (next: boolean) => {
      if (next === current) return
      current = next
      lockUntil = performance.now() + TOGGLE_LOCK_MS
      setCollapsed(next)
      // Re-baseline after layout adjusts scrollY from the height change.
      requestAnimationFrame(() => {
        lastY = window.scrollY
      })
    }

    const apply = () => {
      ticking = false
      const y = window.scrollY
      const now = performance.now()
      if (now < lockUntil) {
        lastY = y
        return
      }

      const delta = y - lastY
      const el = ref.current
      // Keep filters visible until the chrome is actually stuck at the top.
      const stuck = el ? el.getBoundingClientRect().top <= 1 : false

      if (y <= TOP_REVEAL_PX || !stuck) {
        setCollapsedSafe(false)
        lastY = y
        return
      }

      if (Math.abs(delta) < DELTA_PX) return

      setCollapsedSafe(delta > 0)
      lastY = y
    }

    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(apply)
      }
    }

    const el = ref.current
    const onFocusIn = () => setCollapsedSafe(false)

    window.addEventListener('scroll', onScroll, { passive: true })
    el?.addEventListener('focusin', onFocusIn)

    return () => {
      window.removeEventListener('scroll', onScroll)
      el?.removeEventListener('focusin', onFocusIn)
    }
  }, [enabled, ref])

  return enabled ? collapsed : false
}
