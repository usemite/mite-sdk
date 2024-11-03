import * as Device from 'expo-device';

export interface BugzzAppConfig {
  apiKey: string
  appId: string
}

export class BugzzApp {
  apiKey: string
  appId: string
  config: BugzzAppConfig
  enabled: boolean
  deviceInfo: typeof Device
  initialized: boolean

  constructor(config: BugzzAppConfig) {
    this.config = config
    this.apiKey = config.apiKey
    this.appId = config.appId
    this.enabled = false
    this.initialized = false
    this.deviceInfo = Device
  }

  async init() {
    if (this.initialized) {
      return
    }

    this.setupErrorHandler()
    this.setupPromiseRejectionHandler()

    this.enabled = true
    this.initialized = true
  }

  setupErrorHandler() {
    if (ErrorUtils) {
      const originalHandler = ErrorUtils.getGlobalHandler();

      ErrorUtils.setGlobalHandler(async (error, isFatal) => {
        await this.captureError(error, { isFatal });
        originalHandler(error, isFatal);
      });
    }
  }

  setupPromiseRejectionHandler() {
    const rejectionTracking = require('promise/setimmediate/rejection-tracking');

    rejectionTracking.enable({
      allRejections: true,
      onUnhandled: async (id, error) => {
        console.log(typeof error, typeof id)
        console.log('here')
        await this.captureError(error, {
          type: 'unhandledPromiseRejection',
          promiseId: id
        });
      }
    });
  }

  async captureError(error: any, additionalInfo = {}) {
    if (!this.enabled) return;

    try {
      const errorReport = {
        timestamp: new Date().toISOString(),
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        device: this.deviceInfo,
        metadata: {
          ...additionalInfo,
          // lastAction: await this.getLastAction(),
          // currentRoute: await this.getCurrentRoute()
        }
      };

      // Store error locally first in case of network issues
      // await this.storeErrorLocally(errorReport);

      // Attempt to send error to server (implementation not shown)
      // await this.sendErrorToServer(errorReport);
    } catch (e) {
      console.error('Failed to capture error:', e);
    }
  }
}
