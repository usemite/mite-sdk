import { useCallback, useState } from 'react'
import { useMite } from './MiteProvider'
import type {
  MiteQuotaRefusal,
  SubmitBugReportPayload,
  SubmitBugReportResponse,
  SubmitBugResult,
} from './types'

export type BugReportPayload = Omit<SubmitBugReportPayload, 'appId' | 'deviceInfo'>

export interface UseBugReportResult {
  submitBug: (payload: BugReportPayload) => Promise<SubmitBugResult>
  submitting: boolean
  error: Error | null
  lastResponse: SubmitBugReportResponse | null
  /**
   * Set when the account is over a plan limit. A refusal is not a fault, so
   * `error` stays null and `submitBug` does not throw. When `lastResponse` is
   * also set, the report went out but its attachments did not.
   */
  refusal: MiteQuotaRefusal | null
  reset: () => void
}

/**
 * Submission state for any report call: in flight, the last fault, the last
 * report, and a plan-limit refusal kept apart from faults.
 */
export function useReportSubmission<TInput>(
  submit: (input: TInput) => Promise<SubmitBugResult>,
) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastResponse, setLastResponse] = useState<SubmitBugReportResponse | null>(null)
  const [refusal, setRefusal] = useState<MiteQuotaRefusal | null>(null)

  const run = useCallback(
    async (input: TInput) => {
      setSubmitting(true)
      setError(null)
      setRefusal(null)

      try {
        const result = await submit(input)

        if (result.ok) {
          setLastResponse(result.report)
          if (result.droppedAttachments) {
            setRefusal(result.droppedAttachments.refusal)
          }
        } else {
          // No report exists. A stale `lastResponse` from an earlier success
          // would read as "the report went out, only its files were dropped".
          setLastResponse(null)
          setRefusal(result.refusal)
        }

        return result
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to submit bug report')
        setError(error)
        throw error
      } finally {
        setSubmitting(false)
      }
    },
    [submit],
  )

  const reset = useCallback(() => {
    setError(null)
    setLastResponse(null)
    setRefusal(null)
  }, [])

  return { run, submitting, error, lastResponse, refusal, reset }
}

export function useBugReport(): UseBugReportResult {
  const mite = useMite()
  const submit = useCallback(
    (payload: BugReportPayload) => mite.submitBug(payload),
    [mite],
  )
  const { run, ...state } = useReportSubmission(submit)
  return { submitBug: run, ...state }
}
