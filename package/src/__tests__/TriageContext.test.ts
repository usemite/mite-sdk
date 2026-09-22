import { navigationTracker, recordNavigationBreadcrumb } from '../NavigationTracker'
import { triageContext } from '../TriageContext'

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

  it('forgets the last error on clear', () => {
    triageContext.recordError(new Error('boom'))
    triageContext.clear()

    expect(triageContext.lastError).toBeNull()
  })
})
