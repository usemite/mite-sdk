import type Device from 'expo-device'
import type { SubmitBugReportPayload, SubmitBugReportResponse } from './types'
import type { ApiClient } from './utils/client'

interface BugReporterConfig {
  apiClient: ApiClient
  deviceInfo: typeof Device
}

export class BugReporter {
  private apiClient: ApiClient
  private deviceInfo: typeof Device

  constructor(config: BugReporterConfig) {
    const { apiClient, deviceInfo } = config
    this.apiClient = apiClient
    this.deviceInfo = deviceInfo
  }

  async sendBugReportToServer(
    payload: Omit<SubmitBugReportPayload, 'appId' | 'deviceInfo'>,
  ): Promise<SubmitBugReportResponse> {
    return this.apiClient.post<SubmitBugReportResponse>(
      '/api/v1/bug-reports',
      {
        device_info: this.deviceInfo,
        ...payload,
      },
    )
  }
}
