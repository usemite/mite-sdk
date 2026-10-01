import { useCallback, useEffect, useMemo, useState } from 'react'
import { Platform } from 'react-native'
import { useMite } from './MiteProvider'
import type { Release, ReleasePlatform } from './types'
import { useReleases } from './useReleases'
import { getInstalledAppVersion } from './utils/appVersion'

export interface UseWhatsNewOptions {
  /**
   * Override the installed app version. Defaults to auto-detection via
   * expo-application (or expo-constants) when available.
   */
  currentVersion?: string
  /**
   * Release platform to fetch notes for. Defaults to the current Platform.OS
   * when running on iOS or Android.
   */
  platform?: ReleasePlatform
  /**
   * Show the widget on the very first launch (no last-seen version recorded).
   * When false, the current version is silently marked as seen.
   * @default false
   */
  showOnFirstLaunch?: boolean
  /**
   * Maximum number of releases fetched when looking for matching notes.
   * @default 20
   */
  limit?: number
  /**
   * Enable the automatic once-per-new-version behavior.
   * @default true
   */
  enabled?: boolean
}

export interface UseWhatsNewResult {
  /** Whether the "What's New" content should be displayed right now. */
  visible: boolean
  /** Releases to display. Matches the current version, or recent releases when shown imperatively. */
  releases: Release[]
  /** Detected or provided app version, null when it could not be determined. */
  currentVersion: string | null
  loading: boolean
  error: Error | null
  /** Imperatively show the release notes, regardless of the last seen version. */
  show: () => void
  /** Hide the widget and mark the current version as seen. */
  dismiss: () => Promise<void>
}

export function useWhatsNew(options: UseWhatsNewOptions = {}): UseWhatsNewResult {
  const mite = useMite()
  const {
    currentVersion: currentVersionOption,
    platform,
    showOnFirstLaunch = false,
    limit = 20,
    enabled = true,
  } = options

  const currentVersion = useMemo(
    () => currentVersionOption ?? getInstalledAppVersion(),
    [currentVersionOption],
  )

  const resolvedPlatform = useMemo<ReleasePlatform | undefined>(() => {
    if (platform) {
      return platform
    }
    return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : undefined
  }, [platform])

  const [lastSeenVersion, setLastSeenVersion] = useState<string | null>(null)
  const [lastSeenLoaded, setLastSeenLoaded] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [forced, setForced] = useState(false)

  useEffect(() => {
    let cancelled = false

    mite.releases
      .lastSeen()
      .then(version => {
        if (!cancelled) {
          setLastSeenVersion(version)
          setLastSeenLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLastSeenLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [mite])

  useEffect(() => {
    if (!lastSeenLoaded || !currentVersion) {
      return
    }

    if (lastSeenVersion === null && !showOnFirstLaunch) {
      setLastSeenVersion(currentVersion)
      void mite.releases.markSeen(currentVersion)
    }
  }, [lastSeenLoaded, lastSeenVersion, currentVersion, showOnFirstLaunch, mite])

  const hasNewVersion =
    currentVersion !== null &&
    lastSeenLoaded &&
    lastSeenVersion !== currentVersion &&
    (lastSeenVersion !== null || showOnFirstLaunch)

  const shouldFetch = (enabled && hasNewVersion) || forced

  const {
    releases: fetchedReleases,
    loading,
    error,
  } = useReleases({
    platform: resolvedPlatform,
    limit,
    enabled: shouldFetch,
  })

  const matchedReleases = useMemo(
    () =>
      currentVersion === null
        ? []
        : fetchedReleases.filter(release => release.version === currentVersion),
    [fetchedReleases, currentVersion],
  )

  const releases = useMemo(() => {
    if (matchedReleases.length > 0) {
      return matchedReleases
    }
    return forced ? fetchedReleases : []
  }, [matchedReleases, fetchedReleases, forced])

  const visible =
    !dismissed &&
    !loading &&
    releases.length > 0 &&
    (forced || (enabled && hasNewVersion))

  const show = useCallback(() => {
    setDismissed(false)
    setForced(true)
  }, [])

  const dismiss = useCallback(async () => {
    setDismissed(true)
    setForced(false)

    if (currentVersion) {
      setLastSeenVersion(currentVersion)
      await mite.releases.markSeen(currentVersion)
    }
  }, [currentVersion, mite])

  return {
    visible,
    releases,
    currentVersion,
    loading,
    error,
    show,
    dismiss,
  }
}
