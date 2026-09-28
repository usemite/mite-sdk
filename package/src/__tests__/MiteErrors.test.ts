import { Mite } from '../Mite'
import { navigationTracker, recordNavigationBreadcrumb } from '../NavigationTracker'
import { recordError, triageContext } from '../TriageContext'

jest.mock('axios', () => {
  const instance = {
    get: jest.fn(),
    post: jest.fn(),
    interceptors: { response: { use: jest.fn() }, request: { use: jest.fn() } },
    defaults: { headers: { common: {} } },
  }
  return { create: jest.fn(() => instance), __mockInstance: instance }
})

jest.mock('../utils/buildInfo', () => ({
  getBuildInfo: () => ({ app_version: '2.4.0', eas_update_id: 'upd-1' }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockAxios = require('axios').__mockInstance

type Handler = (error: unknown, isFatal?: boolean) => void

const globals = globalThis as { ErrorUtils?: unknown }

function installErrorUtils() {
  const previous = jest.fn()
  let current: Handler = previous
  globals.ErrorUtils = {
    getGlobalHandler: () => current,
    setGlobalHandler: (handler: Handler) => {
      current = handler
    },
  }
  return {
    previous,
    throwUncaught: (error: unknown, fatal = false) => current(error, fatal),
  }
}

const errorPosts = () =>
  mockAxios.post.mock.calls.filter((call: unknown[]) => call[0] === '/api/v1/errors')

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

describe('Mite error tracking', () => {
  let mite: Mite | null = null

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'warn').mockImplementation()
    triageContext.stop()
    triageContext.clear()
    navigationTracker.configure({ enabled: true })
    navigationTracker.clear()
    mockAxios.post.mockResolvedValue({ data: { id: 'x', created: true } })
  })

  afterEach(() => {
    mite?.destroy()
    mite = null
    globals.ErrorUtils = undefined
  })

  it('sends an uncaught fatal error with the build, route and identity, then lets the app crash', async () => {
    const { previous, throwUncaught } = installErrorUtils()
    mite = new Mite({ apiKey: 'test' })
    mite.init()
    await mite.identify({ user_identifier: 'ada' })
    recordNavigationBreadcrumb('Home')
    recordNavigationBreadcrumb('Cart')

    const error = new TypeError('total is undefined')
    throwUncaught(error, true)
    await settle()

    expect(previous).toHaveBeenCalledWith(error, true)
    const [call] = errorPosts()
    expect(call?.[1].events).toEqual([
      expect.objectContaining({
        name: 'TypeError',
        message: 'total is undefined',
        is_fatal: true,
        handled: false,
        app_version: '2.4.0',
        eas_update_id: 'upd-1',
        user_identifier: 'ada',
        anonymous_id: mite.anonymousId,
        environment: { current_route: 'Cart' },
        navigation_trail: [
          expect.objectContaining({ screen: 'Home' }),
          expect.objectContaining({ screen: 'Cart' }),
        ],
        device_info: expect.any(Object),
      }),
    ])
  })

  it('sends errors the app records itself as handled', async () => {
    mite = new Mite({ apiKey: 'test' })
    mite.init()
    recordError(new Error('checkout failed'))
    await mite.flushErrors()

    const [call] = errorPosts()
    expect(call?.[1].events[0]).toMatchObject({
      message: 'checkout failed',
      handled: true,
    })
    expect(triageContext.lastError?.message).toBe('checkout failed')
  })

  it('leaves out the user and device when identification is off', async () => {
    mite = new Mite({ apiKey: 'test', identificationOptOut: true })
    mite.init()
    mite.captureError(new Error('private'))
    await mite.flushErrors()

    const event = errorPosts()[0]?.[1].events[0]
    expect(event.anonymous_id).toBe(mite.anonymousId)
    expect(event).not.toHaveProperty('user_identifier')
    expect(event).not.toHaveProperty('device_info')
  })

  it('sends nothing when error tracking is off, but still keeps the last error', async () => {
    mite = new Mite({ apiKey: 'test', enableErrorTracking: false })
    mite.init()
    mite.recordError(new Error('kept locally'))
    await mite.flushErrors()
    await settle()

    expect(errorPosts()).toHaveLength(0)
    expect(triageContext.lastError?.message).toBe('kept locally')
  })

  it('drops a batch the server refuses as invalid', async () => {
    mite = new Mite({ apiKey: 'test' })
    mite.init()
    mockAxios.post.mockImplementation(async (url: string) => {
      if (url === '/api/v1/errors') throw { response: { status: 400 } }
      return { data: {} }
    })
    mite.captureError(new Error('bad'))
    await mite.flushErrors()
    await mite.flushErrors()

    expect(errorPosts()).toHaveLength(1)
  })
})
