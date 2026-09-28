import type { MiteErrorEvent, MiteIdentityStorage } from './types'

const PENDING_STORAGE_KEY = '@mite/sdk-pending-errors'
const FLUSH_DELAY_MS = 5_000
const FLUSH_BATCH_SIZE = 20
const MAX_PENDING = 50
/** Identical errors inside this window count once, so a render loop stays one event. */
const DUPLICATE_WINDOW_MS = 2_000
/** A session never sends more than this many errors per minute. */
const MAX_EVENTS_PER_MINUTE = 30
const MAX_BACKOFF_MS = 5 * 60 * 1000

const LIMITS = { name: 200, message: 2000, stack: 16_000 }

/** What the server said about a batch. */
export type SendOutcome = 'sent' | 'retry' | 'drop'

export interface CaptureOptions {
  /** The error took the app down. */
  fatal?: boolean
  /** The app caught the error itself. */
  handled?: boolean
  /** Extra flat context, merged over the SDK's own environment keys. */
  context?: Record<string, string>
}

export interface ErrorTrackerOptions {
  send: (events: MiteErrorEvent[]) => Promise<SendOutcome>
  /** Identity, build, device, route and trail at the moment of capture. */
  contextFor: () => Omit<
    MiteErrorEvent,
    'name' | 'message' | 'stack' | 'is_fatal' | 'handled' | 'occurred_at'
  >
  storage: MiteIdentityStorage
  ignoreErrors?: ReadonlyArray<string | RegExp>
  beforeSend?: (event: MiteErrorEvent) => MiteErrorEvent | null
  now?: () => number
}

function describe(value: unknown): { name: string; message: string; stack?: string } {
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: value.message ?? '',
      ...(value.stack ? { stack: value.stack } : {}),
    }
  }
  if (value && typeof value === 'object' && 'message' in value) {
    const record = value as { name?: unknown; message?: unknown; stack?: unknown }
    return {
      name: typeof record.name === 'string' && record.name ? record.name : 'Error',
      message: String(record.message),
      ...(typeof record.stack === 'string' ? { stack: record.stack } : {}),
    }
  }
  let message: string
  try {
    message = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))
  } catch {
    message = String(value)
  }
  return { name: 'NonError', message }
}

const cut = (value: string, max: number) =>
  value.length > max ? value.slice(0, max) : value

/**
 * Buffers captured JS errors and sends them to Mite in batches.
 *
 * Every change to the buffer is written to storage, so an error that takes
 * the app down is still sent on the next launch. A batch the server rejects
 * as invalid is dropped; a network failure or rate limit keeps it for a
 * later flush with backoff.
 */
export class ErrorTracker {
  private pending: MiteErrorEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushing: Promise<void> | null = null
  private recent = new Map<string, number>()
  private sentThisMinute: number[] = []
  private failures = 0
  private loaded: Promise<void>
  private blockedUntil = 0
  private options: ErrorTrackerOptions
  private now: () => number

  constructor(options: ErrorTrackerOptions) {
    this.options = options
    this.now = options.now ?? Date.now
    // Read the stored buffer before anything can write it, so the errors a
    // previous launch left behind are merged in once rather than clobbered
    // or read back as copies of this session's own errors.
    this.loaded = this.load()
  }

  /** Load the errors a previous session could not send, then send them. */
  async restore(): Promise<void> {
    await this.loaded
    if (this.pending.length > 0) await this.flush()
  }

  private async load(): Promise<void> {
    try {
      const raw = await this.options.storage.getItem(PENDING_STORAGE_KEY)
      if (!raw) return
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const restored = parsed.filter(
        (event): event is MiteErrorEvent =>
          !!event &&
          typeof event === 'object' &&
          typeof (event as MiteErrorEvent).name === 'string' &&
          typeof (event as MiteErrorEvent).message === 'string',
      )
      this.pending = [...restored, ...this.pending].slice(-MAX_PENDING)
    } catch {
      // A corrupt or unreadable buffer only loses errors that were never sent.
    }
  }

