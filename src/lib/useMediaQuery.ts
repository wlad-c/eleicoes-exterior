import { useEffect, useState } from 'react'

/** Subscribe to a CSS media query; updates on change. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

/**
 * Wide enough that metric columns fit — Country table names need not truncate.
 * (App shell is max-w-6xl / 7xl / 96rem; 68.75rem ≈ 1100px.)
 */
export const COUNTRY_NO_TRUNCATE_MQ = '(min-width: 1100px)'

/**
 * Very small screens — country column shows flag only (no abbrev text).
 * Matches the filter-row mobile breakpoint.
 */
export const COUNTRY_FLAG_ONLY_MQ = '(max-width: 640px)'

/**
 * Narrow / mid viewports — Area tab prefers Brazilian UF codes over
 * ellipsis-truncated state names; Bairro parent line uses `SP · Zona 372`.
 */
export const AREA_UF_COMPACT_MQ = '(max-width: 1100px)'

export type CountryLabelMode = 'flag' | 'abbrev'

/** Area/City country column: flag-only on narrow viewports, else abbreviation. */
export function useCountryLabelMode(): CountryLabelMode {
  const flagOnly = useMediaQuery(COUNTRY_FLAG_ONLY_MQ)
  return flagOnly ? 'flag' : 'abbrev'
}

/** True when the Area place column is too narrow for full UF names. */
export function useAreaUfCompact(): boolean {
  return useMediaQuery(AREA_UF_COMPACT_MQ)
}
