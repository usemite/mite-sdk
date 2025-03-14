import type { AxiosInstance } from 'axios';
import type Device from 'expo-device';
import { ApiClient } from './utils/client';
import type { ApiClientConfig, ErrorReport, ErrorReporterInterface } from './types';

export class ErrorReporter implements ErrorReporterInterface {
  private appId: string;
  private publicKey: string;
  private deviceInfo: typeof Device;
  private apiClient: ApiClient;
  private client: AxiosInstance;
  private initialized = false;
  private enabled = false;

  constructor(config: ApiClientConfig) {
    this.appId = config.appId;
    this.publicKey = config.publicKey;
    this.deviceInfo = config.deviceInfo;

    // Create ApiClient instance
    this.apiClient = ApiClient.getInstance({
      baseURL: config.endpoint || 'https://api.mite.dev',
      timeout: config.timeout || 5000,
      maxRetries: config.retries,
      headers: {
        'X-App-Public-Key': this.publicKey,
        'X-SDK-Version': '1.0.0'
      }
    });

    // Get underlying axios instance for backwards compatibility
    this.client = this.apiClient.getAxiosInstance();
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
      await this.apiClient.post('/error-reporting', {
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
  
  public getApiClient(): ApiClient {
    return this.apiClient;
  }
}
