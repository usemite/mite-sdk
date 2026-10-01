import type { CaptureOptions } from './ErrorTracker'

export interface MiteIdentityStorage {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

/** MMKV-compatible storage interface (react-native-mmkv) */
export interface MiteMMKVLikeStorage {
  getString(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
}

export interface MiteConfig {
  apiKey?: string
  /**
   * The Mite API origin.
   * @default 'https://usemite.com'
   */
  endpoint?: string
  timeout?: number
  retries?: number
  /**
   * Override the automatically generated anonymous identifier.
   */
  anonymousId?: string
  /**
   * Persisted identity state storage. Accepts an AsyncStorage-compatible adapter
   * or an MMKV instance directly. Used to keep the anonymous id across app restarts.
   */
  identityStorage?: MiteIdentityStorage | MiteMMKVLikeStorage
  /**
   * Start the SDK in anonymous-only mode. When enabled, Mite will not send
   * user ids, contact fields, metadata, or device info.
   */
  identificationOptOut?: boolean
  /**
   * Enable offline request queuing for failed requests.
   * @default true
   */
  enableOfflineQueue?: boolean
  /**
   * Attach the recent navigation trail to submitted bug reports.
   * @default true
   */
  enableNavigationBreadcrumbs?: boolean
  /**
   * Maximum number of screens kept in the navigation trail.
   * @default 20
   */
  maxNavigationBreadcrumbs?: number
  /**
   * Capture uncaught JS errors: send them to Mite and attach the latest one
   * to bug reports.
   * @default true
   */
  captureUncaughtErrors?: boolean
  /**
   * Capture promise rejections nobody handled. Hermes only.
   * @default true
   */
  captureUnhandledRejections?: boolean
  /**
   * Send captured JS errors to Mite, where they are grouped and triaged.
   * Set to false to keep only the latest error for bug reports.
   * @default true
   */
  enableErrorTracking?: boolean
  /**
   * Drop errors whose message contains one of these strings or matches one
   * of these patterns.
   */
  ignoreErrors?: Array<string | RegExp>
  /**
   * Inspect or scrub an error before it is sent. Return null to drop it.
   */
  beforeSendError?: (event: MiteErrorEvent) => MiteErrorEvent | null
  /**
   * Called each time the server refuses a request because the account has
   * reached a plan limit. Use it to log the condition or to tell the user.
   * The SDK never throws for a quota refusal.
   */
  onQuotaExceeded?: (refusal: MiteQuotaRefusal) => void
}

export interface NavigationBreadcrumb {
  screen: string
  timestamp: number
}

export type ReleasePlatform = 'ios' | 'android' | 'all'
export type FeatureRequestStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED'

export interface Release {
  id: string
  version: string
  versionCode: number
  platform: ReleasePlatform
  notes?: string
  releasedAt?: number
  createdAt: number
}

export interface ReleasesResponse {
  releases: Release[]
}

export interface GetReleasesOptions {
  platform?: ReleasePlatform
  limit?: number
}

export interface Announcement {
  id: string
  title: string
  /** Markdown body. Content can change server-side at any time. */
  content: string
  platform: ReleasePlatform
  /** Label of the optional action button. */
  ctaLabel?: string
  /** URL opened by the optional action button. */
  ctaUrl?: string
  publishedAt?: number
  updatedAt?: number
  createdAt: number
}

export interface AnnouncementsResponse {
  announcements: Announcement[]
}

export interface GetAnnouncementsOptions {
  platform?: ReleasePlatform
  limit?: number
}

export interface FeatureRequest {
  id: string
  title: string
  description: string
  authorName: string
  voteCount: number
  status: FeatureRequestStatus
  createdAt: number
}

export interface FeatureRequestsResponse {
  requests: FeatureRequest[]
}

export interface CreateFeatureRequestPayload {
  title: string
  description?: string
  /**
   * Optional display name shown next to the request. When omitted, the
   * request is displayed as anonymous.
   */
  author_name?: string
  /**
   * Contact email for the request. Required so the team can follow up
   * and notify the author of status changes.
   */
  author_email: string
  /**
   * Override the anonymous identifier. Defaults to the SDK's current
   * anonymous id.
   */
  anonymous_id?: string
  /**
   * Override the user identifier. Defaults to the SDK's current
   * identified user, when one exists.
   */
  user_identifier?: string
}

export interface CreateFeatureRequestResponse {
  id: string
  status: FeatureRequestStatus
}

export interface VoteFeatureRequestPayload {
  feature_request_id: string
  /**
   * @deprecated Votes are tied to the SDK's identified/anonymous end user.
   * Provide only to keep older email-based votes working.
   */
  voter_email?: string
  /**
   * Override the anonymous identifier. Defaults to the SDK's current
   * anonymous id.
   */
  anonymous_id?: string
  /**
   * Override the user identifier. Defaults to the SDK's current
   * identified user, when one exists.
   */
  user_identifier?: string
}

export interface VoteFeatureRequestResponse {
  voted: boolean
  voteCount: number
}

export interface FeatureRequestVotesResponse {
  featureRequestIds: string[]
}

export interface SubmitBugReportPayload {
  /** Sent by `mite.feedback.send()`. The server treats a report without one as a bug. */
  kind?: FeedbackType
  title: string
  description: string
  user_identifier?: string
  anonymous_id?: string
  reporter_name?: string
  reporter_email?: string
  steps_to_reproduce?: string
  expected_behavior?: string
  actual_behavior?: string
  /** Detected from expo-application or expo-constants when omitted. */
  app_version?: string
  /** The running EAS Update, detected from expo-updates when omitted. */
  eas_update_id?: string
  channel?: string
  runtime_version?: string
  device_info?: Record<string, unknown>
  environment?: Record<string, unknown>
  navigation_trail?: NavigationBreadcrumb[]
  attachments?: Array<{ uri: string; type?: string; name?: string }>
}

/** One JS error occurrence, as sent to `POST /api/v1/errors`. */
/** What the SDK posts for a report. `/api/v1/feedback` fills in a missing title. */
export type ReportWirePayload = Omit<SubmitBugReportPayload, 'title'> & { title?: string }

export interface MiteErrorEvent {
  name: string
  message: string
  stack?: string
  is_fatal: boolean
  handled: boolean
  occurred_at: number
  user_identifier?: string
  anonymous_id?: string
  app_version?: string
  eas_update_id?: string
  channel?: string
  runtime_version?: string
  device_info?: Record<string, string>
  environment?: Record<string, string>
  navigation_trail?: NavigationBreadcrumb[]
}

export interface SubmitBugReportResponse {
  id: string
  status: 'NEEDS_TRIAGE'
}

/**
 * Plan limits the server enforces. `REPORT_QUOTA_EXCEEDED` means the account
 * has used every report in the current billing period. `STORAGE_QUOTA_EXCEEDED`
 * means the account has used all of its attachment storage.
 */
export type MiteQuotaCode = 'REPORT_QUOTA_EXCEEDED' | 'STORAGE_QUOTA_EXCEEDED'

export interface MiteQuota {
  limit: number
  used: number
  /**
   * Milliseconds since the epoch. Sent with `REPORT_QUOTA_EXCEEDED` only.
   * Attachment storage is a standing total and does not reset.
   */
  resetsAt?: number
}

export interface MiteQuotaRefusal {
  code: MiteQuotaCode
  /** The message the server sent. Written for developers, not end users. */
  message: string
  quota: MiteQuota
}

/**
 * The outcome of a bug report submission.
 *
 * `ok: true` means the server created a report. When `droppedAttachments` is
 * present, the report exists but the files did not upload.
 * `ok: false` means the server created no report. Read `refusal.code` to know
 * why. A refusal is an expected state, so the SDK does not throw for it.
 */
export type SubmitBugResult =
  | {
      ok: true
      report: SubmitBugReportResponse
      droppedAttachments?: {
        count: number
        refusal: MiteQuotaRefusal
      }
    }
  | {
      ok: false
      refusal: MiteQuotaRefusal
    }

export interface IdentifyUserPayload {
  user_identifier?: string
  anonymous_id?: string
  email?: string
  name?: string
  device_info?: Record<string, unknown>
  app_version?: string
  metadata?: Record<string, unknown>
  /** Whether the user pays for your app. Mite alerts you when a paying user's report shows churn risk. */
  isPaying?: boolean
}

export interface IdentifyUserResponse {
  id: string
  created: boolean
}

/** What a piece of feedback is. */
export type FeedbackType = 'bug' | 'question' | 'idea' | 'other'

/** A file to attach, by local URI. */
export interface MiteAttachment {
  uri: string
  /** MIME type, such as `image/png`. Read from the file when omitted. */
  type?: string
  name?: string
}

interface FeedbackFields {
  /** What the user wrote. Required. */
  message: string
  /** Shown in the dashboard. Defaults to the message's first line. */
  title?: string
  /** Who sent it, when the user typed it in. Defaults to the identified user. */
  reporter?: { name?: string; email?: string }
  /** Local URI of a screenshot. Shorthand for the first attachment. */
  screenshot?: string
  attachments?: MiteAttachment[]
  /** Extra flat context, merged over the SDK's own environment keys. */
  context?: Record<string, string>
}

/**
 * Input for `mite.feedback.send()`. The bug-only fields exist only when
 * `type` is `'bug'`, so TypeScript rejects `steps` on a question.
 */
export type SendFeedbackInput =
  | (FeedbackFields & {
      type: 'bug'
      steps?: string
      expected?: string
      actual?: string
    })
  | (FeedbackFields & {
      /** Defaults to `'other'`. */
      type?: Exclude<FeedbackType, 'bug'>
      steps?: never
      expected?: never
      actual?: never
    })

/** Same shape as a bug report result: `ok: false` is a plan limit, not a fault. */
export type SendFeedbackResult = SubmitBugResult

export interface RequestFeatureInput {
  title: string
  description?: string
  /** The feature request board shows the author and emails them on updates. */
  author: { email: string; name?: string }
}

export interface IdentifyOptions {
  email?: string
  name?: string
  /** Whether the user pays for your app. Mite alerts you when a paying user's report shows churn risk. */
  isPaying?: boolean
  /** Any other traits to keep on the user's profile. */
  traits?: Record<string, unknown>
}

/** `mite.feedback`: anything a user sends, from a bug to a question. */
export interface MiteFeedbackApi {
  send(input: SendFeedbackInput): Promise<SendFeedbackResult>
}

/** `mite.features`: the public feature request board. */
export interface MiteFeaturesApi {
  list(): Promise<FeatureRequest[]>
  request(input: RequestFeatureInput): Promise<CreateFeatureRequestResponse>
  /** Toggles the current user's vote. */
  vote(id: string): Promise<VoteFeatureRequestResponse>
  /** Ids of the requests the current user voted for. */
  myVotes(): Promise<string[]>
}

/** `mite.errors`: errors your code caught. Uncaught ones are sent for you. */
export interface MiteErrorsApi {
  /** Never throws and never waits, so it is safe inside a catch block. */
  capture(error: unknown, options?: CaptureOptions): void
  /** Send captured errors now instead of with the next batch. */
  flush(): Promise<void>
}

/** `mite.user`: who is using the app. */
export interface MiteUserApi {
  /** Tie this device's reports to your user id. Call it after sign-in. */
  identify(id: string, options?: IdentifyOptions): Promise<IdentifyUserResponse>
  /** Forget the identified user, keeping the anonymous id. Call it on sign-out. */
  reset(): Promise<void>
  /** Stop sending the user id, email and device details. */
  optOut(): Promise<void>
  optIn(): Promise<void>
  readonly id: string | undefined
  readonly anonymousId: string
  readonly isOptedOut: boolean
}

/** `mite.releases`: your published release notes. */
export interface MiteReleasesApi {
  list(options?: GetReleasesOptions): Promise<Release[]>
  /** The version the "What's New" sheet last showed, or null. */
  lastSeen(): Promise<string | null>
  markSeen(version: string): Promise<void>
}

/** `mite.announcements`: in-app announcements. */
export interface MiteAnnouncementsApi {
  list(options?: GetAnnouncementsOptions): Promise<Announcement[]>
  markSeen(id: string): Promise<void>
  seenIds(): Promise<string[]>
  clearSeen(): Promise<void>
}

/** `mite.storeReview`: the native App Store / Play Store review prompt. */
export interface MiteStoreReviewApi {
  isAvailable(): Promise<boolean>
  /** Resolves to false when expo-store-review is not installed. */
  request(): Promise<boolean>
}
