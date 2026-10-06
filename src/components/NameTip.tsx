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

type Coords = { top: number; left: number }

/**
 * Hover tip for abbreviated / truncated place names.
 * Portals to document.body so sticky + overflow:hidden cells don’t clip it.
 */
export function NameTip({
  label,
  children,
  className = '',
  when = 'always',
}: Props) {
  const tipId = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<Coords>({ top: 0, left: 0 })

  const placeTip = useCallback(() => {
    const el = wrapRef.current
    if (!el || !label.trim()) {
      setOpen(false)
      return
    }
    if (when === 'truncate') {
      const textEl =
        el.querySelector<HTMLElement>('.cell-truncate-text') ?? el
      if (textEl.scrollWidth <= textEl.clientWidth + 1) {
        setOpen(false)
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
    setCoords({ top, left })
    setOpen(true)
  }, [label, when])

  useLayoutEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (!label.trim()) {
    return <span className={className}>{children}</span>
  }

  return (
    <span
      ref={wrapRef}
      className={`name-tip ${className}`.trim()}
      title={label}
      aria-describedby={open ? tipId : undefined}
      onMouseEnter={placeTip}
      onFocus={placeTip}
      onMouseLeave={() => setOpen(false)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open
        ? createPortal(
            <span
              id={tipId}
              role="tooltip"
              className="name-hover-tip"
              style={{ top: coords.top, left: coords.left }}
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
