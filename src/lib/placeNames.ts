import placeNames from '../data/place-names.json'
import type { CityResult } from '../types'
import { titleCasePlaceName } from './format'

const byTse = placeNames.byTseName as Record<string, { en: string; pt: string }>

function lookup(raw: string | undefined): { en: string; pt: string } | null {
  if (!raw) return null
  const hit = byTse[raw.toUpperCase()] || byTse[raw]
  if (hit) return hit
  const titled = titleCasePlaceName(raw)
  return { en: titled, pt: titled }
}

/** Attach bilingual display names for a TSE area/city row. */
export function withPlaceNames<T extends CityResult>(place: T): T {
  const names = lookup(place.name)
  const out: T = {
    ...place,
    ...(names ? { nameEn: names.en, namePt: names.pt } : {}),
  }
  if (place.area) {
    const areaNames = lookup(place.area)
    if (areaNames) {
      out.areaEn = areaNames.en
      out.areaPt = areaNames.pt
    }
  }
  return out
}
