import * as Device from 'expo-device';
import { ErrorReporter } from './ErrorReporter';
import type { ErrorReporterInterface, MiteConfig } from './types';

export class Mite {
  private deviceInfo: typeof Device;
  private errorReporter: ErrorReporterInterface;
  private initialized = false;

  constructor(config: MiteConfig) {
    this.deviceInfo = Device;
    this.errorReporter = new ErrorReporter({
      appId: config.appId,
      publicKey: config.publicKey,
      endpoint: config.endpoint,
      timeout: config.timeout,
      retries: config.retries,
      deviceInfo: this.deviceInfo
    });
  }

  init() {
    if (this.initialized) {
      return;
    }
    this.errorReporter.init();
    this.initialized = true;
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
