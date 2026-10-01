import { Mite } from '../Mite'
import { navigationTracker } from '../NavigationTracker'
import { triageContext } from '../TriageContext'
import type { MiteIdentityStorage } from '../types'

// Mock axios
jest.mock('axios', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      response: { use: jest.fn() },
      request: { use: jest.fn() },
    },
    defaults: { headers: { common: {} } },
  }
  return {
    create: jest.fn(() => mockAxiosInstance),
    __mockInstance: mockAxiosInstance,
  }
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const axios = require('axios')
const mockAxios = axios.__mockInstance

function createStorage(initialState?: Record<string, string>): MiteIdentityStorage {
  const store = new Map(Object.entries(initialState ?? {}))

  return {
    async getItem(key) {
      return store.get(key) ?? null
    },
    async setItem(key, value) {
      store.set(key, value)
    },
    async removeItem(key) {
      store.delete(key)
    },
  }
}

describe('Mite namespaced API', () => {
  let logSpy: jest.SpyInstance
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    navigationTracker.clear()
    triageContext.stop()
    triageContext.clear()
    logSpy = jest.spyOn(console, 'log').mockImplementation()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation()
  })

  afterEach(() => {
    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  describe('feedback.send', () => {
    it('posts a question to /api/v1/feedback with the kind and message, and no title', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'fb-1', status: 'NEEDS_TRIAGE' },
      })
      const mite = new Mite({ apiKey: 'test', identityStorage: createStorage() })

      const result = await mite.feedback.send({
        type: 'question',
        message: 'How do I export my data?',
      })

      expect(result).toEqual({ ok: true, report: { id: 'fb-1', status: 'NEEDS_TRIAGE' } })
      const [path, body] = mockAxios.post.mock.calls[0]
      expect(path).toBe('/api/v1/feedback')
      expect(body).toMatchObject({
        kind: 'question',
        description: 'How do I export my data?',
        anonymous_id: mite.user.anonymousId,
      })
      expect(body.title).toBeUndefined()
    })

    it('only accepts bug fields on a bug', () => {
      const mite = new Mite({})
      const send = (input: Parameters<typeof mite.feedback.send>[0]) => input
      // @ts-expect-error steps only exist on type: 'bug'
      send({ type: 'question', message: 'x', steps: '1. Tap' })
      // @ts-expect-error a message is required
      send({ type: 'idea' })
      expect(send({ type: 'bug', message: 'x', steps: '1. Tap' }).steps).toBe('1. Tap')
    })

    it('defaults the kind to other', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'fb-1', status: 'NEEDS_TRIAGE' },
      })
      const mite = new Mite({ apiKey: 'test', identityStorage: createStorage() })

      await mite.feedback.send({ message: 'Love it' })

      expect(mockAxios.post.mock.calls[0][1]).toMatchObject({ kind: 'other' })
    })

    it('maps bug fields and the reporter to the wire names', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'fb-1', status: 'NEEDS_TRIAGE' },
      })
      const mite = new Mite({ apiKey: 'test', identityStorage: createStorage() })

      await mite.feedback.send({
        type: 'bug',
        title: 'Checkout',
        message: 'Button does nothing',
        steps: 'Tap checkout',
        expected: 'Payment sheet',
        actual: 'Nothing',
        reporter: { name: 'Ana', email: 'ana@example.com' },
        context: { screen: 'Cart' },
      })

      expect(mockAxios.post.mock.calls[0][1]).toMatchObject({
        kind: 'bug',
        title: 'Checkout',
        description: 'Button does nothing',
        steps_to_reproduce: 'Tap checkout',
        expected_behavior: 'Payment sheet',
        actual_behavior: 'Nothing',
        reporter_name: 'Ana',
        reporter_email: 'ana@example.com',
        environment: expect.objectContaining({ screen: 'Cart' }),
      })
    })

    it('returns a quota refusal instead of throwing', async () => {
      mockAxios.post.mockRejectedValueOnce({
        response: {
          status: 402,
          data: {
            error: 'Out of reports',
            code: 'REPORT_QUOTA_EXCEEDED',
            quota: { limit: 50, used: 50 },
          },
        },
      })
      const mite = new Mite({ apiKey: 'test', identityStorage: createStorage() })

      const result = await mite.feedback.send({ message: 'Hi' })

      expect(result.ok).toBe(false)
    })
  })

  describe('features', () => {
    it('requests a feature with the author mapped to the wire names', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'fr-1', status: 'OPEN' } })
      const mite = new Mite({ apiKey: 'test', identityStorage: createStorage() })

      await mite.features.request({
        title: 'Dark mode',
        author: { email: 'Ana@Example.com', name: 'Ana' },
      })

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/feature-requests',
        expect.objectContaining({
          title: 'Dark mode',
          author_email: 'ana@example.com',
          author_name: 'Ana',
        }),
        undefined,
      )
    })

    it('votes by id', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { voted: true, voteCount: 3 } })
      const mite = new Mite({ apiKey: 'test', identityStorage: createStorage() })

      await expect(mite.features.vote('fr-1')).resolves.toEqual({
        voted: true,
        voteCount: 3,
      })
      expect(mockAxios.post.mock.calls[0][1]).toMatchObject({
        feature_request_id: 'fr-1',
      })
    })
  })

  describe('user', () => {
    it('identifies by id and exposes it, then forgets it on reset', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 'p-1', created: true } })
      const mite = new Mite({ apiKey: 'test', identityStorage: createStorage() })

      await mite.user.identify('user-42', {
        email: 'a@b.co',
        isPaying: true,
        traits: { plan: 'pro' },
      })

      expect(mockAxios.post.mock.calls[0][1]).toMatchObject({
        user_identifier: 'user-42',
        email: 'a@b.co',
        metadata: expect.objectContaining({ plan: 'pro', is_paying: true }),
      })
      expect(mite.user.id).toBe('user-42')

      await mite.user.reset()
      expect(mite.user.id).toBeUndefined()
    })

    it('opts out and back in', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 'p-1', created: true } })
      const mite = new Mite({ apiKey: 'test', identityStorage: createStorage() })

      await mite.user.optOut()
      expect(mite.user.isOptedOut).toBe(true)
      await mite.user.optIn()
      expect(mite.user.isOptedOut).toBe(false)
    })
  })
})
