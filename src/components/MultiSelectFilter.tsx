import { useVirtualizer } from '@tanstack/react-virtual'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { foldForSearch } from '../lib/searchText'
import { COUNTRY_FLAG_ONLY_MQ, useMediaQuery } from '../lib/useMediaQuery'

export type MultiSelectOption = {
  value: string
  label: string
  /** Extra text matched by the search box (not shown). */
  searchText?: string
}

type Props = {
  label: string
  /** Shown in the closed trigger when nothing is selected. */
  allLabel: string
  /** Shown in the closed trigger when multiple values are selected (e.g. "3 selected"). */
  selectedCountLabel: (count: number) => string
  searchPlaceholder: string
  emptyLabel: string
  options: MultiSelectOption[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}

const OPTION_ROW_PX = 34
const VIRTUALIZE_AT = 60
const MENU_MAX_PX = 288 // 18rem

function matchesQuery(option: MultiSelectOption, qFolded: string): boolean {
  if (!qFolded) return true
  const hay = `${option.label} ${option.searchText ?? ''}`
  return foldForSearch(hay).includes(qFolded)
}

type MenuPos = {
  top: number
  left: number
  width: number
  maxHeight: number
}

/** Searchable multi-select dropdown for table filters. */
export function MultiSelectFilter({
  label,
  allLabel,
  selectedCountLabel,
  searchPlaceholder,
  emptyLabel,
  options,
  value,
  onChange,
  disabled = false,
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const isNarrow = useMediaQuery(COUNTRY_FLAG_ONLY_MQ)

  const selected = useMemo(() => new Set(value), [value])
  const labelByValue = useMemo(
    () => new Map(options.map((o) => [o.value, o.label])),
    [options],
  )

  const filtered = useMemo(() => {
    const qFolded = foldForSearch(query.trim())
    const matched = options.filter((o) => matchesQuery(o, qFolded))
    // Keep selected options visible even when they fall outside the search.
    if (!qFolded) return matched
    const selectedMissed = options.filter(
      (o) => selected.has(o.value) && !matchesQuery(o, qFolded),
    )
    return selectedMissed.length ? [...selectedMissed, ...matched] : matched
  }, [options, query, selected])

  const shouldVirtualize = filtered.length >= VIRTUALIZE_AT
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => OPTION_ROW_PX,
    overscan: 12,
    enabled: open && shouldVirtualize,
  })
  const virtualItems = shouldVirtualize ? virtualizer.getVirtualItems() : null
  // Empty getVirtualItems() is truthy as [] — don't render a blank list while
  // the scroll element is still measuring after open / query changes.
  const renderVirtual =
    shouldVirtualize && virtualItems != null && virtualItems.length > 0

  const summary = useMemo(() => {
    if (value.length === 0) return allLabel
    if (value.length === 1) {
      return labelByValue.get(value[0]) ?? allLabel
    }
    return selectedCountLabel(value.length)
  }, [value, labelByValue, allLabel, selectedCountLabel])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  useLayoutEffect(() => {
    if (!open || !isNarrow) {
      setMenuPos(null)
      return
    }
    const sync = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const r = trigger.getBoundingClientRect()
      const gap = 4
      const spaceBelow = window.innerHeight - r.bottom - gap - 8
      const spaceAbove = r.top - gap - 8
      const preferBelow = spaceBelow >= Math.min(MENU_MAX_PX, 160) || spaceBelow >= spaceAbove
      const maxHeight = Math.max(
        120,
        Math.min(MENU_MAX_PX, preferBelow ? spaceBelow : spaceAbove),
      )
      const top = preferBelow
        ? r.bottom + gap
        : Math.max(8, r.top - gap - maxHeight)
      setMenuPos({
        top,
        left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)),
        width: r.width,
        maxHeight,
      })
    }
    sync()
    window.addEventListener('resize', sync)
    // Capture scroll from sticky chrome / page so the menu tracks the trigger.
    window.addEventListener('scroll', sync, true)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [open, isNarrow])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      close()
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      // Focus search after open so typing filters immediately.
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.scrollTop = 0
    if (shouldVirtualize) {
      // Remeasure after the filtered set changes so rows stay in sync.
      requestAnimationFrame(() => virtualizer.measure())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure on query/open only
  }, [open, query, filtered.length, shouldVirtualize])

  function toggle(optionValue: string) {
    if (selected.has(optionValue)) {
      onChange(value.filter((v) => v !== optionValue))
      return
    }
    onChange([...value, optionValue])
  }

  function clearAll() {
    onChange([])
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!disabled) setOpen(true)
    }
  }

  const menuStyle: CSSProperties | undefined =
    isNarrow && menuPos
      ? {
          position: 'fixed',
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxHeight,
          zIndex: 95,
        }
      : undefined

  const menu = open ? (
    <div
      ref={menuRef}
      className={`multi-select-menu${isNarrow ? ' multi-select-menu--portal' : ''}`}
      role="presentation"
      style={menuStyle}
    >
      <div className="multi-select-search-wrap">
        <input
          ref={searchRef}
          className="control multi-select-search w-full min-w-0"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
        />
        {value.length > 0 ? (
          <button
            type="button"
            className="multi-select-clear-all"
            onClick={clearAll}
          >
            {allLabel}
          </button>
        ) : null}
      </div>
      <div
        id={listId}
        ref={listRef}
        className="multi-select-list"
        role="listbox"
        aria-multiselectable="true"
        aria-label={label}
      >
        {filtered.length === 0 ? (
          <div className="multi-select-empty">{emptyLabel}</div>
        ) : renderVirtual ? (
          <div
            className="multi-select-virtual"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualItems!.map((item) => {
              const option = filtered[item.index]!
              const checked = selected.has(option.value)
              const optionId = `${listId}-${option.value}`
              return (
                <div
                  key={option.value}
                  className="multi-select-virtual-row"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${item.size}px`,
                    transform: `translateY(${item.start}px)`,
                  }}
                  role="option"
                  aria-selected={checked}
                >
                  <label htmlFor={optionId} className="multi-select-option">
                    <input
                      id={optionId}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(option.value)}
                    />
                    <span className="truncate">{option.label}</span>
                  </label>
                </div>
              )
            })}
          </div>
        ) : (
          filtered.map((option) => {
            const checked = selected.has(option.value)
            const optionId = `${listId}-${option.value}`
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={checked}
              >
                <label htmlFor={optionId} className="multi-select-option">
                  <input
                    id={optionId}
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(option.value)}
                  />
                  <span className="truncate">{option.label}</span>
                </label>
              </div>
            )
          })
        )}
      </div>
      {filtered.length > 0 ? (
        <p className="multi-select-count" aria-live="polite">
          {filtered.length === options.length
            ? String(filtered.length)
            : `${filtered.length} / ${options.length}`}
        </p>
      ) : null}
    </div>
  ) : null

  return (
    <div
      className="filter-field text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]"
      ref={rootRef}
    >
      <span className="filter-label">{label}</span>
      <div className="multi-select mt-1">
        <button
          ref={triggerRef}
          type="button"
          className="control multi-select-trigger w-full min-w-0 text-left text-sm font-normal normal-case tracking-normal"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => {
            if (disabled) return
            if (open) close()
            else setOpen(true)
          }}
          onKeyDown={onTriggerKeyDown}
        >
          <span className="multi-select-summary truncate">{summary}</span>
          <span className="multi-select-caret" aria-hidden>
            ▾
          </span>
        </button>
        {open && isNarrow && menuPos
          ? createPortal(menu, document.body)
          : !isNarrow
            ? menu
            : null}
      </div>
    </div>
  )
}
