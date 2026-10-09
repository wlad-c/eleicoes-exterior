import {
  areaDisplayName,
  cityDisplayName,
  countryName,
} from './format'
import type { CityTableRow } from './cityRows'
import type { CountryResult, Lang } from '../types'

/** Stable key for an area or city option scoped to its country. */
export function placeFilterKey(countryId: string, code: string): string {
  return `${countryId}::${code}`
}

export function parsePlaceFilterKey(
  key: string,
): { countryId: string; code: string } | null {
  const sep = key.indexOf('::')
  if (sep <= 0) return null
  return { countryId: key.slice(0, sep), code: key.slice(sep + 2) }
}

export function countryFilterOptions(
  countries: CountryResult[],
  lang: Lang,
): { value: string; label: string; searchText: string }[] {
  return countries
    .map((c) => ({
      value: c.id,
      label: countryName(c, lang),
      searchText: [
        c.countryEn,
        c.countryPt,
        c.iso3,
        c.abbrevEn,
        c.abbrevPt,
      ].join(' '),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, lang === 'pt' ? 'pt' : 'en'))
}

export function areaFilterOptions(
  countries: CountryResult[],
  lang: Lang,
): { value: string; label: string; searchText: string }[] {
  const options: { value: string; label: string; searchText: string }[] = []
  for (const c of countries) {
    for (const area of c.areas ?? []) {
      const label = areaDisplayName(area, lang, {
        domestic: c.domestic,
        preferUf: true,
      })
      const country = countryName(c, lang)
      options.push({
        value: placeFilterKey(c.id, area.code),
        label: `${label} · ${country}`,
        searchText: [
          area.name,
          area.nameEn,
          area.namePt,
          area.code,
          country,
          c.countryEn,
          c.countryPt,
        ]
          .filter(Boolean)
          .join(' '),
      })
    }
  }
  return options.sort((a, b) =>
    a.label.localeCompare(b.label, lang === 'pt' ? 'pt' : 'en'),
  )
}

export function cityFilterOptions(
  countries: CountryResult[],
  lang: Lang,
  selectedAreaKeys: string[],
): { value: string; label: string; searchText: string }[] {
  const areaSet = new Set(selectedAreaKeys)
  const options: { value: string; label: string; searchText: string }[] = []
  for (const c of countries) {
    const cities = c.domestic
      ? (c.cities ?? [])
      : (c.cities?.length ? c.cities : [])
    for (const city of cities) {
      if (areaSet.size > 0 && !cityMatchesAreaKeys(city, c, areaSet)) continue
      const label = cityDisplayName(city, lang)
      const country = countryName(c, lang)
      const parent =
        city.areaEn || city.areaPt || city.area
          ? areaDisplayName(
              {
                code: city.area,
                name: city.area || '',
                nameEn: city.areaEn,
                namePt: city.areaPt,
              },
              lang,
              { domestic: c.domestic, preferUf: true },
            )
          : ''
      options.push({
        value: placeFilterKey(c.id, city.code),
        label: parent ? `${label} · ${parent}` : `${label} · ${country}`,
        searchText: [
          city.name,
          city.nameEn,
          city.namePt,
          city.code,
          city.area,
          city.areaEn,
          city.areaPt,
          country,
          c.countryEn,
          c.countryPt,
        ]
          .filter(Boolean)
          .join(' '),
      })
    }
  }
  return options.sort((a, b) =>
    a.label.localeCompare(b.label, lang === 'pt' ? 'pt' : 'en'),
  )
}

function cityMatchesAreaKeys(
  city: { code: string; area?: string; name?: string },
  country: CountryResult,
  areaKeys: Set<string>,
): boolean {
  for (const key of areaKeys) {
    const parsed = parsePlaceFilterKey(key)
    if (!parsed || parsed.countryId !== country.id) continue
    if (rowMatchesAreaCode(city, country, parsed.code)) return true
  }
  return false
}

function rowMatchesAreaCode(
  row: { code: string; area?: string; name?: string },
  country: CountryResult,
  areaCode: string,
): boolean {
  if (row.code === areaCode) return true
  if (row.code.startsWith(`${areaCode}-`)) return true
  const area = (country.areas ?? []).find((a) => a.code === areaCode)
  if (!area) {
    // Brazil UF rows use the UF as both code and name.
    if (row.area && row.area.toUpperCase() === areaCode.toUpperCase()) {
      return true
    }
    return false
  }
  if (row.area) {
    const areaName = row.area.toUpperCase()
    if (areaName === area.name.toUpperCase()) return true
    if (areaName === area.code.toUpperCase()) return true
  }
  return false
}

export function rowMatchesCountryFilter(
  countryId: string,
  selectedCountryIds: string[],
): boolean {
  return selectedCountryIds.length === 0 || selectedCountryIds.includes(countryId)
}

export function rowMatchesAreaFilter(
  row: CityTableRow,
  country: CountryResult | undefined,
  selectedAreaKeys: string[],
): boolean {
  if (selectedAreaKeys.length === 0) return true
  if (!country) return false
  for (const key of selectedAreaKeys) {
    const parsed = parsePlaceFilterKey(key)
    if (!parsed || parsed.countryId !== row.countryId) continue
    if (rowMatchesAreaCode(row, country, parsed.code)) return true
  }
  return false
}

export function rowMatchesCityFilter(
  row: CityTableRow,
  selectedCityKeys: string[],
): boolean {
  if (selectedCityKeys.length === 0) return true
  for (const key of selectedCityKeys) {
    const parsed = parsePlaceFilterKey(key)
    if (!parsed || parsed.countryId !== row.countryId) continue
    if (row.code === parsed.code) return true
    // Neighborhood rows nest under municipality codes: UF-IBGE-Zxxx
    if (row.code.startsWith(`${parsed.code}-`)) return true
  }
  return false
}

/** Drop area/city selections that no longer belong to the selected countries. */
export function prunePlaceKeysToCountries(
  keys: string[],
  countryIds: string[],
): string[] {
  if (countryIds.length === 0) return keys
  const allowed = new Set(countryIds)
  return keys.filter((key) => {
    const parsed = parsePlaceFilterKey(key)
    return parsed != null && allowed.has(parsed.countryId)
  })
}

/** Drop city selections that no longer belong to the selected areas. */
export function pruneCityKeysToAreas(
  cityKeys: string[],
  areaKeys: string[],
  countries: Map<string, CountryResult>,
): string[] {
  if (areaKeys.length === 0) return cityKeys
  const areaSet = new Set(areaKeys)
  return cityKeys.filter((key) => {
    const parsed = parsePlaceFilterKey(key)
    if (!parsed) return false
    const country = countries.get(parsed.countryId)
    if (!country) return false
    const city =
      (country.cities ?? []).find((c) => c.code === parsed.code) ??
      (country.areas ?? []).find((c) => c.code === parsed.code)
    if (!city) return false
    return cityMatchesAreaKeys(city, country, areaSet)
  })
}
