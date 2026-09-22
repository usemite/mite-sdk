import { Mite } from '../Mite'
import { navigationTracker, recordNavigationBreadcrumb } from '../NavigationTracker'
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

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(() => resolve(), 0))
}

describe('Mite', () => {
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    navigationTracker.configure({ enabled: true })
    navigationTracker.clear()
    triageContext.stop()
    triageContext.clear()
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })

  describe('constructor', () => {
    it('creates instance with minimal config', () => {
      const mite = new Mite({})
      expect(mite).toBeInstanceOf(Mite)
    })

    it('creates instance with full config', () => {
      const mite = new Mite({
        apiKey: 'test-key',
        endpoint: 'https://example.com',
        timeout: 10000,
        retries: 3,
      })
      expect(mite).toBeInstanceOf(Mite)
    })

    it('stores authorization header in axios defaults when apiKey is provided', () => {
      new Mite({ apiKey: 'test-key' })

      expect(mockAxios.defaults.headers.common).toEqual(
        expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      )
    })

    it('creates an anonymous id automatically', () => {
      const mite = new Mite({ apiKey: 'test-key' })

      expect(mite.anonymousId).toMatch(/^anon_/)
    })

    it('uses a configured anonymous id override', () => {
      const mite = new Mite({
        apiKey: 'test-key',
        anonymousId: 'anon_custom',
      })

      expect(mite.anonymousId).toBe('anon_custom')
    })

    it('restores the anonymous id from storage', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: '123', created: true } })
      const storage = createStorage({
        '@mite/sdk-identity': JSON.stringify({
          anonymousId: 'anon_persisted',
          identificationOptOut: false,
        }),
      })

      const mite = new Mite({
        apiKey: 'test-key',
        identityStorage: storage,
      })

      await mite.identify({})

      expect(mite.anonymousId).toBe('anon_persisted')
    })

    it('keeps the stored anonymous id when the hydration read fails', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: '123', created: true } })
      const backing = createStorage({
        '@mite/sdk-identity': JSON.stringify({
          anonymousId: 'anon_persisted',
          identificationOptOut: false,
        }),
      })
      let failRead = true
      const storage: MiteIdentityStorage = {
        getItem: key =>
          failRead
            ? Promise.reject(new Error('storage unavailable'))
            : backing.getItem(key),
        setItem: (key, value) => backing.setItem(key, value),
        removeItem: key => backing.removeItem(key),
      }

      const first = new Mite({ apiKey: 'test-key', identityStorage: storage })
      await first.getReleases().catch(() => undefined)
      expect(first.anonymousId).not.toBe('anon_persisted')

      failRead = false
      const second = new Mite({ apiKey: 'test-key', identityStorage: storage })
      await second.identify({})

      expect(second.anonymousId).toBe('anon_persisted')
    })

    it('does not poison later calls when the hydration write fails', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: '123', created: true } })
      const storage: MiteIdentityStorage = {
        getItem: async () => null,
        setItem: async () => {
          throw new Error('storage unavailable')
        },
        removeItem: async () => undefined,
      }

      const mite = new Mite({ apiKey: 'test-key', identityStorage: storage })

      await expect(
        mite.submitBug({ title: 'a', description: 'b' }),
      ).resolves.toBeDefined()
    })

    it('warns when configured identity storage does not work', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: '123', created: true } })
      const storage: MiteIdentityStorage = {
        getItem: async () => {
          throw new Error('storage unavailable')
        },
        setItem: async () => undefined,
        removeItem: async () => undefined,
      }

      const mite = new Mite({ apiKey: 'test-key', identityStorage: storage })
      await mite.identify({})

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Mite] Identity storage read failed.'),
      )
    })
  })

  describe('init', () => {
    it('initializes the SDK', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 'anon-user', created: true } })
      const mite = new Mite({ apiKey: 'test' })
      mite.init()
      await flushPromises()

      expect(consoleLogSpy).toHaveBeenCalledWith('[Mite] SDK initialized')
      mite.destroy()
    })

    it('warns on double initialization', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 'anon-user', created: true } })
      const mite = new Mite({ apiKey: 'test' })
      mite.init()
      mite.init()
      await flushPromises()

      expect(consoleWarnSpy).toHaveBeenCalledWith('[Mite] SDK already initialized')
      mite.destroy()
    })

    it('respects enableOfflineQueue=false', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 'anon-user', created: true } })
      const mite = new Mite({
        apiKey: 'test',
        enableOfflineQueue: false,
      })
      mite.init()
      await flushPromises()

      expect(consoleLogSpy).not.toHaveBeenCalledWith('[Mite] Offline queue enabled')
      mite.destroy()
    })

    it('automatically syncs the current identity on init', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 'anon-user', created: true } })
      const mite = new Mite({ apiKey: 'test' })
      mite.init()
      await flushPromises()

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/identify',
        expect.objectContaining({
          anonymous_id: mite.anonymousId,
        }),
        undefined,
      )
    })
  })

  describe('destroy', () => {
    it('cleans up resources', () => {
      const mite = new Mite({ apiKey: 'test' })
      mite.init()
      mite.destroy()

      expect(mite.pendingRequestCount).toBe(0)
    })
  })

  describe('identify', () => {
    it('throws without apiKey', async () => {
      const mite = new Mite({})

      await expect(mite.identify({ user_identifier: 'user1' })).rejects.toThrow(
        '[Mite] API key is required',
      )
    })

    it('uses the anonymous id when no identifiers are provided', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: '123', created: true },
      })

      const mite = new Mite({ apiKey: 'test' })

      await expect(mite.identify({})).resolves.toEqual({
        id: '123',
        created: true,
      })

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/identify',
        expect.objectContaining({
          anonymous_id: mite.anonymousId,
        }),
        undefined,
      )
    })

    it('sends identify request', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: '123', created: true },
      })

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.identify({ user_identifier: 'user1' })

      expect(result).toEqual({ id: '123', created: true })
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/identify',
        expect.objectContaining({
          user_identifier: 'user1',
          anonymous_id: mite.anonymousId,
        }),
        undefined,
      )
    })

    it('normalizes default device_info values to strings for identify', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: '123', created: true },
      })

      const mite = new Mite({ apiKey: 'test' })
      await mite.identify({ user_identifier: 'user1' })

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/identify',
        expect.objectContaining({
          user_identifier: 'user1',
          device_info: expect.objectContaining({
            brand: 'TestBrand',
            deviceYearClass: '2024',
            isDevice: 'true',
            platformApiLevel: '34',
            supportedCpuArchitectures: '["arm64"]',
            totalMemory: '8000000000',
          }),
        }),
        undefined,
      )
    })

    it('persists the identified user id for later sessions', async () => {
      const storage = createStorage()
      mockAxios.post.mockResolvedValue({ data: { id: '123', created: true } })

      const mite = new Mite({
        apiKey: 'test',
        identityStorage: storage,
      })
      await mite.identify({ user_identifier: 'user1' })

      const nextMite = new Mite({
        apiKey: 'test',
        identityStorage: storage,
      })
      await nextMite.identify({})

      expect(mockAxios.post).toHaveBeenLastCalledWith(
        '/api/v1/identify',
        expect.objectContaining({
          user_identifier: 'user1',
          anonymous_id: mite.anonymousId,
        }),
        undefined,
      )
    })
  })

  describe('getReleases', () => {
    it('throws without apiKey', async () => {
      const mite = new Mite({})

      await expect(mite.getReleases()).rejects.toThrow('[Mite] API key is required')
    })

    it('fetches releases', async () => {
      const releases = [{ id: '1', version: '1.0.0', versionCode: 1, platform: 'all' }]
      mockAxios.get.mockResolvedValueOnce({ data: { releases } })

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.getReleases({ platform: 'ios', limit: 5 })

      expect(result).toEqual(releases)
    })
  })

  describe('feature requests', () => {
    it('fetches feature requests', async () => {
      const requests = [
        {
          id: 'fr_1',
          title: 'Offline mode',
          description: 'Cache updates locally',
          authorName: 'Test User',
          voteCount: 3,
          status: 'OPEN',
          createdAt: 123,
        },
      ]
      mockAxios.get.mockResolvedValueOnce({ data: { requests } })

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.getFeatureRequests()

      expect(result).toEqual(requests)
      expect(mockAxios.get).toHaveBeenCalledWith('/api/v1/feature-requests', undefined)
    })

    it('creates feature requests tied to the anonymous id', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'fr_1', status: 'OPEN' },
      })

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.createFeatureRequest({
        title: ' Offline mode ',
        description: ' Cache updates locally ',
        author_email: 'user@example.com',
      })

      expect(result).toEqual({ id: 'fr_1', status: 'OPEN' })
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/feature-requests',
        {
          title: 'Offline mode',
          description: 'Cache updates locally',
          author_email: 'user@example.com',
          anonymous_id: mite.anonymousId,
        },
        undefined,
      )
    })

    it('creates feature requests with a normalized email and optional name', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'fr_1', status: 'OPEN' },
      })

      const mite = new Mite({ apiKey: 'test' })
      await mite.createFeatureRequest({
        title: ' Offline mode ',
        author_name: ' Test User ',
        author_email: 'USER@EXAMPLE.COM ',
      })

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/feature-requests',
        {
          title: 'Offline mode',
          description: '',
          author_email: 'user@example.com',
          anonymous_id: mite.anonymousId,
          author_name: 'Test User',
        },
        undefined,
      )
    })

    it('includes the identified user id when creating feature requests', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ data: { id: '123', created: true } })
        .mockResolvedValueOnce({ data: { id: 'fr_1', status: 'OPEN' } })

      const mite = new Mite({ apiKey: 'test' })
      await mite.identify({ user_identifier: 'user1' })
      await mite.createFeatureRequest({
        title: 'Offline mode',
        author_email: 'user@example.com',
      })

      expect(mockAxios.post).toHaveBeenLastCalledWith(
        '/api/v1/feature-requests',
        {
          title: 'Offline mode',
          description: '',
          author_email: 'user@example.com',
          anonymous_id: mite.anonymousId,
          user_identifier: 'user1',
        },
        undefined,
      )
    })

    it('omits the user identifier but keeps author fields when opted out', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 'fr_1', status: 'OPEN' } })

      const mite = new Mite({ apiKey: 'test' })
      await mite.identify({ user_identifier: 'user1' })
      await mite.setIdentificationOptOut(true)
      await mite.createFeatureRequest({
        title: 'Offline mode',
        author_name: 'Test User',
        author_email: 'user@example.com',
      })

      expect(mockAxios.post).toHaveBeenLastCalledWith(
        '/api/v1/feature-requests',
        {
          title: 'Offline mode',
          description: '',
          author_email: 'user@example.com',
          anonymous_id: mite.anonymousId,
          author_name: 'Test User',
        },
        undefined,
      )
    })

    it('votes on feature requests tied to the anonymous id', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { voted: true, voteCount: 4 },
      })

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.voteFeatureRequest({
        feature_request_id: 'fr_1',
      })

      expect(result).toEqual({ voted: true, voteCount: 4 })
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/feature-requests/vote',
        {
          feature_request_id: 'fr_1',
          anonymous_id: mite.anonymousId,
        },
        undefined,
      )
    })

    it('includes the identified user id when voting', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ data: { id: '123', created: true } })
        .mockResolvedValueOnce({ data: { voted: true, voteCount: 4 } })

      const mite = new Mite({ apiKey: 'test' })
      await mite.identify({ user_identifier: 'user1' })
      await mite.voteFeatureRequest({ feature_request_id: 'fr_1' })

      expect(mockAxios.post).toHaveBeenLastCalledWith(
        '/api/v1/feature-requests/vote',
        {
          feature_request_id: 'fr_1',
          anonymous_id: mite.anonymousId,
          user_identifier: 'user1',
        },
        undefined,
      )
    })

    it('keeps supporting legacy email-based votes', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { voted: true, voteCount: 4 },
      })

      const mite = new Mite({ apiKey: 'test' })
      await mite.voteFeatureRequest({
        feature_request_id: 'fr_1',
        voter_email: 'USER@EXAMPLE.COM ',
      })

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/feature-requests/vote',
        {
          feature_request_id: 'fr_1',
          anonymous_id: mite.anonymousId,
          voter_email: 'user@example.com',
        },
        undefined,
      )
    })

    it('fetches voted feature request ids for the current identity', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { featureRequestIds: ['fr_1', 'fr_2'] },
      })

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.getFeatureRequestVotes()

      expect(result).toEqual(['fr_1', 'fr_2'])
      expect(mockAxios.get).toHaveBeenCalledWith(
        `/api/v1/feature-requests/votes?anonymous_id=${encodeURIComponent(mite.anonymousId)}`,
        undefined,
      )
    })

    it('fetches voted feature request ids for an email', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { featureRequestIds: ['fr_1', 'fr_2'] },
      })

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.getFeatureRequestVotes('USER@EXAMPLE.COM ')

      expect(result).toEqual(['fr_1', 'fr_2'])
      expect(mockAxios.get).toHaveBeenCalledWith(
        '/api/v1/feature-requests/votes?voter_email=user%40example.com',
        undefined,
      )
    })
  })

  describe('pendingRequestCount', () => {
    it('returns 0 when offline queue is not enabled', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 'anon-user', created: true } })
      const mite = new Mite({
        apiKey: 'test',
        enableOfflineQueue: false,
      })
      mite.init()
      await flushPromises()
      expect(mite.pendingRequestCount).toBe(0)
      mite.destroy()
    })
  })

  describe('submitBug', () => {
    it('throws without apiKey', async () => {
      const mite = new Mite({})

      await expect(
        mite.submitBug({
          title: 'Test Bug',
          description: 'A test bug report',
        }),
      ).rejects.toThrow('[Mite] API key is required')
    })

    it('submits a bug report', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'bug-1', status: 'OPEN' },
      })

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
      })

      expect(result).toEqual({ ok: true, report: { id: 'bug-1', status: 'OPEN' } })
    })

    it('includes the anonymous id automatically in bug reports', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'bug-1', status: 'OPEN' },
      })

      const mite = new Mite({ apiKey: 'test' })
      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
      })

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/bug-reports',
        expect.objectContaining({
          anonymous_id: mite.anonymousId,
        }),
        undefined,
      )
    })

    it('reuses the identified user id for later bug reports', async () => {
      mockAxios.post
        .mockResolvedValueOnce({
          data: { id: '123', created: true },
        })
        .mockResolvedValueOnce({
          data: { id: 'bug-1', status: 'OPEN' },
        })

      const mite = new Mite({ apiKey: 'test' })
      const anonymousId = mite.anonymousId

      await mite.identify({ user_identifier: 'user1' })
      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
      })

      expect(mockAxios.post).toHaveBeenLastCalledWith(
        '/api/v1/bug-reports',
        expect.objectContaining({
          user_identifier: 'user1',
          anonymous_id: anonymousId,
        }),
        undefined,
      )
    })

    it('keeps the anonymous id after logout but stops sending the user id', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: '123', created: true } })

      const mite = new Mite({ apiKey: 'test' })
      const anonymousId = mite.anonymousId

      await mite.identify({ user_identifier: 'user1' })
      await mite.logout()
      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
      })

      expect(mockAxios.post).toHaveBeenLastCalledWith(
        '/api/v1/bug-reports',
        expect.objectContaining({
          anonymous_id: anonymousId,
        }),
        undefined,
      )
      expect(mockAxios.post).toHaveBeenLastCalledWith(
        '/api/v1/bug-reports',
        expect.not.objectContaining({
          user_identifier: expect.anything(),
        }),
        undefined,
      )
    })

    it('omits identified fields and device info when opted out', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: '123', created: true } })

      const mite = new Mite({ apiKey: 'test' })
      await mite.identify({ user_identifier: 'user1' })
      await mite.setIdentificationOptOut(true)
      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
        reporter_name: 'Test User',
        reporter_email: 'user@example.com',
      })

      expect(mockAxios.post).toHaveBeenLastCalledWith(
        '/api/v1/bug-reports',
        expect.objectContaining({
          anonymous_id: mite.anonymousId,
        }),
        undefined,
      )

      const lastCall = mockAxios.post.mock.calls.at(-1)?.[1]
      expect(lastCall).toEqual(
        expect.not.objectContaining({
          user_identifier: expect.anything(),
          reporter_name: expect.anything(),
          reporter_email: expect.anything(),
          device_info: expect.anything(),
        }),
      )
    })

    it('sends only anonymous identity when opted out', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: '123', created: true } })

      const mite = new Mite({ apiKey: 'test' })
      await mite.setIdentificationOptOut(true)
      await mite.identify({
        user_identifier: 'user1',
        email: 'user@example.com',
        name: 'Test User',
      })

      expect(mockAxios.post).toHaveBeenLastCalledWith(
        '/api/v1/identify',
        {
          anonymous_id: mite.anonymousId,
        },
        undefined,
      )
    })

    it('attaches the navigation trail to the bug report payload', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'bug-1', status: 'OPEN' },
      })

      const mite = new Mite({ apiKey: 'test' })
      recordNavigationBreadcrumb('Home')
      recordNavigationBreadcrumb('Settings')

      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
        environment: { build_type: 'debug' },
      })

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/bug-reports',
        expect.objectContaining({
          environment: { build_type: 'debug', current_route: 'Settings' },
          navigation_trail: [
            expect.objectContaining({ screen: 'Home' }),
            expect.objectContaining({ screen: 'Settings' }),
          ],
        }),
        undefined,
      )
    })

    it('attaches the navigation trail when opted out of identification', async () => {
      mockAxios.post.mockResolvedValue({ data: { id: 'bug-1', status: 'OPEN' } })

      const mite = new Mite({ apiKey: 'test' })
      await mite.setIdentificationOptOut(true)
      recordNavigationBreadcrumb('Home')

      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
      })

      expect(mockAxios.post).toHaveBeenLastCalledWith(
        '/api/v1/bug-reports',
        expect.objectContaining({
          navigation_trail: [expect.objectContaining({ screen: 'Home' })],
        }),
        undefined,
      )
    })

    it('omits the navigation trail when no breadcrumbs were recorded', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'bug-1', status: 'OPEN' },
      })

      const mite = new Mite({ apiKey: 'test' })
      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
      })

      const lastCall = mockAxios.post.mock.calls.at(-1)?.[1]
      expect(lastCall).toEqual(
        expect.not.objectContaining({
          navigation_trail: expect.anything(),
        }),
      )
    })

    it('does not record breadcrumbs when enableNavigationBreadcrumbs=false', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'bug-1', status: 'OPEN' },
      })

      const mite = new Mite({
        apiKey: 'test',
        enableNavigationBreadcrumbs: false,
      })
      recordNavigationBreadcrumb('Home')

      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
      })

      const lastCall = mockAxios.post.mock.calls.at(-1)?.[1]
      expect(lastCall).toEqual(
        expect.not.objectContaining({
          navigation_trail: expect.anything(),
        }),
      )
    })

    it('caps the navigation trail with maxNavigationBreadcrumbs', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'bug-1', status: 'OPEN' },
      })

      const mite = new Mite({
        apiKey: 'test',
        maxNavigationBreadcrumbs: 2,
      })
      recordNavigationBreadcrumb('Home')
      recordNavigationBreadcrumb('Settings')
      recordNavigationBreadcrumb('Profile')

      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
      })

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/bug-reports',
        expect.objectContaining({
          navigation_trail: [
            expect.objectContaining({ screen: 'Settings' }),
            expect.objectContaining({ screen: 'Profile' }),
          ],
        }),
        undefined,
      )
    })

    it('strips triage fields from the bug report payload', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'bug-1', status: 'NEEDS_TRIAGE' },
      })

      const mite = new Mite({ apiKey: 'test' })
      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
        priority: 'CRITICAL',
        status: 'RESOLVED',
        assigned_to: 'user_1',
        assignee: 'user_1',
      } as never)

      const lastCall = mockAxios.post.mock.calls.at(-1)?.[1]
      expect(lastCall).toEqual(
        expect.not.objectContaining({ priority: expect.anything() }),
      )
      expect(lastCall).toEqual(expect.not.objectContaining({ status: expect.anything() }))
      expect(lastCall).toEqual(
        expect.not.objectContaining({ assigned_to: expect.anything() }),
      )
      expect(lastCall).toEqual(
        expect.not.objectContaining({ assignee: expect.anything() }),
      )
    })

    it('normalizes custom device_info values to flat string values for bug reports', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'bug-1', status: 'OPEN' },
      })

      const mite = new Mite({ apiKey: 'test' })
      await mite.submitBug({
        title: 'Test Bug',
        description: 'A test bug report',
        device_info: {
          build: 42,
          isTablet: false,
          supported: ['arm64', 'x64'],
          nested: { model: 'test' },
          empty: undefined,
        },
      })

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/api/v1/bug-reports',
        expect.objectContaining({
          title: 'Test Bug',
          description: 'A test bug report',
          device_info: {
            build: '42',
            isTablet: 'false',
            supported: '["arm64","x64"]',
            nested: '{"model":"test"}',
          },
        }),
        undefined,
      )
    })
  })

  describe('submitBug plan quota refusals', () => {
    // The billing period must still be open, or the gate opens again at once.
    const RESETS_AT = Date.now() + 60_000

    const REPORT_REFUSAL = {
      isAxiosError: true,
      response: {
        status: 402,
        data: {
          error: 'This account has used all 50 reports in its current billing period.',
          code: 'REPORT_QUOTA_EXCEEDED',
          quota: { limit: 50, used: 50, resets_at: RESETS_AT },
        },
      },
    }

    const STORAGE_REFUSAL = {
      isAxiosError: true,
      response: {
        status: 402,
        data: {
          error: 'This account has used all of its attachment storage.',
          code: 'STORAGE_QUOTA_EXCEEDED',
          quota: { limit: 104857600, used: 104857600 },
        },
      },
    }

    it('does not throw when the report endpoint refuses, and sends one request', async () => {
      mockAxios.post.mockRejectedValueOnce(REPORT_REFUSAL)

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.submitBug({ title: 'a', description: 'b' })

      expect(result).toEqual({
        ok: false,
        refusal: {
          code: 'REPORT_QUOTA_EXCEEDED',
          message: 'This account has used all 50 reports in its current billing period.',
          quota: { limit: 50, used: 50, resetsAt: RESETS_AT },
        },
      })
      expect(mockAxios.post).toHaveBeenCalledTimes(1)
    })

    it('sends the report without the attachment when storage is full', async () => {
      mockAxios.post
        .mockRejectedValueOnce(STORAGE_REFUSAL)
        .mockResolvedValueOnce({ data: { id: 'bug-1', status: 'OPEN' } })

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.submitBug({
        title: 'a',
        description: 'b',
        attachments: [{ uri: 'file://shot.jpg', type: 'image/jpeg' }],
      })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('expected a report')
      expect(result.report).toEqual({ id: 'bug-1', status: 'OPEN' })
      expect(result.droppedAttachments).toEqual({
        count: 1,
        refusal: expect.objectContaining({ code: 'STORAGE_QUOTA_EXCEEDED' }),
      })

      expect(mockAxios.post).toHaveBeenNthCalledWith(
        1,
        '/api/v1/upload-url',
        undefined,
        undefined,
      )
      expect(mockAxios.post).toHaveBeenNthCalledWith(
        2,
        '/api/v1/bug-reports',
        expect.objectContaining({ attachments: undefined }),
        undefined,
      )
    })

    it('sends no report when the upload URL refuses with the report code', async () => {
      mockAxios.post.mockRejectedValueOnce(REPORT_REFUSAL)

      const mite = new Mite({ apiKey: 'test' })
      const result = await mite.submitBug({
        title: 'a',
        description: 'b',
        attachments: [{ uri: 'file://shot.jpg' }],
      })

      expect(result).toEqual({
        ok: false,
        refusal: expect.objectContaining({ code: 'REPORT_QUOTA_EXCEEDED' }),
      })
      expect(mockAxios.post).toHaveBeenCalledTimes(1)
      expect(mockAxios.post).not.toHaveBeenCalledWith(
        '/api/v1/bug-reports',
        expect.anything(),
        expect.anything(),
      )
    })

    it('sends no request for a later report while the gate is closed', async () => {
      mockAxios.post.mockRejectedValueOnce(REPORT_REFUSAL)

      const mite = new Mite({ apiKey: 'test' })
      await mite.submitBug({ title: 'a', description: 'b' })
      mockAxios.post.mockClear()

      const second = await mite.submitBug({ title: 'c', description: 'd' })

      expect(second).toEqual({
        ok: false,
        refusal: expect.objectContaining({ code: 'REPORT_QUOTA_EXCEEDED' }),
      })
      expect(mockAxios.post).not.toHaveBeenCalled()
    })

    it('opens the gate again once the billing period has turned over', async () => {
      mockAxios.post
        .mockRejectedValueOnce({
          ...REPORT_REFUSAL,
          response: {
            ...REPORT_REFUSAL.response,
            data: {
              ...REPORT_REFUSAL.response.data,
              quota: { limit: 50, used: 50, resets_at: Date.now() - 1 },
            },
          },
        })
        .mockResolvedValueOnce({ data: { id: 'bug-2', status: 'OPEN' } })

      const mite = new Mite({ apiKey: 'test' })
      await mite.submitBug({ title: 'a', description: 'b' })
      const second = await mite.submitBug({ title: 'c', description: 'd' })

      expect(second).toEqual({ ok: true, report: { id: 'bug-2', status: 'OPEN' } })
    })

    it('does not queue a refused report for a retry', async () => {
      mockAxios.post.mockRejectedValueOnce(REPORT_REFUSAL)

      const mite = new Mite({ apiKey: 'test' })
      mite.init()
      await mite.submitBug({ title: 'a', description: 'b' })

      expect(mite.pendingRequestCount).toBe(0)
      mite.destroy()
    })

    it('calls onQuotaExceeded once for each refusal', async () => {
      mockAxios.post
        .mockRejectedValueOnce(STORAGE_REFUSAL)
        .mockResolvedValueOnce({ data: { id: 'bug-1', status: 'OPEN' } })
        .mockRejectedValueOnce(REPORT_REFUSAL)

      const onQuotaExceeded = jest.fn()
      const mite = new Mite({ apiKey: 'test', onQuotaExceeded })

      await mite.submitBug({
        title: 'a',
        description: 'b',
        attachments: [{ uri: 'file://shot.jpg' }],
      })
      expect(onQuotaExceeded).toHaveBeenCalledTimes(1)
      expect(onQuotaExceeded).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 'STORAGE_QUOTA_EXCEEDED' }),
      )

      await mite.submitBug({ title: 'c', description: 'd' })
      expect(onQuotaExceeded).toHaveBeenCalledTimes(2)
      expect(onQuotaExceeded).toHaveBeenLastCalledWith(
        expect.objectContaining({ code: 'REPORT_QUOTA_EXCEEDED' }),
      )
    })

    it('keeps sending when the refusal carries no reset time', async () => {
      const noResetRefusal = {
        isAxiosError: true,
        response: {
          status: 402,
          data: {
            error: 'This account has used all of its reports.',
            code: 'REPORT_QUOTA_EXCEEDED',
            quota: { limit: 50, used: 50 },
          },
        },
      }
      mockAxios.post
        .mockRejectedValueOnce(noResetRefusal)
        .mockResolvedValueOnce({ data: { id: 'bug-3', status: 'OPEN' } })

      const mite = new Mite({ apiKey: 'test' })
      await mite.submitBug({ title: 'a', description: 'b' })
      const second = await mite.submitBug({ title: 'c', description: 'd' })

      // Without a reset time the SDK cannot know when to open the gate again,
      // so it must not close it. One wasted request beats a lost report.
      expect(second).toEqual({ ok: true, report: { id: 'bug-3', status: 'OPEN' } })
    })

    it('keeps working when the onQuotaExceeded handler throws', async () => {
      mockAxios.post.mockRejectedValueOnce(REPORT_REFUSAL)

      const mite = new Mite({
        apiKey: 'test',
        onQuotaExceeded: () => {
          throw new Error('handler is broken')
        },
      })

      const result = await mite.submitBug({ title: 'a', description: 'b' })

      expect(result.ok).toBe(false)
    })
  })

  describe('triage context', () => {
    it('merges the collected triage context into the environment', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'bug-1', status: 'OPEN' } })

      const mite = new Mite({ apiKey: 'test' })
      recordNavigationBreadcrumb('Checkout')
      mite.recordError(new Error('card declined'))

      await mite.submitBug({ title: 'a', description: 'b' })

      const body = mockAxios.post.mock.calls.at(-1)?.[1]
      expect(body.environment).toEqual(
        expect.objectContaining({
          current_route: 'Checkout',
          last_error_message: 'card declined',
        }),
      )
      expect(body.environment.last_error_stack).toContain('card declined')
    })

    it('lets an app supplied environment key win over the collected one', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'bug-1', status: 'OPEN' } })

      const mite = new Mite({ apiKey: 'test' })
      recordNavigationBreadcrumb('Checkout')

      await mite.submitBug({
        title: 'a',
        description: 'b',
        environment: { current_route: 'CheckoutOverride' },
      })

      const body = mockAxios.post.mock.calls.at(-1)?.[1]
      expect(body.environment.current_route).toBe('CheckoutOverride')
    })

    it('omits environment entirely when nothing is known', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'bug-1', status: 'OPEN' } })

      const mite = new Mite({ apiKey: 'test' })
      await mite.submitBug({ title: 'a', description: 'b' })

      const body = mockAxios.post.mock.calls.at(-1)?.[1]
      expect(body).toEqual(
        expect.not.objectContaining({ environment: expect.anything() }),
      )
    })

    it('does not install a global error handler when capture is disabled', () => {
      const setGlobalHandler = jest.fn()
      const globals = globalThis as Record<string, unknown>
      globals.ErrorUtils = { setGlobalHandler, getGlobalHandler: () => undefined }

      try {
        new Mite({ apiKey: 'test', captureUncaughtErrors: false })
        expect(setGlobalHandler).not.toHaveBeenCalled()
      } finally {
        globals.ErrorUtils = undefined
      }
    })

    it('reports an uncaught error and still runs the previous handler', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'bug-1', status: 'OPEN' } })
      const previousHandler = jest.fn()
      let installed: ((error: unknown, isFatal?: boolean) => void) | undefined
      const globals = globalThis as Record<string, unknown>
      globals.ErrorUtils = {
        getGlobalHandler: () => previousHandler,
        setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => {
          installed = handler
        },
      }

      try {
        const mite = new Mite({ apiKey: 'test' })
        const uncaught = new Error('uncaught boom')
        installed?.(uncaught, true)

        expect(previousHandler).toHaveBeenCalledWith(uncaught, true)

        await mite.submitBug({ title: 'a', description: 'b' })

        const body = mockAxios.post.mock.calls.at(-1)?.[1]
        expect(body.environment.last_error_message).toBe('uncaught boom')
      } finally {
        globals.ErrorUtils = undefined
      }
    })
  })
})
