import { navigationTracker, recordNavigationBreadcrumb } from '../NavigationTracker'
import { triageContext } from '../TriageContext'
import { emitNetInfoState, netInfoListenerCount } from './__mocks__/netinfo'

describe('TriageContext', () => {
  beforeEach(() => {
    triageContext.stop()
    triageContext.clear()
    navigationTracker.configure({ enabled: true })
    navigationTracker.clear()
  })

  it('produces an empty snapshot when nothing is known', () => {
    expect(triageContext.snapshot()).toEqual({})
  })

  it('reports the latest recorded screen as the current route', () => {
    recordNavigationBreadcrumb('Home')
    recordNavigationBreadcrumb('Settings')

    expect(triageContext.currentRoute).toBe('Settings')
    expect(triageContext.snapshot().current_route).toBe('Settings')

    recordNavigationBreadcrumb('Profile')

    expect(triageContext.snapshot().current_route).toBe('Profile')
  })

  it('keeps the message and stack of a recorded Error', () => {
    const error = new Error('boom')
    error.stack = 'Error: boom\n    at somewhere'

    triageContext.recordError(error)

    expect(triageContext.snapshot()).toEqual({
      last_error_message: 'boom',
      last_error_stack: 'Error: boom\n    at somewhere',
    })
  })

  it('truncates an oversized stack to its first 2000 characters', () => {
    const error = new Error('boom')
    error.stack = `HEAD${'x'.repeat(5000)}`

    triageContext.recordError(error)
    const stack = triageContext.snapshot().last_error_stack ?? ''

    expect(stack).toHaveLength(2000)
    expect(stack.startsWith(`HEAD${'x'.repeat(1996)}`)).toBe(true)
  })

  it('stringifies non-Error values without a stack', () => {
    triageContext.recordError('plain failure')

    expect(triageContext.snapshot()).toEqual({
      last_error_message: 'plain failure',
    })

    triageContext.recordError({ code: 42 })

    expect(triageContext.snapshot()).toEqual({
      last_error_message: '[object Object]',
    })
  })

  it('ignores a value that stringifies to nothing meaningful', () => {
    triageContext.recordError('   ')

    expect(triageContext.snapshot()).toEqual({})
  })

  it('truncates an oversized error message', () => {
    triageContext.recordError(`HEAD${'x'.repeat(5000)}`)
    const message = triageContext.snapshot().last_error_message ?? ''

    expect(message).toHaveLength(2000)
    expect(message.startsWith(`HEAD${'x'.repeat(1996)}`)).toBe(true)
  })

  it('records the network type, and marks an unreachable network offline', () => {
    triageContext.start({ captureUncaughtErrors: false })

    emitNetInfoState({ type: 'wifi', isConnected: true, isInternetReachable: true })
    expect(triageContext.networkState).toBe('wifi')

    emitNetInfoState({ type: 'wifi', isConnected: true, isInternetReachable: false })
    expect(triageContext.snapshot().network_state).toBe('wifi/offline')

    emitNetInfoState({ isConnected: false })
    expect(triageContext.snapshot()).toEqual({})
  })

  it('stops listening for network changes after stop', () => {
    triageContext.start({ captureUncaughtErrors: false })
    triageContext.stop()

    emitNetInfoState({ type: 'cellular' })

    expect(netInfoListenerCount()).toBe(0)
    expect(triageContext.networkState).toBeNull()
  })

  it('subscribes to network changes only once across repeated starts', () => {
    triageContext.start({ captureUncaughtErrors: false })
    triageContext.start({ captureUncaughtErrors: false })

    expect(netInfoListenerCount()).toBe(1)
  })

  it('restores the handler that was installed before start', () => {
    const previousHandler = jest.fn()
    let current: unknown = previousHandler
    const globals = globalThis as Record<string, unknown>
    globals.ErrorUtils = {
      getGlobalHandler: () => current,
      setGlobalHandler: (handler: unknown) => {
        current = handler
      },
    }

    try {
      triageContext.start({ captureUncaughtErrors: true })
      expect(current).not.toBe(previousHandler)

      triageContext.stop()
      expect(current).toBe(previousHandler)
    } finally {
      globals.ErrorUtils = undefined
    }
  })

  it('forgets the last error on clear', () => {
    triageContext.recordError(new Error('boom'))
    triageContext.clear()

    expect(triageContext.lastError).toBeNull()
  })
})
