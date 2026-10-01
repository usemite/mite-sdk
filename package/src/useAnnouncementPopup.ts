import { useCallback, useEffect, useMemo, useState } from 'react'
import { Platform } from 'react-native'
import { useMite } from './MiteProvider'
import type { Announcement, ReleasePlatform } from './types'
import { useAnnouncements } from './useAnnouncements'

export interface UseAnnouncementPopupOptions {
  /**
   * Announcement platform to fetch for. Defaults to the current Platform.OS
   * when running on iOS or Android.
   */
  platform?: ReleasePlatform
  /**
   * Maximum number of announcements fetched.
   * @default 10
   */
  limit?: number
  /**
   * Enable the automatic show-once-per-announcement behavior.
   * @default true
   */
  enabled?: boolean
}

export interface UseAnnouncementPopupResult {
  /** Whether the announcement should be displayed right now. */
  visible: boolean
  /** The latest active announcement, or null while loading / when there is none. */
  announcement: Announcement | null
  loading: boolean
  error: Error | null
  /** Imperatively show the latest announcement, even when already seen. */
  show: () => void
  /** Hide the popup and mark the announcement as seen on this device. */
  dismiss: () => Promise<void>
}

/**
 * State machine behind the announcement popup: fetches the currently active
 * announcements, keeps a per-device seen list, and surfaces the latest
 * announcement exactly once. Only the most recent active announcement is
 * shown automatically — older unseen ones never pop up, which keeps a
 * returning user from being flooded with a backlog.
 */
export function useAnnouncementPopup(
  options: UseAnnouncementPopupOptions = {},
): UseAnnouncementPopupResult {
  const mite = useMite()
  const { platform, limit = 10, enabled = true } = options

  const resolvedPlatform = useMemo<ReleasePlatform | undefined>(() => {
    if (platform) {
      return platform
    }
    return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined
  }, [platform])

  const [seenIds, setSeenIds] = useState<string[]>([])
  const [seenLoaded, setSeenLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [forced, setForced] = useState(false)

  useEffect(() => {
    let cancelled = false

    mite.announcements
      .seenIds()
      .then(ids => {
        if (!cancelled) {
          setSeenIds(ids)
          setSeenLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSeenLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [mite])

  const { announcements, loading, error } = useAnnouncements({
    platform: resolvedPlatform,
    limit,
    enabled: enabled || forced,
  })

  const announcement = announcements[0] ?? null
  const unseen = announcement !== null && !seenIds.includes(announcement.id)

  const visible =
    !dismissed &&
    !loading &&
    seenLoaded &&
    announcement !== null &&
    (forced || (enabled && unseen))

  const show = useCallback(() => {
    setDismissed(false)
    setForced(true)
  }, [])

  const dismiss = useCallback(async () => {
    setDismissed(true)
    setForced(false)

    if (announcement) {
      setSeenIds(ids => (ids.includes(announcement.id) ? ids : [...ids, announcement.id]))
      await mite.announcements.markSeen(announcement.id)
    }
  }, [announcement, mite])

  return {
    visible,
    announcement,
    loading,
    error,
    show,
    dismiss,
  }
}
