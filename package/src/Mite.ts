import * as Device from 'expo-device'
import { BugReporter } from './BugReporter'
import { navigationTracker } from './NavigationTracker'
import { OfflineQueue } from './OfflineQueue'
import { triageContext } from './TriageContext'
import type {
  Announcement,
  AnnouncementsResponse,
  CreateFeatureRequestPayload,
  CreateFeatureRequestResponse,
  FeatureRequest,
  FeatureRequestVotesResponse,
  GetAnnouncementsOptions,
  GetReleasesOptions,
  IdentifyUserPayload,
  IdentifyUserResponse,
  MiteConfig,
  MiteIdentityStorage,
  MiteQuotaRefusal,
  Release,
  ReleasesResponse,
  SubmitBugReportPayload,
  SubmitBugResult,
  VoteFeatureRequestPayload,
  VoteFeatureRequestResponse,
} from './types'
import { type BuildInfo, getBuildInfo } from './utils/buildInfo'
import { ApiClient } from './utils/client'
import { type FlatStringRecord, normalizeDeviceInfo } from './utils/deviceInfo'
import { generateAnonymousId } from './utils/identity'
import { resolveIdentityStorage } from './utils/storage'
import { isStoreReviewAvailable, requestStoreReview } from './utils/storeReview'

const IDENTITY_STORAGE_KEY = '@mite/sdk-identity'
const LAST_SEEN_RELEASE_STORAGE_KEY = '@mite/sdk-last-seen-release'
const SEEN_ANNOUNCEMENTS_STORAGE_KEY = '@mite/sdk-seen-announcements'
// Announcements are ephemeral, so the seen list only needs to cover the
// recent past. The cap keeps the stored JSON from growing forever.
const MAX_SEEN_ANNOUNCEMENT_IDS = 100

interface PersistedIdentityState {
  anonymousId: string
  userIdentifier?: string
  identificationOptOut: boolean
}

function getDeviceInfo(): FlatStringRecord {
  const deviceTypeMap: Record<number, string> = {
    0: 'UNKNOWN',
    1: 'PHONE',
    2: 'TABLET',
    3: 'DESKTOP',
    4: 'TV',
  }

  return normalizeDeviceInfo({
    brand: Device.brand,
    designName: Device.designName,
    deviceName: Device.deviceName,
    deviceType: deviceTypeMap[Device.deviceType ?? 0] ?? 'UNKNOWN',
    deviceYearClass: Device.deviceYearClass,
    isDevice: Device.isDevice,
    manufacturer: Device.manufacturer,
    modelId: Device.modelId,
    modelName: Device.modelName,
    osName: Device.osName,
    osVersion: Device.osVersion,
    osBuildId: Device.osBuildId,
    osInternalBuildId: Device.osInternalBuildId,
    osBuildFingerprint: Device.osBuildFingerprint,
    platformApiLevel: Device.platformApiLevel,
    productName: Device.productName,
    supportedCpuArchitectures: Device.supportedCpuArchitectures,
    totalMemory: Device.totalMemory,
  })
}

export class Mite {
  private deviceInfo: FlatStringRecord
  private buildInfo: BuildInfo
  private apiClient: ApiClient
  private bugReporter: BugReporter
  private apiKey?: string
  private config: MiteConfig
  private offlineQueue: OfflineQueue | null = null
  private initialized = false
  private identityStorage: MiteIdentityStorage
  private hasPersistentIdentityStorage: boolean
  private identityReady: Promise<void>
  private currentAnonymousId: string
  private currentUserIdentifier?: string
  private identificationOptOut: boolean
  /**
   * The last report quota refusal. While it is set, `submitBug` refuses
   * locally instead of sending a request that cannot succeed. Not persisted,
   * so an app restart costs at most one wasted request.
   */
  private reportQuotaRefusal: MiteQuotaRefusal | null = null

