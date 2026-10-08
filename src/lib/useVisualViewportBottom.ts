import { useEffect, type RefObject } from 'react'

/**
 * Keep a `position: fixed; bottom: 0` element glued to the *visible*
 * viewport bottom (above the on-screen keyboard / iPad accessory bar).
 *
 * iOS Safari otherwise parks `bottom: 0` on the layout viewport, which
 * leaves the bar floating over table rows while the keyboard is open.
 */
export function useVisualViewportBottom(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const clear = () => {
      el.style.bottom = ''
      el.style.paddingBottom = ''
    }

    if (!enabled) {
      clear()
      return
    }

    const sync = () => {
      const vv = window.visualViewport
      if (!vv) {
        el.style.bottom = '0px'
        el.style.paddingBottom = ''
        return
      }
      const inset = Math.max(
        0,
        window.innerHeight - (vv.height + vv.offsetTop),
      )
      el.style.bottom = `${inset}px`
      // Keyboard already clears the home-indicator area — avoid double inset.
      el.style.paddingBottom = inset > 0 ? '0px' : ''
    }

    sync()
    const vv = window.visualViewport
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    window.addEventListener('resize', sync)
    return () => {
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      window.removeEventListener('resize', sync)
      clear()
    }
  }, [ref, enabled])
}
