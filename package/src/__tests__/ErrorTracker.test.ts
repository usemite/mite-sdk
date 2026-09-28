import { ErrorTracker, type SendOutcome } from '../ErrorTracker'
import type { MiteErrorEvent, MiteIdentityStorage } from '../types'

const STORAGE_KEY = '@mite/sdk-pending-errors'

function createStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const storage: MiteIdentityStorage = {
    getItem: async key => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value)
    },
    removeItem: async key => {
      store.delete(key)
    },
  }
  return { storage, store }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

function setup(outcomes: SendOutcome[] = [], initial: Record<string, string> = {}) {
  let clock = 1_000_000
  const sent: MiteErrorEvent[][] = []
  const send = jest.fn(async (events: MiteErrorEvent[]) => {
    sent.push(events)
    return outcomes.shift() ?? 'sent'
  })
  const { storage, store } = createStorage(initial)
  const tracker = new ErrorTracker({
    send,
    storage,
    contextFor: () => ({ app_version: '1.0.0', environment: { current_route: 'Cart' } }),
    now: () => clock,
  })
  return {
    tracker,
    send,
    sent,
    store,
    tick: (ms: number) => {
      clock += ms
    },
  }
}

describe('ErrorTracker', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('batches errors and sends them after a short delay', async () => {
    const { tracker, send, sent } = setup()
    tracker.capture(new TypeError('a is undefined'))
    tracker.capture(new RangeError('bad length'))
    expect(send).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(5_000)

    expect(send).toHaveBeenCalledTimes(1)
    expect(sent[0]).toEqual([
      expect.objectContaining({
        name: 'TypeError',
        message: 'a is undefined',
        is_fatal: false,
        handled: false,
        occurred_at: 1_000_000,
        app_version: '1.0.0',
        environment: { current_route: 'Cart' },
      }),
      expect.objectContaining({ name: 'RangeError' }),
    ])
    expect(tracker.pendingCount).toBe(0)
  })

  it('sends a fatal error at once', async () => {
    const { tracker, send } = setup()
    tracker.capture(new Error('crash'), { fatal: true })
    await settle()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]?.[0][0]).toMatchObject({ is_fatal: true })
  })

  it('counts an error repeated inside two seconds once', () => {
    const { tracker, tick } = setup()
    const error = new Error('loop')
    expect(tracker.capture(error)).toBe(true)
    expect(tracker.capture(error)).toBe(false)
    tick(2_500)
    expect(tracker.capture(error)).toBe(true)
    expect(tracker.pendingCount).toBe(2)
  })

  it('stops at 30 errors a minute', () => {
    const { tracker } = setup()
    for (let i = 0; i < 40; i += 1) tracker.capture(new Error(`e${i}`))
    expect(tracker.pendingCount).toBe(30)
  })

  it('describes values that are not Errors', () => {
    const { tracker } = setup()
    tracker.capture('plain failure')
    tracker.capture({ code: 42 })
    tracker.capture({ name: 'AxiosError', message: 'Network Error' })
    expect(tracker.pendingCount).toBe(3)
  })

  it('applies ignoreErrors and beforeSend', async () => {
    const send = jest.fn(async () => 'sent' as const)
    const tracker = new ErrorTracker({
      send,
      storage: createStorage().storage,
      contextFor: () => ({}),
      ignoreErrors: ['Network request failed', /^Aborted/],
      beforeSend: event =>
        event.message.includes('secret') ? null : { ...event, message: 'scrubbed' },
    })
    expect(tracker.capture(new Error('Network request failed'))).toBe(false)
    expect(tracker.capture(new Error('Aborted by user'))).toBe(false)
    expect(tracker.capture(new Error('token secret leaked'))).toBe(false)
    expect(tracker.capture(new Error('real'))).toBe(true)
    await tracker.flush()
    expect(send).toHaveBeenCalledWith([expect.objectContaining({ message: 'scrubbed' })])
  })

  it('merges capture context over the environment', async () => {
    const { tracker, sent } = setup()
    tracker.capture(new Error('x'), {
      handled: true,
      context: { component_stack: 'in Cart' },
    })
    await tracker.flush()
    expect(sent[0]?.[0]).toMatchObject({
      handled: true,
      environment: { current_route: 'Cart', component_stack: 'in Cart' },
    })
  })

  it('keeps a batch after a network failure and retries it later', async () => {
    const { tracker, send, store, tick } = setup(['retry'])
    tracker.capture(new Error('offline'))
    await tracker.flush()
    expect(tracker.pendingCount).toBe(1)
    expect(JSON.parse(store.get(STORAGE_KEY) ?? '[]')).toHaveLength(1)

    tick(5_000)
    await jest.advanceTimersByTimeAsync(5_000)

    expect(send).toHaveBeenCalledTimes(2)
    expect(tracker.pendingCount).toBe(0)
    expect(store.has(STORAGE_KEY)).toBe(false)
  })

  it('drops a batch the server rejects', async () => {
    const { tracker } = setup(['drop'])
    tracker.capture(new Error('bad'))
    await tracker.flush()
    expect(tracker.pendingCount).toBe(0)
  })

  it('sends the errors a previous launch left behind', async () => {
    const left = [
      { name: 'Error', message: 'died', is_fatal: true, handled: false, occurred_at: 1 },
    ]
    const { tracker, sent, store } = setup([], { [STORAGE_KEY]: JSON.stringify(left) })

    await tracker.restore()

    expect(sent[0]).toEqual(left)
    expect(store.has(STORAGE_KEY)).toBe(false)
  })

  it('does not overwrite the stored errors before reading them', async () => {
    const left = [
      { name: 'Error', message: 'died', is_fatal: true, handled: false, occurred_at: 1 },
    ]
    const { tracker, sent, tick } = setup(['retry'], {
      [STORAGE_KEY]: JSON.stringify(left),
    })
    tracker.capture(new Error('early'))
    await tracker.restore()
    tick(5_000)
    await jest.advanceTimersByTimeAsync(5_000)
    expect(sent.at(-1)?.map(event => event.message)).toEqual(['died', 'early'])
  })

  it('truncates oversized fields to the server limits', async () => {
    const { tracker, sent } = setup()
    const error = new Error('m'.repeat(3000))
    error.stack = 's'.repeat(20_000)
    tracker.capture(error)
    await tracker.flush()
    expect(sent[0]?.[0]?.message).toHaveLength(2000)
    expect(sent[0]?.[0]?.stack).toHaveLength(16_000)
  })
})
