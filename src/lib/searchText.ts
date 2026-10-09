/**
 * Fold text for accent-insensitive search matching.
 * e.g. "São Paulo" and "sao paulo" compare equal under includes().
 */
export function foldForSearch(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/** True when `hay` contains `needle`, ignoring case and diacritics. */
export function searchIncludes(hay: string, needle: string): boolean {
  if (!needle) return true
  return foldForSearch(hay).includes(foldForSearch(needle))
}
