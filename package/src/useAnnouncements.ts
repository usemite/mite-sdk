import { useCallback, useEffect, useState } from 'react'
import { useMite } from './MiteProvider'
import type { Announcement, GetAnnouncementsOptions } from './types'

export interface UseAnnouncementsOptions extends GetAnnouncementsOptions {
  enabled?: boolean
}

export interface UseAnnouncementsResult {
  announcements: Announcement[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useAnnouncements(
  options: UseAnnouncementsOptions = {},
): UseAnnouncementsResult {
  const mite = useMite()
  const { platform, limit, enabled = false } = options
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await mite.announcements.list({ platform, limit })
      setAnnouncements(data)
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to fetch announcements')
      setError(error)
      console.error('[Mite] useAnnouncements error:', error)
    } finally {
      setLoading(false)
    }
  }, [mite, platform, limit])

  useEffect(() => {
    if (enabled) {
      fetchAnnouncements()
    }
  }, [enabled, fetchAnnouncements])

  return {
    announcements,
    loading,
    error,
    refetch: fetchAnnouncements,
  }
}
