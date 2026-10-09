import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

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

function matchesQuery(option: MultiSelectOption, q: string): boolean {
  if (!q) return true
  const hay = `${option.label} ${option.searchText ?? ''}`.toLowerCase()
  return hay.includes(q)
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
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(() => new Set(value), [value])
  const labelByValue = useMemo(
    () => new Map(options.map((o) => [o.value, o.label])),
    [options],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matched = options.filter((o) => matchesQuery(o, q))
    // Keep selected options visible even when they fall outside the search.
    const selectedMissed = q
      ? options.filter((o) => selected.has(o.value) && !matchesQuery(o, q))
      : []
    const merged = selectedMissed.length
      ? [...selectedMissed, ...matched]
      : matched
    // Large lists (e.g. Brazilian municipalities) stay searchable without
    // mounting thousands of checkbox rows at once.
    const limit = q ? 200 : 120
    return merged.length > limit ? merged.slice(0, limit) : merged
  }, [options, query, selected])

  const summary = useMemo(() => {
    if (value.length === 0) return allLabel
    if (value.length === 1) {
      return labelByValue.get(value[0]) ?? allLabel
    }
    return selectedCountLabel(value.length)
  }, [value, labelByValue, allLabel, selectedCountLabel])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setQuery('')
      }
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

  return (
    <div className="filter-field text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]" ref={rootRef}>
      <span className="filter-label">{label}</span>
      <div className="multi-select mt-1">
        <button
          type="button"
          className="control multi-select-trigger w-full min-w-0 text-left text-sm font-normal normal-case tracking-normal"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => {
            if (disabled) return
            setOpen((v) => !v)
            if (open) setQuery('')
          }}
          onKeyDown={onTriggerKeyDown}
        >
          <span className="multi-select-summary truncate">{summary}</span>
          <span className="multi-select-caret" aria-hidden>
            ▾
          </span>
        </button>
        {open ? (
          <div className="multi-select-menu" role="presentation">
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
            <ul
              id={listId}
              className="multi-select-list"
              role="listbox"
              aria-multiselectable="true"
              aria-label={label}
            >
              {filtered.length === 0 ? (
                <li className="multi-select-empty">{emptyLabel}</li>
              ) : (
                filtered.map((option) => {
                  const checked = selected.has(option.value)
                  const optionId = `${listId}-${option.value}`
                  return (
                    <li key={option.value} role="option" aria-selected={checked}>
                      <label
                        htmlFor={optionId}
                        className="multi-select-option"
                      >
                        <input
                          id={optionId}
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(option.value)}
                        />
                        <span className="truncate">{option.label}</span>
                      </label>
                    </li>
                  )
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