  constructor(config: MiteConfig) {
    this.config = config
    this.apiKey = config.apiKey
    this.currentAnonymousId = config.anonymousId ?? generateAnonymousId()
    this.identificationOptOut = config.identificationOptOut ?? false
    const identityStorage = resolveIdentityStorage(config.identityStorage)
    this.identityStorage = identityStorage.storage
    this.hasPersistentIdentityStorage = identityStorage.isPersistent
    this.deviceInfo = getDeviceInfo()
    this.buildInfo = getBuildInfo()
    this.apiClient = new ApiClient({
      baseUrl: config.endpoint,
      timeout: config.timeout || 5000,
      maxRetries: config.retries,
    })

    if (this.apiKey) {
      this.apiClient.updateHeaders({
        Authorization: `Bearer ${this.apiKey}`,
      })
    }

    this.bugReporter = new BugReporter({
      deviceInfo: this.deviceInfo,
      apiClient: this.apiClient,
    })
    navigationTracker.configure({
      enabled: config.enableNavigationBreadcrumbs !== false,
      maxBreadcrumbs: config.maxNavigationBreadcrumbs,
    })
    triageContext.start({
      captureUncaughtErrors: config.captureUncaughtErrors !== false,
    })
    this.identityReady = this.hydrateIdentityState()
  }

  /**
   * Initialize the SDK. Sets up offline queue.
   * Call this once after creating the Mite instance.
   */
  init(): void {
    if (this.initialized) {
      console.warn('[Mite] SDK already initialized')
      return
    }

    const enableOfflineQueue = this.config.enableOfflineQueue !== false

    if (enableOfflineQueue) {
      this.offlineQueue = new OfflineQueue(this.apiClient, undefined, refusal => {
        // A queued report can meet a quota refusal long after the call that
        // created it returned. Report it through the same channel, and close
        // the gate so the next call sends nothing that cannot succeed.
        this.rememberReportQuotaRefusal(refusal)
        this.notifyQuotaExceeded(refusal)
      })
      console.log('[Mite] Offline queue enabled')
    }

    this.initialized = true
    console.log('[Mite] SDK initialized')
    if (!this.hasPersistentIdentityStorage) {
      console.warn(
        '[Mite] No persistent identity storage configured. Anonymous IDs will reset on full app reload. Pass identityStorage (for example AsyncStorage) to persist users across launches.',
      )
    }
    void this.syncIdentityState().catch(() => {
      // Ignore startup identity failures. Later identify calls and bug reports
      // will continue to use the latest local identity state.
    })
  }

  /**
   * Tear down the SDK. Clears queues.
   */
  destroy(): void {
    if (this.offlineQueue) {
      this.offlineQueue.destroy()
      this.offlineQueue = null
    }

    triageContext.stop()
    this.reportQuotaRefusal = null
    this.initialized = false
  }

  /**
   * Manually record an error so the latest one is attached to bug reports.
   * Useful inside a catch block or an error boundary.
   */
  recordError(error: unknown): void {
    triageContext.recordError(error)
  }

  /**
   * Submit a bug report to the server.
   *
   * The result tells you what happened. `ok: false` means the account is over
   * a plan limit and the server made no report. A quota refusal does not
   * throw, because it is an expected state and not a fault. Network faults and
   * bad configuration still throw.
   *
   * If the request fails with a network error and the offline queue is
   * enabled, the report is queued for a later retry. A quota refusal is never
   * queued and never retried.
   */
  async submitBug(
    payload: Omit<SubmitBugReportPayload, 'appId' | 'deviceInfo'>,
  ): Promise<SubmitBugResult> {
    this.requireApiKey('submit bug reports')

    const gated = this.getActiveReportQuotaRefusal()
    if (gated) {
      // The account is out of reports and the period has not turned over.
      // Send nothing.
      this.notifyQuotaExceeded(gated)
      return { ok: false, refusal: gated }
    }

    await this.ensureIdentityReady()
    const payloadWithIdentity = this.buildBugReportPayload(payload)

    try {
      const result = await this.bugReporter.sendBugReportToServer(payloadWithIdentity, {
        includeDefaultDeviceInfo: !this.identificationOptOut,
      })

      if (!result.ok) {
        this.rememberReportQuotaRefusal(result.refusal)
        this.notifyQuotaExceeded(result.refusal)
      } else if (result.droppedAttachments) {
        console.warn(
          `[Mite] ${result.droppedAttachments.count} attachment(s) were dropped: ${result.droppedAttachments.refusal.message}`,
        )
        this.notifyQuotaExceeded(result.droppedAttachments.refusal)
      }

      return result
    } catch (err) {
      if (this.offlineQueue && this.isNetworkError(err)) {
        const { attachments, ...payloadWithoutAttachments } = payloadWithIdentity
        const queuedPayload: Record<string, unknown> = {
          ...payloadWithoutAttachments,
        }

        if (!this.identificationOptOut) {
          queuedPayload.device_info = normalizeDeviceInfo(
            payloadWithIdentity.device_info ?? this.deviceInfo,
          )
        }

        this.offlineQueue.enqueue('post', '/api/v1/bug-reports', {
          ...queuedPayload,
        })
        if (attachments && attachments.length > 0) {
          console.warn(
            '[Mite] Attachments cannot be uploaded while offline and were dropped from the queued bug report',
          )
        }
        console.log('[Mite] Bug report queued for retry')
      }
      throw err
    }
  }

