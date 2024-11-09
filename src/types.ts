import type Device from 'expo-device'

export interface BugzzAppConfig {
  appId: string
  publicKey: string
  endpoint?: string
  timeout?: number
  retries?: number
}

export interface ErrorReport {
  timestamp: string
  error: {
    error_name: string
    error_message: string
    error_stack: string
    type?: string
    promiseId?: string
  }
  device: typeof Device
  metadata: Record<string, string | number | boolean>
}
