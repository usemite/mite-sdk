import type { SubmitBugReportPayload, SubmitBugReportResponse } from './types'
import type { ApiClient } from './utils/client'

interface BugReporterConfig {
  apiClient: ApiClient
  deviceInfo: Record<string, unknown>
}

export class BugReporter {
  private apiClient: ApiClient
  private deviceInfo: Record<string, unknown>

  constructor(config: BugReporterConfig) {
    const { apiClient, deviceInfo } = config
    this.apiClient = apiClient
    this.deviceInfo = deviceInfo
  }

  private async getUploadUrl(): Promise<string> {
    const response = await this.apiClient.post<{ uploadUrl: string }>(
      '/api/v1/upload-url',
    )
    return response.uploadUrl
  }

  private async uploadFile(
    uploadUrl: string,
    uri: string,
    type?: string,
  ): Promise<string> {
    const response = await fetch(uri)
    const blob = await response.blob()

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': type || blob.type || 'image/jpeg' },
      body: blob,
    })

    const result = await uploadResponse.json()
    return result.storageId
  }

  async sendBugReportToServer(
    payload: Omit<SubmitBugReportPayload, 'appId' | 'deviceInfo'>,
  ): Promise<SubmitBugReportResponse> {
    const { attachments: localAttachments, ...rest } = payload

    let attachments: Array<{
      storage_id: string
      file_type?: string
      file_name?: string
    }> | undefined

    if (localAttachments && localAttachments.length > 0) {
      attachments = []
      for (const attachment of localAttachments) {
        const uploadUrl = await this.getUploadUrl()
        const storageId = await this.uploadFile(
          uploadUrl,
          attachment.uri,
          attachment.type,
        )
        attachments.push({
          storage_id: storageId,
          file_type: attachment.type,
          file_name: attachment.name,
        })
      }
    }

    return this.apiClient.post<SubmitBugReportResponse>(
      '/api/v1/bug-reports',
      {
        device_info: this.deviceInfo,
        ...rest,
        attachments,
      },
    )
  }
}
