import * as Device from 'expo-device'
import { NitroModules } from 'react-native-nitro-modules'
import { BugReporter } from './BugReporter'
import { ErrorReporter } from './ErrorReporter'
import type { MiteSDK as MiteSDKType } from './specs/MiteSDK.nitro'
import type { ErrorReporterInterface, MiteConfig, SubmitBugReportPayload } from './types'
import { ApiClient } from './utils/client'

export const MiteSDK = NitroModules.createHybridObject<MiteSDKType>('MiteSDK')

export class Mite {
  private deviceInfo: typeof Device
  private initialized = false
  private apiClient: ApiClient
  private errorReporter: ErrorReporterInterface
  private bugReporter: BugReporter
  private nativeCrashHandlersEnabled = false

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
    this.enableNativeCrashHandlers()
    this.initialized = true
    console.log('[Mite] Initialized!')
  }

  /**
   * Enables native crash handlers to catch app crashes
   */
  enableNativeCrashHandlers() {
    try {
      if (!this.nativeCrashHandlersEnabled) {
        console.log('[Mite] Installing native crash handlers')
        MiteSDK.installCrashHandlers()
        this.nativeCrashHandlersEnabled = true
      }
    } catch (error) {
      console.error('[Mite] Failed to install native crash handlers:', error)
    }
  }

  /**
   * Disables native crash handlers
   */
  disableNativeCrashHandlers() {
    try {
      if (this.nativeCrashHandlersEnabled) {
        console.log('[Mite] Removing native crash handlers')
        MiteSDK.removeCrashHandlers()
        this.nativeCrashHandlersEnabled = false
      }
    } catch (error) {
      console.error('[Mite] Failed to remove native crash handlers:', error)
    }
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
