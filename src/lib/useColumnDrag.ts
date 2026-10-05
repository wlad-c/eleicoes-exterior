import { useRef, type DragEvent, type MouseEvent } from 'react'
import type { TableMetricCol } from './tableColumns'

/**
 * HTML5 drag helpers for reordering metric columns.
 * Suppresses the header sort click that would otherwise fire after a drop.
 */
export function useColumnDrag(
  onReorder: ((from: TableMetricCol, to: TableMetricCol) => void) | undefined,
) {
  const dragFrom = useRef<TableMetricCol | null>(null)
  const dragged = useRef(false)

  function dragProps(col: TableMetricCol) {
    if (!onReorder) return {}
    return {
      draggable: true as const,
      onDragStart: (e: DragEvent) => {
        dragFrom.current = col
        dragged.current = false
        e.dataTransfer.setData('text/plain', col)
        e.dataTransfer.effectAllowed = 'move'
        ;(e.currentTarget as HTMLElement).classList.add('col-dragging')
      },
      onDragEnd: (e: DragEvent) => {
        ;(e.currentTarget as HTMLElement).classList.remove('col-dragging')
        dragFrom.current = null
      },
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        ;(e.currentTarget as HTMLElement).classList.add('col-drag-over')
      },
      onDragLeave: (e: DragEvent) => {
        ;(e.currentTarget as HTMLElement).classList.remove('col-drag-over')
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        ;(e.currentTarget as HTMLElement).classList.remove('col-drag-over')
        const from = (e.dataTransfer.getData('text/plain') ||
          dragFrom.current) as TableMetricCol | null
        if (!from || from === col) return
        dragged.current = true
        onReorder(from, col)
      },
      onClickCapture: (e: MouseEvent) => {
        if (!dragged.current) return
        e.preventDefault()
        e.stopPropagation()
        dragged.current = false
      },
    }
  }

  return { dragProps }
}