  /**
   * Identify an end user in your application.
   * Uses the current anonymous identifier automatically when needed.
   */
  async identify(payload: IdentifyUserPayload): Promise<IdentifyUserResponse> {
    this.requireApiKey('identify users')
    await this.ensureIdentityReady()
    const payloadWithIdentity = this.buildIdentifyPayload(payload)

    const response = await this.apiClient.post<IdentifyUserResponse>('/api/v1/identify', {
      ...payloadWithIdentity,
    })

    this.currentAnonymousId = payloadWithIdentity.anonymous_id
    if (this.identificationOptOut) {
      this.currentUserIdentifier = undefined
    } else {
      this.currentUserIdentifier = payloadWithIdentity.user_identifier
    }
    await this.persistIdentityState()

    return response
  }

  /**
   * Remove the identified user while keeping the anonymous id stable.
   */
  async logout(): Promise<void> {
    await this.ensureIdentityReady()
    const previousUserIdentifier = this.currentUserIdentifier
    this.currentUserIdentifier = undefined

    try {
      await this.persistIdentityState()
    } catch (err) {
      this.currentUserIdentifier = previousUserIdentifier
      throw err
    }

    void this.syncIdentityState().catch(() => {
      // Ignore logout sync failures. Local state has already been updated.
    })
  }

  /**
   * Toggle whether identified data should be sent to Mite.
   */
  async setIdentificationOptOut(optedOut: boolean): Promise<void> {
    await this.ensureIdentityReady()
    const previousOptOut = this.identificationOptOut
    const previousUserIdentifier = this.currentUserIdentifier
    this.identificationOptOut = optedOut

    if (optedOut) {
      this.currentUserIdentifier = undefined
    }

    try {
      await this.persistIdentityState()
    } catch (err) {
      this.identificationOptOut = previousOptOut
      this.currentUserIdentifier = previousUserIdentifier
      throw err
    }

    void this.syncIdentityState().catch(() => {
      // Ignore preference sync failures. Local privacy state is already applied.
    })
  }

