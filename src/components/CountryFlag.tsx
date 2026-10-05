import { useState } from 'react'
import { iso2ForIso3 } from '../lib/iso'

type Props = {
  iso3: string
  /** Accessible name, e.g. country label. Empty = decorative. */
  title?: string
  className?: string
}

/**
 * Small ISO country flag from flagcdn.com (PNG), not emoji.
 * Renders nothing if the ISO3 code is unknown or the image fails.
 */
export function CountryFlag({ iso3, title, className = '' }: Props) {
  const iso2 = iso2ForIso3(iso3)
  const [failed, setFailed] = useState(false)
  if (!iso2 || failed) return null

  return (
    <img
      className={`country-flag ${className}`.trim()}
      src={`https://flagcdn.com/w40/${iso2}.png`}
      srcSet={`https://flagcdn.com/w40/${iso2}.png 1x, https://flagcdn.com/w80/${iso2}.png 2x`}
      width={20}
      height={15}
      alt=""
      title={title}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}
