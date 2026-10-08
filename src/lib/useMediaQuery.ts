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
 * Wide enough that metric columns fit — country names need not truncate.
 * (App shell is max-w-6xl / 7xl / 96rem; 68.75rem ≈ 1100px.)
 */
export const COUNTRY_NO_TRUNCATE_MQ = '(min-width: 1100px)'

/**
 * Extra room after columns fit — Area/City can show full country names
 * instead of abbreviations.
 */
export const COUNTRY_FULL_NAME_MQ = '(min-width: 1280px)'
