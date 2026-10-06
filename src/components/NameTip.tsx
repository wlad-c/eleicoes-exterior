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

/** True when label text is wider than the visible box (ellipsis). */
function isEllipsisTruncated(root: HTMLElement): boolean {
  const textEl =
    root.querySelector<HTMLElement>('.cell-truncate-text') ?? root

  // Range width is more reliable than scrollWidth for nested flex/block text.
  try {
    const range = document.createRange()
    range.selectNodeContents(textEl)
    const textWidth = range.getBoundingClientRect().width
    if (textWidth > textEl.clientWidth + 0.5) return true
  } catch {
    /* ignore Range failures in odd hosts */
  }

  let node: HTMLElement | null = textEl
  while (node) {
    if (node.scrollWidth > node.clientWidth + 0.5) return true
    if (node.tagName === 'TD' || node.tagName === 'TH') break
    node = node.parentElement
  }
  return false
}

/**
 * Hover tip for abbreviated / truncated place names.
 * Portals to document.body so sticky + overflow:hidden cells don’t clip it.
 * Uses the shared `.app-tip` look (same as the map tip).
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
    if (when === 'truncate' && !isEllipsisTruncated(el)) {
      setTip({ open: false })
      return
    }
    const r = el.getBoundingClientRect()
    const tipWidth = Math.min(260, Math.max(96, label.length * 7))
    const left = Math.min(
      Math.max(8, r.left),
      window.innerWidth - tipWidth - 8,
    )
    // Prefer below the cell; flip above if near the bottom chrome / Total row.
    const below = r.bottom + 8
    const above = r.top - 8
    const top =
      below + 28 > window.innerHeight - 48
        ? Math.max(8, above - 28)
        : below
    setTip({ open: true, top, left })
  }, [label, when])

  const hideTip = useCallback(() => setTip({ open: false }), [])

  useLayoutEffect(() => {
    if (!tip.open) return
    const close = () => setTip({ open: false })
    // Bubble only — capture would close on nested table-x-scroll noise.
    window.addEventListener('scroll', close)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close)
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
              className="app-tip app-tip--fixed"
              style={{ top: tip.top, left: tip.left }}
            >
              <span className="app-tip-title">{label}</span>
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
