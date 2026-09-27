import { ApiClient } from '../utils/client'

jest.mock('axios', () => {
  const interceptors = {
    response: { use: jest.fn() },
    request: { use: jest.fn() },
  }
  const mockInstance = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors,
    defaults: { headers: { common: {} } },
  }
  return {
    create: jest.fn(() => mockInstance),
    __mockInstance: mockInstance,
  }
})

// eslint-disable-next-line @typescript-eslint/no-require-imports
const axios = require('axios')
const mockAxios = axios.__mockInstance

describe('ApiClient', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('creates axios instance with defaults', () => {
    new ApiClient({})

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://usemite.com',
        timeout: 10000,
      }),
    )
  })

  it('creates axios instance with custom config', () => {
    new ApiClient({
      baseUrl: 'https://custom.api',
      timeout: 5000,
      headers: { 'X-Custom': 'value' },
    })

    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://custom.api',
        timeout: 5000,
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )

    expect(mockAxios.defaults.headers.common).toEqual(
      expect.objectContaining({
        'X-Custom': 'value',
      }),
    )
  })

  it('sets up retry interceptor when maxRetries > 0', () => {
    new ApiClient({ maxRetries: 3 })

    // Retry interceptor + error logging interceptor = 2 calls
    expect(mockAxios.interceptors.response.use).toHaveBeenCalledTimes(2)
  })

  it('does not set up retry interceptor when maxRetries is 0', () => {
    new ApiClient({ maxRetries: 0 })

    // Only error logging interceptor
    expect(mockAxios.interceptors.response.use).toHaveBeenCalledTimes(1)
  })

  describe('retry interceptor', () => {
    // The retry handler is registered before the error logging handler.
    function getRetryHandler() {
      return mockAxios.interceptors.response.use.mock.calls[0][1]
    }

    it('does not retry a 402 plan quota refusal', async () => {
      new ApiClient({ maxRetries: 3 })
      const config: Record<string, unknown> = { url: '/api/v1/bug-reports' }
      const error = {
        config,
        response: {
          status: 402,
          data: { code: 'REPORT_QUOTA_EXCEEDED', quota: { limit: 50, used: 50 } },
        },
      }

      await expect(getRetryHandler()(error)).rejects.toBe(error)
      expect(config.__mite_retry_count).toBeUndefined()
    })

    it('does not retry any other 4xx response', async () => {
      new ApiClient({ maxRetries: 3 })
      const config: Record<string, unknown> = { url: '/api/v1/bug-reports' }
      const error = { config, response: { status: 401, data: {} } }

      await expect(getRetryHandler()(error)).rejects.toBe(error)
      expect(config.__mite_retry_count).toBeUndefined()
    })
  })

  describe('HTTP methods', () => {
    it('get returns response data', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { ok: true } })
      const client = new ApiClient({})

      const result = await client.get('/test')
      expect(result).toEqual({ ok: true })
    })

    it('post returns response data', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: '1' } })
      const client = new ApiClient({})

      const result = await client.post('/test', { name: 'test' })
      expect(result).toEqual({ id: '1' })
    })

    it('put returns response data', async () => {
      mockAxios.put.mockResolvedValueOnce({ data: { updated: true } })
      const client = new ApiClient({})

      const result = await client.put('/test', { name: 'updated' })
      expect(result).toEqual({ updated: true })
    })

    it('delete returns response data', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: { deleted: true } })
      const client = new ApiClient({})

      const result = await client.delete('/test')
      expect(result).toEqual({ deleted: true })
    })
  })

  it('updateHeaders adds headers to defaults', () => {
    const client = new ApiClient({})
    client.updateHeaders({ Authorization: 'Bearer token' })

    expect(mockAxios.defaults.headers.common).toEqual(
      expect.objectContaining({ Authorization: 'Bearer token' }),
    )
  })

  it('exposes axios instance via getAxiosInstance', () => {
    const client = new ApiClient({})
    expect(client.getAxiosInstance()).toBe(mockAxios)
  })
})
