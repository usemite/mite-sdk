import { getInstalledAppVersion } from './appVersion'

interface ExpoUpdatesModule {
  updateId?: string | null
  channel?: string | null
  runtimeVersion?: string | null
  isEmbeddedLaunch?: boolean
}

/**
 * The build a report or error came from. Mite matches it to a release, so a
 * report lands on the version (or EAS Update) the user was actually running.
 */
export interface BuildInfo {
  app_version?: string
  eas_update_id?: string
  channel?: string
  runtime_version?: string
}

function nonEmpty(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function loadExpoUpdates(): ExpoUpdatesModule | null {
  try {
    return require('expo-updates') as ExpoUpdatesModule
  } catch {
    // expo-updates is an optional dependency
    return null
  }
}

/**
 * Read the installed version and, when expo-updates is present, the running
 * update. The embedded bundle has no update id worth sending, so it is left
 * out and the report matches on the app version alone.
 */
export function getBuildInfo(): BuildInfo {
  const info: BuildInfo = {}
  const appVersion = nonEmpty(getInstalledAppVersion())
  if (appVersion) info.app_version = appVersion

  const updates = loadExpoUpdates()
  if (!updates) return info

  const updateId = updates.isEmbeddedLaunch ? undefined : nonEmpty(updates.updateId)
  const channel = nonEmpty(updates.channel)
  const runtimeVersion = nonEmpty(updates.runtimeVersion)
  if (updateId) info.eas_update_id = updateId
  if (channel) info.channel = channel
  if (runtimeVersion) info.runtime_version = runtimeVersion
  return info
}
