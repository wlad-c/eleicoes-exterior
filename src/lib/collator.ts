import type { Lang } from '../types'

const cache = new Map<string, Intl.Collator>()

/** Cached Collator — far cheaper than repeated `String#localeCompare` on large sorts. */
export function collatorFor(lang: Lang): Intl.Collator {
  const locale = lang === 'pt' ? 'pt' : 'en'
  let c = cache.get(locale)
  if (!c) {
    c = new Intl.Collator(locale, { sensitivity: 'base' })
    cache.set(locale, c)
  }
  return c
}
