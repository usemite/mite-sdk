interface HermesRejectionTracker {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean
    onUnhandled: (id: number, rejection: unknown) => void
    onHandled: (id: number) => void
  }) => void
  hasPromise?: () => boolean
}

type RejectionListener = (rejection: unknown) => void

let listener: RejectionListener | null = null
let installed = false

/**
 * Report promise rejections nobody handled. Hermes only: it is the default
 * engine for React Native and the only one with a tracker we can hook
 * without patching the Promise polyfill. Hermes keeps one tracker, so the
 * SDK installs it once and swaps the listener; in development it also warns
 * the way React Native's own tracker does, so the rejection stays visible.
 *
 * Returns false when the engine has no tracker.
 */
export function trackUnhandledRejections(onRejection: RejectionListener | null): boolean {
  listener = onRejection
  if (installed || !onRejection) return installed

  const hermes = (globalThis as { HermesInternal?: HermesRejectionTracker })
    .HermesInternal
  if (typeof hermes?.enablePromiseRejectionTracker !== 'function') return false
  if (hermes.hasPromise && !hermes.hasPromise()) return false

  hermes.enablePromiseRejectionTracker({
    allRejections: true,
    onUnhandled: (_id, rejection) => {
      if ((globalThis as { __DEV__?: boolean }).__DEV__) {
        console.warn('Possible unhandled promise rejection:', rejection)
      }
      listener?.(rejection)
    },
    onHandled: () => {},
  })
  installed = true
  return true
}
