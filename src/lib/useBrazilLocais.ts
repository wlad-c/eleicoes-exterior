import { startTransition, useEffect, useState } from 'react'
import type { ElectionRound } from './electionRound'
import {
  fetchAllBrazilLocais,
  fetchBrazilLocaisUf,
  type BrazilLocalRow,
} from './brazilLocais'

export type BrazilLocaisState = {
  locais: BrazilLocalRow[] | null
  loading: boolean
  error: string | null
  retry: () => void
}

/**
 * Lazy-load voting-place (local) runoff points for the Nexo-style map.
 * Prefer a single UF when the map is drilled into a state; otherwise load all.
 */
export function useBrazilLocais(opts: {
  enabled: boolean
  round: ElectionRound
  uf?: string | null
}): BrazilLocaisState {
  const [locais, setLocais] = useState<BrazilLocalRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!opts.enabled || opts.round !== '2') {
      startTransition(() => {
        setLocais(null)
        setLoading(false)
        setError(null)
      })
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const run = opts.uf
      ? fetchBrazilLocaisUf(opts.uf)
      : fetchAllBrazilLocais()
    void run
      .then((rows) => {
        if (cancelled) return
        if (!rows || !rows.length) {
          setLocais(null)
          setError('empty')
        } else {
          setLocais(rows)
          setError(null)
        }
      })
      .catch(() => {
        if (cancelled) return
        setLocais(null)
        setError('fetch')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [opts.enabled, opts.round, opts.uf, tick])

  return {
    locais,
    loading,
    error,
    retry: () => setTick((n) => n + 1),
  }
}