  /** Capture an error. Returns false when it was ignored, filtered, or throttled. */
  capture(value: unknown, options: CaptureOptions = {}): boolean {
    try {
      return this.captureUnsafe(value, options)
    } catch (err) {
      // Error tracking must never throw into the app's own error path.
      console.warn('[Mite] Failed to capture error:', err)
      return false
    }
  }

  private captureUnsafe(value: unknown, options: CaptureOptions): boolean {
    const described = describe(value)
    if (!described.message.trim() && !described.stack) return false
    if (this.isIgnored(described.message)) return false

    const at = this.now()
    const key = `${described.name}\n${described.message}\n${described.stack ?? ''}`
    const last = this.recent.get(key)
    this.recent.set(key, at)
    if (this.recent.size > 100) {
      const oldest = this.recent.keys().next().value
      if (oldest !== undefined) this.recent.delete(oldest)
    }
    if (last !== undefined && at - last < DUPLICATE_WINDOW_MS) return false

    this.sentThisMinute = this.sentThisMinute.filter(time => at - time < 60_000)
    if (this.sentThisMinute.length >= MAX_EVENTS_PER_MINUTE) return false

    const context = this.options.contextFor()
    const environment = { ...context.environment, ...options.context }
    let event: MiteErrorEvent | null = {
      ...context,
      name: cut(described.name, LIMITS.name),
      message: cut(described.message, LIMITS.message),
      ...(described.stack ? { stack: cut(described.stack, LIMITS.stack) } : {}),
      is_fatal: options.fatal ?? false,
      handled: options.handled ?? false,
      occurred_at: at,
      ...(Object.keys(environment).length > 0 ? { environment } : {}),
    }
    if (this.options.beforeSend) {
      event = this.options.beforeSend(event)
      if (!event) return false
    }

    this.sentThisMinute.push(at)
    this.pending = [...this.pending, event].slice(-MAX_PENDING)
    void this.persist()

    if (event.is_fatal || this.pending.length >= FLUSH_BATCH_SIZE) {
      void this.flush()
    } else {
      this.schedule()
    }
    return true
  }

  /** Send everything buffered now. Safe to call at any time. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing
    this.clearTimer()
    this.flushing = this.drain().finally(() => {
      this.flushing = null
      if (this.pending.length > 0) this.schedule()
    })
    return this.flushing
  }

  /** Stop the timer. Buffered errors stay in storage for the next launch. */
  destroy(): void {
    this.clearTimer()
  }

  get pendingCount(): number {
    return this.pending.length
  }

  private async drain(): Promise<void> {
    while (this.pending.length > 0 && this.now() >= this.blockedUntil) {
      const batch = this.pending.slice(0, FLUSH_BATCH_SIZE)
      let outcome: SendOutcome
      try {
        outcome = await this.options.send(batch)
      } catch {
        outcome = 'retry'
      }
      if (outcome === 'retry') {
        this.failures += 1
        this.blockedUntil =
          this.now() + Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.failures)
        return
      }
      this.failures = 0
      this.blockedUntil = 0
      this.pending = this.pending.filter(event => !batch.includes(event))
      await this.persist()
    }
  }

  private schedule(): void {
    if (this.timer) return
    const delay = Math.max(FLUSH_DELAY_MS, this.blockedUntil - this.now())
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, delay)
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private isIgnored(message: string): boolean {
    return (this.options.ignoreErrors ?? []).some(pattern =>
      typeof pattern === 'string' ? message.includes(pattern) : pattern.test(message),
    )
  }

  private async persist(): Promise<void> {
    // Writing before the stored buffer is read would overwrite it.
    await this.loaded
    try {
      if (this.pending.length === 0) {
        await this.options.storage.removeItem(PENDING_STORAGE_KEY)
      } else {
        await this.options.storage.setItem(
          PENDING_STORAGE_KEY,
          JSON.stringify(this.pending),
        )
      }
    } catch {
      // Storage is best effort; the in-memory buffer still sends this session.
    }
  }
}