  /**
   * Fetch published releases for the application
   */
  async getReleases(options: GetReleasesOptions = {}): Promise<Release[]> {
    const apiKey = this.requireApiKey('fetch releases')

    const params = new URLSearchParams()
    if (options.platform) {
      params.append('platform', options.platform)
    }
    if (options.limit) {
      params.append('limit', options.limit.toString())
    }

    const queryString = params.toString()
    const url = `/api/v1/releases${queryString ? `?${queryString}` : ''}`

    const response = await this.apiClient.get<ReleasesResponse>(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    return response.releases
  }

  /**
   * Fetch currently active announcements for the application, newest first.
   * Only published announcements inside their schedule window are returned.
   */
  async getAnnouncements(options: GetAnnouncementsOptions = {}): Promise<Announcement[]> {
    const apiKey = this.requireApiKey('fetch announcements')

    const params = new URLSearchParams()
    if (options.platform) {
      params.append('platform', options.platform)
    }
    if (options.limit) {
      params.append('limit', options.limit.toString())
    }

    const queryString = params.toString()
    const url = `/api/v1/announcements${queryString ? `?${queryString}` : ''}`

    const response = await this.apiClient.get<AnnouncementsResponse>(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    return response.announcements
  }

  /**
   * Get the ids of announcements this device has already seen.
   * Returns an empty list when nothing has been seen or storage fails.
   */
  async getSeenAnnouncementIds(): Promise<string[]> {
    try {
      const raw = await this.identityStorage.getItem(SEEN_ANNOUNCEMENTS_STORAGE_KEY)
      if (!raw) {
        return []
      }
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return []
      }
      return parsed.filter((id): id is string => typeof id === 'string')
    } catch {
      return []
    }
  }

  /**
   * Persist an announcement id as seen so it is not shown again on this device.
   */
  async markAnnouncementSeen(id: string): Promise<void> {
    try {
      const seen = await this.getSeenAnnouncementIds()
      if (seen.includes(id)) {
        return
      }
      const next = [...seen, id].slice(-MAX_SEEN_ANNOUNCEMENT_IDS)
      await this.identityStorage.setItem(
        SEEN_ANNOUNCEMENTS_STORAGE_KEY,
        JSON.stringify(next),
      )
    } catch {
      console.warn('[Mite] Failed to persist the seen announcements')
    }
  }

  /**
   * Forget every seen announcement, so active announcements show again.
   */
  async clearSeenAnnouncements(): Promise<void> {
    try {
      await this.identityStorage.removeItem(SEEN_ANNOUNCEMENTS_STORAGE_KEY)
    } catch {
      console.warn('[Mite] Failed to clear the seen announcements')
    }
  }

  /**
   * Fetch feature requests for the current application.
   */
  async getFeatureRequests(): Promise<FeatureRequest[]> {
    this.requireApiKey('fetch feature requests')

    const response = await this.apiClient.get<{
      requests: FeatureRequest[]
    }>('/api/v1/feature-requests')

    return response.requests
  }

  /**
   * Create a feature request for the current application.
   * The request is tied to the SDK's identified/anonymous end user.
   */
  async createFeatureRequest(
    payload: CreateFeatureRequestPayload,
  ): Promise<CreateFeatureRequestResponse> {
    this.requireApiKey('create feature requests')
    await this.ensureIdentityReady()

    const body: Record<string, unknown> = {
      title: payload.title.trim(),
      description: payload.description?.trim() ?? '',
      author_email: payload.author_email.trim().toLowerCase(),
      anonymous_id: payload.anonymous_id ?? this.currentAnonymousId,
    }

    if (payload.author_name?.trim()) {
      body.author_name = payload.author_name.trim()
    }

    if (!this.identificationOptOut) {
      const user_identifier = payload.user_identifier ?? this.currentUserIdentifier
      if (user_identifier) {
        body.user_identifier = user_identifier
      }
    }

    return await this.apiClient.post<CreateFeatureRequestResponse>(
      '/api/v1/feature-requests',
      body,
    )
  }

  /**
   * Toggle a vote on a feature request for the current application.
   * The vote is tied to the SDK's identified/anonymous end user.
   */
  async voteFeatureRequest(
    payload: VoteFeatureRequestPayload,
  ): Promise<VoteFeatureRequestResponse> {
    this.requireApiKey('vote on feature requests')
    await this.ensureIdentityReady()

    const body: Record<string, unknown> = {
      feature_request_id: payload.feature_request_id,
      anonymous_id: payload.anonymous_id ?? this.currentAnonymousId,
    }

    if (!this.identificationOptOut) {
      const user_identifier = payload.user_identifier ?? this.currentUserIdentifier
      if (user_identifier) {
        body.user_identifier = user_identifier
      }
      if (payload.voter_email?.trim()) {
        body.voter_email = payload.voter_email.trim().toLowerCase()
      }
    }

    return await this.apiClient.post<VoteFeatureRequestResponse>(
      '/api/v1/feature-requests/vote',
      body,
    )
  }

  /**
   * Fetch the feature requests already voted on by the SDK's
   * identified/anonymous end user, or by an email address when provided.
   */
  async getFeatureRequestVotes(voterEmail?: string): Promise<string[]> {
    this.requireApiKey('fetch feature request votes')
    await this.ensureIdentityReady()

    const params = new URLSearchParams()

    if (voterEmail?.trim()) {
      params.append('voter_email', voterEmail.trim().toLowerCase())
    } else {
      params.append('anonymous_id', this.currentAnonymousId)
      if (!this.identificationOptOut && this.currentUserIdentifier) {
        params.append('user_identifier', this.currentUserIdentifier)
      }
    }

    const response = await this.apiClient.get<FeatureRequestVotesResponse>(
      `/api/v1/feature-requests/votes?${params.toString()}`,
    )

    return response.featureRequestIds
  }

  /**
   * Check whether the native store review dialog can be requested.
   * Requires the optional expo-store-review peer dependency.
   */
  async isStoreReviewAvailable(): Promise<boolean> {
    return await isStoreReviewAvailable()
  }

  /**
   * Request the native store review dialog (App Store / Play Store).
   * Resolves to true when the request was made. Safely no-ops and resolves
   * to false when the optional expo-store-review peer dependency is missing.
   */
  async requestStoreReview(): Promise<boolean> {
    return await requestStoreReview()
  }

  /**
   * Get the app version last acknowledged by the "What's New" widget.
   * Returns null when no version has been seen yet.
   */
  async getLastSeenReleaseVersion(): Promise<string | null> {
    try {
      return await this.identityStorage.getItem(LAST_SEEN_RELEASE_STORAGE_KEY)
    } catch {
      return null
    }
  }

  /**
   * Persist the app version acknowledged by the "What's New" widget.
   */
  async setLastSeenReleaseVersion(version: string): Promise<void> {
    try {
      await this.identityStorage.setItem(LAST_SEEN_RELEASE_STORAGE_KEY, version)
    } catch {
      console.warn('[Mite] Failed to persist the last seen release version')
    }
  }

  /**
   * Manually flush the offline queue.
   */
  async flushOfflineQueue(): Promise<void> {
    if (this.offlineQueue) {
      await this.offlineQueue.flush()
    }
  }

  /**
   * Get the number of pending requests in the offline queue.
   */
  get pendingRequestCount(): number {
    return this.offlineQueue?.pendingCount ?? 0
  }

  get anonymousId(): string {
    return this.currentAnonymousId
  }

  /**
   * The currently identified end user, when one exists.
   */
  get userIdentifier(): string | undefined {
    return this.currentUserIdentifier
  }

  /**
   * Resolves once persisted identity state has been restored from storage.
   * Await this before reading identity getters on app startup.
   */
  async whenIdentityReady(): Promise<void> {
    await this.identityReady
  }

  get isIdentificationOptedOut(): boolean {
    return this.identificationOptOut
  }

  /**
   * Close the gate, but only when the refusal says when it should open again.
   * The gate saves a request that cannot succeed. It must never be the reason
   * a report is lost, so a refusal with no reset time does not close it.
   */
  private rememberReportQuotaRefusal(refusal: MiteQuotaRefusal): void {
    if (refusal.code !== 'REPORT_QUOTA_EXCEEDED') return
    if (typeof refusal.quota.resetsAt !== 'number') return

    this.reportQuotaRefusal = refusal
  }

  /**
   * The report quota refusal that is still in force, if any. The gate opens
   * again once the billing period turns over.
   */
  private getActiveReportQuotaRefusal(): MiteQuotaRefusal | null {
    const refusal = this.reportQuotaRefusal
    if (!refusal) return null

    const resetsAt = refusal.quota.resetsAt
    if (typeof resetsAt !== 'number' || Date.now() >= resetsAt) {
      this.reportQuotaRefusal = null
      return null
    }

    return refusal
  }

  private notifyQuotaExceeded(refusal: MiteQuotaRefusal): void {
    try {
      this.config.onQuotaExceeded?.(refusal)
    } catch (err) {
      console.error('[Mite] onQuotaExceeded handler threw:', err)
    }
  }

  private isNetworkError(err: unknown): boolean {
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code
      return code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT'
    }
    return false
  }

