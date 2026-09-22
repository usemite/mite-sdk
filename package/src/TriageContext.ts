import { navigationTracker } from './NavigationTracker'
import { type NetInfoStateLike, loadNetInfo } from './utils/optionalModules'

const MAX_ENVIRONMENT_VALUE_LENGTH = 2000

interface TriageContextStartOptions {
  captureUncaughtErrors: boolean
}

interface RecordedError {
  message: string
  stack: string | null
}

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void

interface GlobalErrorUtils {
  getGlobalHandler?: () => GlobalErrorHandler | undefined
  setGlobalHandler?: (handler: GlobalErrorHandler) => void
}

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
  private previousErrorHandler: GlobalErrorHandler | undefined
  private installedErrorHandler: GlobalErrorHandler | null = null
  private unsubscribeNetInfo: (() => void) | null = null

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

  recordError(value: unknown): void {
    const isError = value instanceof Error
    const message = isError ? value.message : String(value)

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
      this.recordError(error)
      previous?.(error, isFatal)
    }

    this.previousErrorHandler = previous
    this.installedErrorHandler = handler
    errorUtils.setGlobalHandler?.(handler)
  }

  private removeErrorHandler(): void {
    if (!this.installedErrorHandler) {
      return
    }

    const errorUtils = getErrorUtils()
    const previous = this.previousErrorHandler
    this.installedErrorHandler = null
    this.previousErrorHandler = undefined

    if (errorUtils && previous) {
      errorUtils.setGlobalHandler?.(previous)
    }
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
 * Manually record an error so the latest one is attached to bug reports.
 * Useful inside a catch block or an error boundary.
 */
export function recordError(error: unknown): void {
  triageContext.recordError(error)
}
