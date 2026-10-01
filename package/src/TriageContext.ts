import type { CaptureOptions } from './ErrorTracker'
import { navigationTracker } from './NavigationTracker'
import { type NetInfoStateLike, loadNetInfo } from './utils/optionalModules'

const MAX_ENVIRONMENT_VALUE_LENGTH = 2000

interface TriageContextStartOptions {
  captureUncaughtErrors: boolean
  /**
   * Receives every error the context sees: uncaught ones before the previous
   * handler runs, and the ones the app records itself.
   */
  errorSink?: ErrorSink
}

interface RecordedError {
  message: string
  stack: string | null
}

type ErrorSink = (error: unknown, options: CaptureOptions) => void

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void

interface GlobalErrorUtils {
  getGlobalHandler?: () => GlobalErrorHandler | undefined
  setGlobalHandler?: (handler: GlobalErrorHandler) => void
}

const noopErrorHandler: GlobalErrorHandler = () => {}

function getErrorUtils(): GlobalErrorUtils | null {
  const candidate = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils
  if (
    !candidate ||
    typeof candidate.setGlobalHandler !== 'function' ||
    typeof candidate.getGlobalHandler !== 'function'
  ) {
    return null
  }
  return candidate
}

function describeValue(value: unknown): string {
  try {
    return String(value)
  } catch {
    return ''
  }
}

function truncate(value: string): string {
  return value.length > MAX_ENVIRONMENT_VALUE_LENGTH
    ? value.slice(0, MAX_ENVIRONMENT_VALUE_LENGTH)
    : value
}

function formatNetworkState(state: NetInfoStateLike): string | null {
  if (typeof state.type !== 'string' || !state.type.trim()) {
    return null
  }

  const offline = state.isInternetReachable === false || state.isConnected === false
  return offline ? `${state.type}/offline` : state.type
}

export class TriageContext {
  private error: RecordedError | null = null
  private network: string | null = null
  private started = false
  private previousErrorHandler: GlobalErrorHandler | null = null
  private installedErrorHandler: GlobalErrorHandler | null = null
  private unsubscribeNetInfo: (() => void) | null = null
  private errorSink: ErrorSink | undefined = undefined

  get currentRoute(): string | null {
    const trail = navigationTracker.getTrail()
    return trail[trail.length - 1]?.screen ?? null
  }

  get lastError(): RecordedError | null {
    return this.error ? { ...this.error } : null
  }

  get networkState(): string | null {
    return this.network
  }

  /**
   * Keep the error for bug reports and pass it on to error tracking. An error
   * the app records itself is handled unless the options say otherwise.
   */
  recordError(value: unknown, options: CaptureOptions = {}): void {
    this.remember(value)
    this.sink(value, { handled: true, ...options })
  }

  private sink(value: unknown, options: CaptureOptions): void {
    try {
      this.errorSink?.(value, options)
    } catch {
      // Never let reporting break the caller's own error path.
    }
  }

  private remember(value: unknown): void {
    const isError = value instanceof Error
    const message = isError ? value.message : describeValue(value)

    if (!message.trim()) {
      return
    }

    this.error = {
      message,
      stack: isError ? (value.stack ?? null) : null,
    }
  }

  snapshot(): Record<string, string> {
    const snapshot: Record<string, string> = {}
    const route = this.currentRoute

    if (route) {
      snapshot.current_route = truncate(route)
    }
    if (this.error) {
      snapshot.last_error_message = truncate(this.error.message)
      if (this.error.stack) {
        snapshot.last_error_stack = truncate(this.error.stack)
      }
    }
    if (this.network) {
      snapshot.network_state = truncate(this.network)
    }

    return snapshot
  }

  start(options: TriageContextStartOptions): void {
    if (this.started) {
      return
    }
    this.started = true
    this.errorSink = options.errorSink

    if (options.captureUncaughtErrors) {
      this.installErrorHandler()
    }
    this.subscribeToNetworkState()
  }

  stop(): void {
    if (!this.started) {
      return
    }
    this.started = false
    this.errorSink = undefined

    this.removeErrorHandler()
    this.unsubscribeNetInfo?.()
    this.unsubscribeNetInfo = null
  }

  clear(): void {
    this.error = null
    this.network = null
  }

  private installErrorHandler(): void {
    const errorUtils = getErrorUtils()
    if (!errorUtils) {
      return
    }

    const previous = errorUtils.getGlobalHandler?.()
    const handler: GlobalErrorHandler = (error, isFatal) => {
      this.remember(error)
      this.sink(error, { fatal: isFatal === true, handled: false })
      previous?.(error, isFatal)
    }

    this.previousErrorHandler = previous ?? null
    this.installedErrorHandler = handler
    errorUtils.setGlobalHandler?.(handler)
  }

  private removeErrorHandler(): void {
    if (!this.installedErrorHandler) {
      return
    }

    const errorUtils = getErrorUtils()
    const previous = this.previousErrorHandler
    const installed = this.installedErrorHandler
    this.installedErrorHandler = null
    this.previousErrorHandler = null

    if (!errorUtils || errorUtils.getGlobalHandler?.() !== installed) {
      return
    }

    errorUtils.setGlobalHandler?.(previous ?? noopErrorHandler)
  }

  private subscribeToNetworkState(): void {
    const netInfo = loadNetInfo()
    if (!netInfo) {
      return
    }

    this.unsubscribeNetInfo = netInfo.addEventListener(state => {
      this.network = formatNetworkState(state)
    })
  }
}

export const triageContext = new TriageContext()

/**
 * Record an error the app caught: it is sent to Mite for tracking and the
 * latest one is attached to bug reports. Useful inside a catch block.
 *
 * @deprecated Use `captureError(error)`, or `mite.errors.capture(error)`. Removed in 2.0.
 */
export function recordError(error: unknown, options?: CaptureOptions): void {
  triageContext.recordError(error, options)
}

/**
 * Send an error your code caught to Mite, without a `Mite` instance at hand.
 * Never throws. Uncaught errors and unhandled rejections are sent for you.
 */
export function captureError(error: unknown, options?: CaptureOptions): void {
  triageContext.recordError(error, options)
}
