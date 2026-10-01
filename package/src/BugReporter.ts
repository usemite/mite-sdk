import type {
  MiteQuotaRefusal,
  ReportWirePayload,
  SubmitBugReportPayload,
  SubmitBugReportResponse,
  SubmitBugResult,
} from './types'
import type { ApiClient } from './utils/client'
import { type FlatStringRecord, normalizeDeviceInfo } from './utils/deviceInfo'
import { parseQuotaRefusal } from './utils/quota'

interface BugReporterConfig {
  apiClient: ApiClient
  deviceInfo: FlatStringRecord
}

interface SendBugReportOptions {
  includeDefaultDeviceInfo?: boolean
  /** `/api/v1/feedback`, or `/api/v1/bug-reports` for the 1.0.0 call. */
  path?: ReportPath
}

export type ReportPath = '/api/v1/feedback' | '/api/v1/bug-reports'

interface UploadedAttachment {
  storage_id: string
  file_type?: string
  file_name?: string
}

interface AttachmentUploadOutcome {
  uploaded: UploadedAttachment[]
  /** Set when the account is out of reports. No report can be created. */
  reportRefusal?: MiteQuotaRefusal
  /** Set when the account is out of storage. The report still goes out. */
  storageRefusal?: MiteQuotaRefusal
}

export class BugReporter {
  private apiClient: ApiClient
  private deviceInfo: FlatStringRecord

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

  /**
   * Upload every attachment. The upload URL endpoint can refuse with either
   * quota code, so branch on the code and not on the endpoint.
   */
  private async uploadAttachments(
    localAttachments: NonNullable<SubmitBugReportPayload['attachments']>,
  ): Promise<AttachmentUploadOutcome> {
    const uploaded: UploadedAttachment[] = []

    for (const attachment of localAttachments) {
      let uploadUrl: string

      try {
        uploadUrl = await this.getUploadUrl()
      } catch (err) {
        const refusal = parseQuotaRefusal(err)
        if (!refusal) throw err

        // Out of reports. The bug report would be refused as well, so stop
        // here rather than send a request that cannot succeed.
        if (refusal.code === 'REPORT_QUOTA_EXCEEDED') {
          return { uploaded, reportRefusal: refusal }
        }

        // Out of storage. Storage is a standing total, so the attachments
        // that are left cannot fit either. The report text is the value the
        // customer must not lose, so stop uploading and keep going.
        return { uploaded, storageRefusal: refusal }
      }

      const storageId = await this.uploadFile(uploadUrl, attachment.uri, attachment.type)
      uploaded.push({
        storage_id: storageId,
        file_type: attachment.type,
        file_name: attachment.name,
      })
    }

    return { uploaded }
  }

  async sendBugReportToServer(
    payload: ReportWirePayload,
    options: SendBugReportOptions = {},
  ): Promise<SubmitBugResult> {
    const { attachments: localAttachments, device_info, ...rest } = payload
    const { includeDefaultDeviceInfo = true, path = '/api/v1/bug-reports' } = options

    let attachments: UploadedAttachment[] | undefined
    let droppedAttachments: { count: number; refusal: MiteQuotaRefusal } | undefined

    if (localAttachments && localAttachments.length > 0) {
      const outcome = await this.uploadAttachments(localAttachments)

      if (outcome.reportRefusal) {
        return { ok: false, refusal: outcome.reportRefusal }
      }

      if (outcome.storageRefusal) {
        droppedAttachments = {
          count: localAttachments.length - outcome.uploaded.length,
          refusal: outcome.storageRefusal,
        }
      }

      attachments = outcome.uploaded.length > 0 ? outcome.uploaded : undefined
    }

    const requestBody: Record<string, unknown> = {
      ...rest,
      attachments,
    }

    if (device_info) {
      requestBody.device_info = normalizeDeviceInfo(device_info)
    } else if (includeDefaultDeviceInfo) {
      requestBody.device_info = normalizeDeviceInfo(this.deviceInfo)
    }

    try {
      const report = await this.apiClient.post<SubmitBugReportResponse>(path, requestBody)

      return droppedAttachments
        ? { ok: true, report, droppedAttachments }
        : { ok: true, report }
    } catch (err) {
      const refusal = parseQuotaRefusal(err)
      if (!refusal) throw err

      return { ok: false, refusal }
    }
  }
}
