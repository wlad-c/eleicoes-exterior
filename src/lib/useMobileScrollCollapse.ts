import { useEffect, useState, type RefObject } from 'react'
import { useMediaQuery } from './useMediaQuery'

/** Matches the single-column filter stack — phones only. */
export const MOBILE_SCROLL_COLLAPSE_MQ = '(max-width: 640px)'

/** Net downward travel required before hiding the chrome. */
const COLLAPSE_THRESHOLD_PX = 56
/**
 * Net upward travel required before showing it again.
 * Larger than collapse — collapsing the chrome shortens the document and
 * the browser often nudges scrollY upward, which must not re-open it.
 */
const EXPAND_THRESHOLD_PX = 96
/** Always show filters near the top of the page. */
const TOP_REVEAL_PX = 32
/**
 * After a toggle, ignore scroll entirely until the height animation and
 * any scroll-anchoring adjustments have finished.
 */
const TOGGLE_LOCK_MS = 600

/**
 * On small screens, collapse a sticky chrome while scrolling down and
 * expand it again on scroll up (or when focus moves into the chrome).
 *
 * Uses accumulated delta + hysteresis so layout-driven scrollY jumps from
 * the height animation cannot flip the chrome open/closed every frame.
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
    let accum = 0
    let lastDir = 0 as -1 | 0 | 1
    let ticking = false
    let lockUntil = 0
    let current = false

    const baseline = () => {
      lastY = window.scrollY
      accum = 0
      lastDir = 0
    }

    const setCollapsedSafe = (next: boolean) => {
      if (next === current) return
      current = next
      lockUntil = performance.now() + TOGGLE_LOCK_MS
      setCollapsed(next)
      // Re-baseline across the next two frames after layout adjusts scrollY.
      baseline()
      requestAnimationFrame(() => {
        baseline()
        requestAnimationFrame(baseline)
      })
    }

    const apply = () => {
      ticking = false
      const y = Math.max(0, window.scrollY)
      const now = performance.now()

      if (now < lockUntil) {
        baseline()
        return
      }

      const delta = y - lastY
      lastY = y

      if (y <= TOP_REVEAL_PX) {
        if (current) setCollapsedSafe(false)
        else baseline()
        return
      }

      const el = ref.current
      if (!el) return

      // Only start collapsing once the chrome is stuck at the viewport top.
      // When already collapsed, do NOT auto-expand on !stuck — height:0 can
      // make geometry flicker and was causing open/close thrash.
      const stuck = el.getBoundingClientRect().top <= 2
      if (!stuck && !current) {
        accum = 0
        lastDir = 0
        return
      }

      if (delta === 0) return

      const dir: -1 | 1 = delta > 0 ? 1 : -1
      if (dir !== lastDir) {
        accum = delta
        lastDir = dir
      } else {
        accum += delta
      }

      if (!current && accum >= COLLAPSE_THRESHOLD_PX) {
        setCollapsedSafe(true)
        return
      }

      if (current && accum <= -EXPAND_THRESHOLD_PX) {
        setCollapsedSafe(false)
      }
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
