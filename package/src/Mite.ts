import * as Device from 'expo-device';
import { ErrorReporter } from './ErrorReporter';
import type { ErrorReporterInterface, MiteConfig } from './types';
import { ApiClient } from './utils/client';

export class Mite {
  private deviceInfo: typeof Device;
  private errorReporter: ErrorReporterInterface;
  private initialized = false;
  private apiClient: ApiClient;

  constructor(config: MiteConfig) {
    this.deviceInfo = Device;
    this.apiClient = ApiClient.getInstance({
      timeout: config.timeout || 5000,
      maxRetries: config.retries,
      headers: {
        'x-app-public-key': config.publicKey,
        'X-SDK-Version': '1.0.0'
      }
    });
    this.errorReporter = new ErrorReporter({
      miteConfig: config,
      deviceInfo: this.deviceInfo,
      apiClient: this.apiClient
    });
  }

  init() {
    if (this.initialized) {
      return;
    }
    this.errorReporter.init();
    this.initialized = true;
    console.log('Initialized!');

  }

  /**
  * Capture an error and send it to the server
  * @param error
  * @param additionalInfo
  * @returns
  */
  async captureError(error: Error | Record<string, unknown>, additionalInfo: Record<string, unknown> = {}) {
    return this.errorReporter.captureError(error, additionalInfo);
  }

  public async logError(error: Error, metadata: Record<string, unknown> = {}) {
    return this.errorReporter.logError(error, metadata);
  }

  public disable() {
    this.errorReporter.disable();
  }

  public enable() {
    this.errorReporter.enable();
  }

  public isEnabled(): boolean {
    return this.errorReporter.isEnabled();
  }
}