  private requireApiKey(action: string): string {
    const apiKey = this.apiKey

    if (!apiKey) {
      throw new Error(
        `[Mite] API key is required to ${action}. Please provide apiKey in MiteConfig.`,
      )
    }

    return apiKey
  }

  private async hydrateIdentityState(): Promise<void> {
    let storedState: string | null

    try {
      storedState = await this.identityStorage.getItem(IDENTITY_STORAGE_KEY)
    } catch {
      // The read failed, so we do not know what is on disk. Returning here keeps
      // whatever is stored intact so a later launch can still recover the real
      // anonymous id, at the cost of this session using a throwaway one.
      this.handleIdentityStorageFailure('read')
      return
    }

    if (storedState) {
      try {
        const parsed = JSON.parse(storedState) as Partial<PersistedIdentityState>

        if (!this.config.anonymousId && parsed.anonymousId) {
          this.currentAnonymousId = parsed.anonymousId
        }

        if (
          typeof parsed.identificationOptOut === 'boolean' &&
          this.config.identificationOptOut === undefined
        ) {
          this.identificationOptOut = parsed.identificationOptOut
        }

        if (parsed.userIdentifier) {
          this.currentUserIdentifier = parsed.userIdentifier
        }
      } catch {
        // The stored payload is unreadable and cannot be recovered, so fall
        // through and replace it with current state.
      }
    }

    try {
      await this.persistIdentityState()
    } catch {
      this.handleIdentityStorageFailure('write')
    }
  }

