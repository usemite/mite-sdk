import axios, { type AxiosInstance } from 'axios';
import type Device from 'expo-device';
import type { ApiClientConfig, ErrorReport, ErrorReporterInterface } from './types';

export class ErrorReporter implements ErrorReporterInterface {
  private appId: string;
  private publicKey: string;
  private deviceInfo: typeof Device;
  private client: AxiosInstance;
  private initialized = false;
  private enabled = false;

  constructor(config: ApiClientConfig) {
    this.appId = config.appId;
    this.publicKey = config.publicKey;
    this.deviceInfo = config.deviceInfo;

    this.client = axios.create({
      // TODO: change this endpoint to use ENV variable
      baseURL: config.endpoint,
      timeout: config.timeout || 5000,
      headers: {
        'Content-Type': 'application/json',
        'X-App-Public-Key': this.publicKey,
        'X-SDK-Version': '1.0.0'
      }
    });

    if (config.retries) {
      this.setupRetry(config.retries);
    }

    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          console.error('[Mite] Server error:', {
            status: error.response.status,
            data: error.response.data
          });
        } else if (error.request) {
          console.error('[Mite] Network error:', error.message);
        } else {
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

  async captureError(error: Error | Record<string, unknown>, additionalInfo: Record<string, unknown> = {}) {
    if (!this.enabled || !this.initialized) return;

    console.log('REPORTING ERROR', error);

    try {
      const errorReport: ErrorReport = {
        timestamp: new Date().toISOString(),
        error: {
          error_name: typeof error.name === 'string' ? error.name : 'Unknown Error',
          error_message: typeof error.message === 'string' ? error.message : 'No error message',
          error_stack: typeof error.stack === 'string' ? error.stack : 'No stack trace',
          ...(('type' in error) && { type: String(error.type) }),
          ...(('promise_id' in error) && { promiseId: String(error.promiseId) })
        },
        device: this.deviceInfo,
        metadata: {
          ...(Object.entries(additionalInfo).reduce((acc, [key, value]) => {
            // Convert all values to string, number, or boolean
            acc[key] = typeof value === 'object' ? JSON.stringify(value) : value as string | number | boolean;
            return acc;
          }, {} as Record<string, string | number | boolean>))
        }
      };

      await this.sendErrorToServer(errorReport);
    } catch (e) {
      console.error('[Mite] Failed to capture error:', e);
    }
  }

  public async logError(error: Error, metadata: Record<string, unknown> = {}) {
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

  public getClient(): AxiosInstance {
    return this.client;
  }
}
