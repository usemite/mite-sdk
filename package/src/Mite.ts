import * as Device from 'expo-device'
import { BugReporter } from './BugReporter'
import { ErrorReporter } from './ErrorReporter'
import type { ErrorReporterInterface, MiteConfig, SubmitBugReportPayload } from './types'
import { ApiClient } from './utils/client'

export class Mite {
  private deviceInfo: typeof Device
  private initialized = false
  private apiClient: ApiClient
  private errorReporter: ErrorReporterInterface
  private bugReporter: BugReporter

  constructor(config: MiteConfig) {
    this.deviceInfo = Device
    this.apiClient = ApiClient.getInstance({
      timeout: config.timeout || 5000,
      maxRetries: config.retries,
      headers: {
        'x-app-public-key': config.publicKey,
        'X-SDK-Version': '1.0.0',
      },
    })
    this.errorReporter = new ErrorReporter({
      miteConfig: config,
      deviceInfo: this.deviceInfo,
      apiClient: this.apiClient,
    })
    this.bugReporter = new BugReporter({
      appId: config.appId,
      apiClient: this.apiClient,
      deviceInfo: this.deviceInfo,
    })
  }

  init() {
    if (this.initialized) {
      return
    }
    this.errorReporter.init()
    this.bugReporter.init()
    this.initialized = true
    console.log('Initialized!')
  }

  /**
   * Capture an error and send it to the server
   * @param error
   * @param additionalInfo
   * @returns
   */
  async captureError(
    error: Error | Record<string, unknown>,
    additionalInfo: Record<string, unknown> = {},
  ) {
    return this.errorReporter.captureError(error, additionalInfo)
  }

  /**
   * Capture a bug and send it to the server
   * @param payload
   * @returns
   */
  async submitBug(payload: Omit<SubmitBugReportPayload, 'appId' | 'deviceInfo'>) {
    return this.bugReporter.sendBugReportToServer(payload)
  }

  async logError(error: Error, metadata: Record<string, unknown> = {}) {
    return this.errorReporter.logError(error, metadata)
  }

  disable() {
    this.errorReporter.disable()
  }

  enable() {
    this.errorReporter.enable()
  }

  isEnabled(): boolean {
    return this.errorReporter.isEnabled()
  }
}
