import { useCallback } from 'react'
import { useMite } from './MiteProvider'
import type {
  MiteQuotaRefusal,
  SendFeedbackInput,
  SendFeedbackResult,
  SubmitBugReportResponse,
} from './types'
import { useReportSubmission } from './useBugReport'

export interface UseFeedbackResult {
  send: (input: SendFeedbackInput) => Promise<SendFeedbackResult>
  sending: boolean
  error: Error | null
  lastResponse: SubmitBugReportResponse | null
  /**
   * Set when the account is over a plan limit. A refusal is not a fault, so
   * `error` stays null and `send` does not throw. When `lastResponse` is also
   * set, the feedback went out but its attachments did not.
   */
  refusal: MiteQuotaRefusal | null
  reset: () => void
}

/** `mite.feedback.send()` with its state, for a feedback form. */
export function useFeedback(): UseFeedbackResult {
  const mite = useMite()
  const submit = useCallback(
    (input: SendFeedbackInput) => mite.feedback.send(input),
    [mite],
  )
  const { run, submitting, ...state } = useReportSubmission(submit)
  return { send: run, sending: submitting, ...state }
}