  /**
   * Called when identity storage was configured but did not work. The anonymous
   * id is not durable for this session, so this app launch will look like a new
   * end user to the backend.
   */
  private handleIdentityStorageFailure(operation: 'read' | 'write'): void {
    this.hasPersistentIdentityStorage = false

    const consequence =
      operation === 'read'
        ? 'This launch is reported as a new anonymous user.'
        : 'This launch and every later launch are reported as new anonymous users.'

    console.warn(
      `[Mite] Identity storage ${operation} failed. ${consequence} Check the identityStorage adapter passed to new Mite().`,
    )
  }

  private async persistIdentityState(): Promise<void> {
    const state: PersistedIdentityState = {
      anonymousId: this.currentAnonymousId,
      identificationOptOut: this.identificationOptOut,
      ...(this.identificationOptOut || !this.currentUserIdentifier
        ? {}
        : { userIdentifier: this.currentUserIdentifier }),
    }

    await this.identityStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(state))
  }

  private async ensureIdentityReady(): Promise<void> {
    await this.identityReady
  }

  private buildIdentifyPayload(
    payload: IdentifyUserPayload,
  ): IdentifyUserPayload & { anonymous_id: string } {
    const anonymous_id = payload.anonymous_id ?? this.currentAnonymousId

    if (this.identificationOptOut) {
      return { anonymous_id }
    }

    const user_identifier = payload.user_identifier ?? this.currentUserIdentifier
    const appVersion = payload.app_version ?? this.buildInfo.app_version

    return {
      anonymous_id,
      ...(user_identifier ? { user_identifier } : {}),
      ...(payload.email ? { email: payload.email } : {}),
      ...(payload.name ? { name: payload.name } : {}),
      ...(appVersion ? { app_version: appVersion } : {}),
      ...(payload.metadata ? { metadata: payload.metadata } : {}),
      device_info: normalizeDeviceInfo(payload.device_info ?? this.deviceInfo),
    }
  }

  private buildBugReportPayload(
    payload: Omit<SubmitBugReportPayload, 'appId' | 'deviceInfo'>,
  ): Omit<SubmitBugReportPayload, 'appId' | 'deviceInfo'> {
    const {
      anonymous_id: providedAnonymousId,
      user_identifier: providedUserIdentifier,
      reporter_name: _reporterName,
      reporter_email: _reporterEmail,
      device_info: _deviceInfo,
      navigation_trail: providedTrail,
      environment: providedEnvironment,
      ...rest
    } = payload
    for (const field of ['priority', 'status', 'assigned_to', 'assignee']) {
      delete (rest as Record<string, unknown>)[field]
    }
    const anonymous_id = providedAnonymousId ?? this.currentAnonymousId
    const trail = providedTrail ?? navigationTracker.getTrail()
    const environment = { ...triageContext.snapshot(), ...(providedEnvironment ?? {}) }

    if (this.identificationOptOut) {
      return {
        ...this.buildInfo,
        ...rest,
        anonymous_id,
        ...(trail.length > 0 ? { navigation_trail: trail } : {}),
        ...(Object.keys(environment).length > 0 ? { environment } : {}),
      }
    }

    const user_identifier = providedUserIdentifier ?? this.currentUserIdentifier

    return {
      ...this.buildInfo,
      ...rest,
      anonymous_id,
      ...(trail.length > 0 ? { navigation_trail: trail } : {}),
      ...(Object.keys(environment).length > 0 ? { environment } : {}),
      ...(user_identifier ? { user_identifier } : {}),
      ...(_reporterName ? { reporter_name: _reporterName } : {}),
      ...(_reporterEmail ? { reporter_email: _reporterEmail } : {}),
      ...(_deviceInfo ? { device_info: _deviceInfo } : {}),
    }
  }

  private async syncIdentityState(): Promise<void> {
    if (!this.apiKey) {
      return
    }

    await this.ensureIdentityReady()
    const payload = this.buildIdentifyPayload({})

    await this.apiClient.post<IdentifyUserResponse>('/api/v1/identify', payload)
  }
}
