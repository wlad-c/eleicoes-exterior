import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { TableMetricCol } from './tableColumns'

const DRAG_THRESHOLD_PX = 6

type DragOptions = {
  /**
   * Only start a reorder drag from `.col-drag-handle`.
   * Use in scrollable checklists so taps/scrolls are not captured.
   */
  handleOnly?: boolean
}

/**
 * Pointer-based column reorder (mouse + touch).
 * HTML5 drag-and-drop is unreliable on iOS; this uses setPointerCapture instead.
 * Shared order is applied by the caller (same handler for country/area/city).
 *
 * Capture is deferred until the pointer moves past a threshold so a tap can
 * still toggle checkboxes and a vertical flick can still scroll a list.
 */
export function useColumnDrag(
  onReorder: ((from: TableMetricCol, to: TableMetricCol) => void) | undefined,
  options: DragOptions = {},
) {
  const handleOnly = options.handleOnly === true
  const dragFrom = useRef<TableMetricCol | null>(null)
  const overCol = useRef<TableMetricCol | null>(null)
  const activeEl = useRef<HTMLElement | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)
  const suppressClick = useRef(false)
  const pointerId = useRef<number | null>(null)

  function clearHighlights() {
    document
      .querySelectorAll('.col-dragging, .col-drag-over')
      .forEach((el) => {
        el.classList.remove('col-dragging', 'col-drag-over')
      })
  }

  function highlightOver(clientX: number, clientY: number) {
    const el = document.elementFromPoint(clientX, clientY)
    const target = el?.closest('[data-col-id]') as HTMLElement | null
    document
      .querySelectorAll('.col-drag-over')
      .forEach((n) => n.classList.remove('col-drag-over'))
    const id = target?.dataset.colId as TableMetricCol | undefined
    if (id && id !== dragFrom.current) {
      target?.classList.add('col-drag-over')
      overCol.current = id
    } else {
      overCol.current = null
    }
  }

  function endDrag(id: number | null) {
    const from = dragFrom.current
    const to = overCol.current
    if (activeEl.current && id != null) {
      try {
        activeEl.current.releasePointerCapture(id)
      } catch {
        /* already released */
      }
    }
    clearHighlights()
    dragFrom.current = null
    overCol.current = null
    activeEl.current = null
    start.current = null
    pointerId.current = null
    if (moved.current) suppressClick.current = true
    moved.current = false
    if (from && to && from !== to && onReorder) onReorder(from, to)
  }

  function dragProps(col: TableMetricCol) {
    if (!onReorder) return {}
    return {
      draggable: false as const,
      'data-col-id': col,
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        const t = e.target as HTMLElement
        if (t.closest('input, a, button, select, textarea')) return
        if (handleOnly && !t.closest('.col-drag-handle')) return
        dragFrom.current = col
        overCol.current = null
        moved.current = false
        start.current = { x: e.clientX, y: e.clientY }
        activeEl.current = e.currentTarget
        pointerId.current = e.pointerId
        // Do NOT setPointerCapture yet — keep scroll/tap working until drag.
      },
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
        if (!dragFrom.current || !start.current) return
        if (pointerId.current != null && e.pointerId !== pointerId.current) {
          return
        }
        const dx = e.clientX - start.current.x
        const dy = e.clientY - start.current.y
        if (!moved.current) {
          if (dx * dx + dy * dy < DRAG_THRESHOLD_PX ** 2) return
          moved.current = true
          activeEl.current?.classList.add('col-dragging')
          try {
            activeEl.current?.setPointerCapture(e.pointerId)
          } catch {
            /* ignore */
          }
        }
        highlightOver(e.clientX, e.clientY)
      },
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
        if (!dragFrom.current) return
        if (pointerId.current != null && e.pointerId !== pointerId.current) {
          return
        }
        if (moved.current) highlightOver(e.clientX, e.clientY)
        endDrag(e.pointerId)
      },
      onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
        if (pointerId.current != null && e.pointerId !== pointerId.current) {
          return
        }
        moved.current = false
        endDrag(null)
      },
      onClickCapture: (e: React.MouseEvent) => {
        if (!suppressClick.current) return
        e.preventDefault()
        e.stopPropagation()
        suppressClick.current = false
      },
    }
  }

  return { dragProps }
}
