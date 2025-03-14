import axios, { type AxiosInstance } from 'axios';
import * as Device from 'expo-device';
import type { ErrorReport, MiteConfig } from './types';

export class Mite {
  private appId: string;
  private publicKey: string;
  private deviceInfo: typeof Device;
  private client: AxiosInstance;
  private initialized = false;
  private enabled = false;

  constructor(config: MiteConfig) {
    this.appId = config.appId;
    this.publicKey = config.publicKey;
    this.deviceInfo = Device;

    // Initialize axios client with defaults
    this.client = axios.create({
      // TODO: change this endpoint to use ENV variable
      baseURL: config.endpoint || 'http://127.0.0.1:54321/functions/v1/',
      timeout: config.timeout || 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-App-Public-Key': this.publicKey,
        'X-SDK-Version': '1.0.0'
      }
    });

    // Add retry logic
    if (config.retries) {
      this.setupRetry(config.retries);
    }

    // Add response interceptor for better error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          console.error('[Mite] Server error:', {
            status: error.response.status,
            data: error.response.data
          });
        } else if (error.request) {
          // The request was made but no response was received
          console.error('[Mite] Network error:', error.message);
        } else {
          // Something happened in setting up the request that triggered an Error
          console.error('[Mite] Request setup error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  private setupRetry(maxRetries: number) {
    let retryCount = 0;

    this.client.interceptors.response.use(null, async error => {
      const config = error.config;

      if (!config || !config.retry || retryCount >= maxRetries) {
        return Promise.reject(error);
      }

      retryCount += 1;

      // Exponential backoff
      const backoff = Math.min(1000 * (2 ** retryCount), 10000);

      await new Promise(resolve => setTimeout(resolve, backoff));

      return this.client(config);
    });
  }

  init() {
    if (this.initialized) {
      return;
    }

    this.setupErrorHandler();
    this.setupPromiseRejectionHandler();

    this.enabled = true;
    this.initialized = true;
  }

  private setupErrorHandler() {
    if (ErrorUtils) {
      const originalHandler = ErrorUtils.getGlobalHandler();

      ErrorUtils.setGlobalHandler(async (error, isFatal) => {
        await this.captureError(error, { isFatal });
        originalHandler(error, isFatal);
      });
    }
  }

  private setupPromiseRejectionHandler() {
    const rejectionTracking = require('promise/setimmediate/rejection-tracking');

    rejectionTracking.enable({
      allRejections: true,
      onUnhandled: async (id: string, error: Record<string, unknown>) => {
        await this.captureError(error, {
          type: 'unhandledPromiseRejection',
          promiseId: id
        });
      }
    });
  }

  private async sendErrorToServer(errorReport: ErrorReport) {
    if (!this.enabled || !this.initialized) return;

    try {
      await this.client.post('/error-reporting', {
        timestamp: Date.now(),
        appId: this.appId,
        error: {
          name: errorReport.error.error_name,
          message: errorReport.error.error_message,
          stack: errorReport.error.error_stack,
          type: errorReport.error.type,
          promiseId: errorReport.error.promiseId,
        },
        deviceInfo: this.deviceInfo,
        metadata: errorReport.metadata
      });
    } catch (e) {
      // Error already logged by interceptor
      // console.error('[Mite] Failed to send error to server:', e);
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  async captureError(error: Error | Record<string, any>, additionalInfo = {}) {
    if (!this.enabled || !this.initialized) return;

    console.log('REPORTING ERROR', error);

    try {
      const errorReport: ErrorReport = {
        timestamp: new Date().toISOString(),
        error: {
          error_name: error.name || 'Unknown Error',
          error_message: error.message || 'No error message',
          error_stack: error.stack || 'No stack trace',
          ...(('type' in error) && { type: error.type }),
          ...(('promise_id' in error) && { promiseId: error.promiseId })
        },
        device: this.deviceInfo,
        metadata: {
          ...additionalInfo
        }
      };

      await this.sendErrorToServer(errorReport);
    } catch (e) {
      console.error('[Mite] Failed to capture error:', e);
    }
  }

  // Public methods
  public async logError(error: Error, metadata = {}) {
    await this.captureError(error, metadata);
  }

  public disable() {
    this.enabled = false;
  }

  public enable() {
    this.enabled = true;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  // Allow access to the axios instance for advanced configuration
  public getClient(): AxiosInstance {
    return this.client;
  }
}
