import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type Props = {
  /** Full label shown in the tooltip (e.g. full country name). */
  label: string
  children: ReactNode
  className?: string
  /**
   * `always` — tip on hover even when the visible text fits (abbreviations).
   * `truncate` — tip only when the visible text is ellipsis-clipped.
   */
  when?: 'always' | 'truncate'
}

type TipState =
  | { open: false }
  | { open: true; top: number; left: number }

/**
 * Hover tip for abbreviated / truncated place names.
 * Portals to document.body so sticky + overflow:hidden cells don’t clip it.
 * No native `title` — browsers delay that ~1s; this tip opens on pointer enter.
 */
export function NameTip({
  label,
  children,
  className = '',
  when = 'always',
}: Props) {
  const tipId = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [tip, setTip] = useState<TipState>({ open: false })

  const showTip = useCallback(() => {
    const el = wrapRef.current
    if (!el || !label.trim()) {
      setTip({ open: false })
      return
    }
    if (when === 'truncate') {
      const textEl =
        el.querySelector<HTMLElement>('.cell-truncate-text') ?? el
      if (textEl.scrollWidth <= textEl.clientWidth + 1) {
        setTip({ open: false })
        return
      }
    }
    const r = el.getBoundingClientRect()
    const tipWidth = Math.min(280, Math.max(120, label.length * 7))
    const left = Math.min(
      Math.max(8, r.left),
      window.innerWidth - tipWidth - 8,
    )
    const top = Math.min(r.bottom + 6, window.innerHeight - 36)
    setTip({ open: true, top, left })
  }, [label, when])

  const hideTip = useCallback(() => setTip({ open: false }), [])

  useLayoutEffect(() => {
    if (!tip.open) return
    const close = () => setTip({ open: false })
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [tip.open])

  if (!label.trim()) {
    return <span className={className}>{children}</span>
  }

  return (
    <span
      ref={wrapRef}
      className={`name-tip ${className}`.trim()}
      aria-label={label}
      aria-describedby={tip.open ? tipId : undefined}
      onPointerEnter={showTip}
      onPointerLeave={hideTip}
      onFocus={showTip}
      onBlur={hideTip}
    >
      {children}
      {tip.open
        ? createPortal(
            <span
              id={tipId}
              role="tooltip"
              className="name-hover-tip"
              style={{ top: tip.top, left: tip.left }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
