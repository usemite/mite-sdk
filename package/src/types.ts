import type { ApiClient } from './utils/client'

export interface MiteConfig {
  // appId: string
  // publicKey: string
  apiKey?: string
  endpoint?: string
  timeout?: number
  retries?: number
}

export type ReleasePlatform = 'ios' | 'android' | 'all'

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

export interface ErrorReportConfig {
  deviceInfo: Record<string, unknown>
  apiClient: ApiClient
}

// export interface ApiClientConfig {
//   appId: string
//   publicKey: string
//   endpoint?: string
//   timeout?: number
//   retries?: number
//   deviceInfo: Record<string, unknown>
// }

export interface ErrorReport {
  timestamp: string
  error: {
    error_name: string
    error_message: string
    error_stack: string
    type?: string
    promiseId?: string
  }
  device: Record<string, unknown>
  metadata: Record<string, string | number | boolean>
}

export interface Reporter {
  init(): void
  isEnabled(): boolean
  enable(): void
  disable(): void
}

export interface ErrorReporterInterface extends Reporter {
  captureError(
    error: Error | Record<string, unknown>,
    additionalInfo?: Record<string, unknown>,
  ): Promise<void>
  logError(error: Error, metadata?: Record<string, unknown>): Promise<void>
}

export interface SubmitBugReportPayload {
  title: string
  description: string
  user_identifier?: string
  anonymous_id?: string
  reporter_name?: string
  reporter_email?: string
  steps_to_reproduce?: string
  expected_behavior?: string
  actual_behavior?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  app_version?: string
  device_info?: Record<string, unknown>
  environment?: Record<string, unknown>
}

export interface SubmitBugReportResponse {
  id: string
  status: 'OPEN'
}
