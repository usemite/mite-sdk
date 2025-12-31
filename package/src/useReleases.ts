import { useCallback, useEffect, useState } from 'react'
import { useMite } from './MiteProvider'
import type { GetReleasesOptions, Release } from './types'

export interface UseReleasesOptions extends GetReleasesOptions {
  enabled?: boolean
}

export interface UseReleasesResult {
  releases: Release[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useReleases(options: UseReleasesOptions = {}): UseReleasesResult {
  const mite = useMite()
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(options.enabled ?? false)
  const [error, setError] = useState<Error | null>(null)

  const fetchReleases = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await mite.getReleases(options)
      setReleases(data)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch releases')
      setError(error)
      console.error('[Mite] useReleases error:', error)
    } finally {
      setLoading(false)
    }
  }, [mite, options])

  useEffect(() => {
    if (options.enabled) {
      fetchReleases()
    }
  }, [options.enabled, fetchReleases])

  return {
    releases,
    loading,
    error,
    refetch: fetchReleases,
  }
}
