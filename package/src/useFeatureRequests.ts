import { useCallback, useEffect, useState } from 'react'
import { useMite } from './MiteProvider'
import type {
  CreateFeatureRequestResponse,
  FeatureRequest,
  VoteFeatureRequestResponse,
} from './types'

export interface UseFeatureRequestsOptions {
  enabled?: boolean
  /**
   * @deprecated Votes are tied to the SDK's identified/anonymous end user.
   * Provide only to keep older email-based votes working.
   */
  voterEmail?: string
}

export interface SubmitFeatureRequestInput {
  title: string
  description?: string
  author_name?: string
  author_email: string
}

export interface UseFeatureRequestsResult {
  featureRequests: FeatureRequest[]
  votedFeatureRequestIds: string[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
  submitFeatureRequest: (
    input: SubmitFeatureRequestInput,
  ) => Promise<CreateFeatureRequestResponse>
  submitting: boolean
  submitError: Error | null
  toggleVote: (featureRequestId: string) => Promise<VoteFeatureRequestResponse>
  votingFeatureRequestIds: string[]
}

export function useFeatureRequests(
  options: UseFeatureRequestsOptions = {},
): UseFeatureRequestsResult {
  const mite = useMite()
  const { enabled = false, voterEmail } = options
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>([])
  const [votedFeatureRequestIds, setVotedFeatureRequestIds] = useState<string[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<Error | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<Error | null>(null)
  const [votingFeatureRequestIds, setVotingFeatureRequestIds] = useState<string[]>([])

  const fetchFeatureRequests = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [requests, votedIds] = await Promise.all([
        mite.features.list(),
        mite.getFeatureRequestVotes(voterEmail),
      ])

      setFeatureRequests(requests)
      setVotedFeatureRequestIds(votedIds)
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to fetch feature requests')
      setError(error)
      console.error('[Mite] useFeatureRequests error:', error)
    } finally {
      setLoading(false)
    }
  }, [mite, voterEmail])

  useEffect(() => {
    if (enabled) {
      void fetchFeatureRequests()
    }
  }, [enabled, fetchFeatureRequests])

  // When voteCount is omitted the voted flag is assumed to have flipped,
  // so the count moves by one in the matching direction.
  const applyVoteState = useCallback(
    (featureRequestId: string, voted: boolean, voteCount?: number) => {
      setVotedFeatureRequestIds(prev => {
        const hasVoted = prev.includes(featureRequestId)
        if (voted && !hasVoted) {
          return [...prev, featureRequestId]
        }
        if (!voted && hasVoted) {
          return prev.filter(id => id !== featureRequestId)
        }
        return prev
      })
      setFeatureRequests(prev =>
        prev.map(request => {
          if (request.id !== featureRequestId) {
            return request
          }
          const nextCount = voteCount ?? Math.max(0, request.voteCount + (voted ? 1 : -1))
          return { ...request, voteCount: nextCount }
        }),
      )
    },
    [],
  )

  const toggleVote = useCallback(
    async (featureRequestId: string) => {
      const wasVoted = votedFeatureRequestIds.includes(featureRequestId)
      setVotingFeatureRequestIds(prev => [...prev, featureRequestId])
      applyVoteState(featureRequestId, !wasVoted)

      try {
        const response = await mite.voteFeatureRequest({
          feature_request_id: featureRequestId,
          ...(voterEmail ? { voter_email: voterEmail } : {}),
        })
        applyVoteState(featureRequestId, response.voted, response.voteCount)
        return response
      } catch (err) {
        applyVoteState(featureRequestId, wasVoted)
        const error =
          err instanceof Error ? err : new Error('Failed to vote on feature request')
        console.error('[Mite] useFeatureRequests vote error:', error)
        throw error
      } finally {
        setVotingFeatureRequestIds(prev => prev.filter(id => id !== featureRequestId))
      }
    },
    [mite, voterEmail, votedFeatureRequestIds, applyVoteState],
  )

  const submitFeatureRequest = useCallback(
    async (input: SubmitFeatureRequestInput) => {
      setSubmitting(true)
      setSubmitError(null)

      try {
        const response = await mite.createFeatureRequest(input)
        await fetchFeatureRequests()
        return response
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to submit feature request')
        setSubmitError(error)
        console.error('[Mite] useFeatureRequests submit error:', error)
        throw error
      } finally {
        setSubmitting(false)
      }
    },
    [mite, fetchFeatureRequests],
  )

  return {
    featureRequests,
    votedFeatureRequestIds,
    loading,
    error,
    refetch: fetchFeatureRequests,
    submitFeatureRequest,
    submitting,
    submitError,
    toggleVote,
    votingFeatureRequestIds,
  }
}
