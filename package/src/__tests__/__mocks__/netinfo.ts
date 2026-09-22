export interface NetInfoStateLike {
  type?: string
  isConnected?: boolean | null
  isInternetReachable?: boolean | null
}

const listeners = new Set<(state: NetInfoStateLike) => void>()

export function addEventListener(
  listener: (state: NetInfoStateLike) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitNetInfoState(state: NetInfoStateLike): void {
  for (const listener of listeners) {
    listener(state)
  }
}

export function netInfoListenerCount(): number {
  return listeners.size
}
