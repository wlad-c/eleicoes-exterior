import { useEffect, useState, type RefObject } from 'react'
import { useMediaQuery } from './useMediaQuery'

/** Matches the single-column filter stack — phones only. */
export const MOBILE_SCROLL_COLLAPSE_MQ = '(max-width: 640px)'

const DELTA_PX = 10
const TOP_REVEAL_PX = 48

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

    const apply = () => {
      ticking = false
      const y = window.scrollY
      const delta = y - lastY

      if (y <= TOP_REVEAL_PX) {
        setCollapsed(false)
        lastY = y
        return
      }

      if (Math.abs(delta) < DELTA_PX) return

      setCollapsed(delta > 0)
      lastY = y
    }

    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(apply)
      }
    }

    const el = ref.current
    const onFocusIn = () => setCollapsed(false)

    window.addEventListener('scroll', onScroll, { passive: true })
    el?.addEventListener('focusin', onFocusIn)

    return () => {
      window.removeEventListener('scroll', onScroll)
      el?.removeEventListener('focusin', onFocusIn)
    }
  }, [enabled, ref])

  return enabled ? collapsed : false
}
