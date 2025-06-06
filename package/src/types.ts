import type Device from 'expo-device'
import type { ApiClient } from './utils/client'

export interface MiteConfig {
  appId: string
  publicKey: string
  endpoint?: string
  timeout?: number
  retries?: number
}

export interface ErrorReportConfig {
  miteConfig: MiteConfig
  deviceInfo: typeof Device
  apiClient: ApiClient
}

// export interface ApiClientConfig {
//   appId: string
//   publicKey: string
//   endpoint?: string
//   timeout?: number
//   retries?: number
//   deviceInfo: typeof Device
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
  device: typeof Device
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
  userIdentifier?: string // App's user ID
  reporter_name?: string // Name of person reporting the bug
  reporter_email?: string // Email of person reporting the bug
  steps_to_reproduce?: string
  expected_behavior?: string
  actual_behavior?: string
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' // Defaults to 'medium'
  app_version?: string // Version of the app
  device_info?: {
    // Device information as JSON
    os?: string
    osVersion?: string
    device?: string
    manufacturer?: string
    model?: string
    screenWidth?: number
    screenHeight?: number
    batteryLevel?: number
    isCharging?: boolean
    connectivity?: string // wifi, cellular, etc.
    [key: string]: unknown // Allow for custom device info
  }

  // Environment information as JSON
  // environment?: {
  //   buildType?: 'debug' | 'release' | 'beta'
  //   locale?: string
  //   timezone?: string
  //   userAgent?: string
  //   [key: string]: any // Allow for custom environment info
  // }
}
