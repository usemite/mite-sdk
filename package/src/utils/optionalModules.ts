export interface AccelerometerMeasurement {
  x: number
  y: number
  z: number
}

export interface AccelerometerSubscription {
  remove(): void
}

export interface AccelerometerModule {
  addListener(
    listener: (measurement: AccelerometerMeasurement) => void,
  ): AccelerometerSubscription
  setUpdateInterval(intervalMs: number): void
}

interface ExpoSensorsModule {
  Accelerometer: AccelerometerModule
}

export interface ViewShotCaptureOptions {
  format?: 'png' | 'jpg' | 'webm' | 'raw'
  quality?: number
  result?: 'tmpfile' | 'base64' | 'data-uri'
  width?: number
  height?: number
}

export interface ViewShotModule {
  captureRef(ref: unknown, options?: ViewShotCaptureOptions): Promise<string>
  captureScreen(options?: ViewShotCaptureOptions): Promise<string>
}

const warned = new Set<string>()

function warnOnce(moduleName: string, message: string): void {
  if (warned.has(moduleName)) {
    return
  }
  warned.add(moduleName)
  console.warn(`[Mite] ${message}`)
}

let expoSensors: ExpoSensorsModule | null | undefined

/**
 * Load expo-sensors if it is installed in the host app.
 * Returns null (with a one-time warning) when the module is missing.
 */
export function loadExpoSensors(): ExpoSensorsModule | null {
  if (expoSensors !== undefined) {
    return expoSensors
  }

  try {
    const mod = require('expo-sensors') as Partial<ExpoSensorsModule> | undefined
    if (typeof mod?.Accelerometer?.addListener === 'function') {
      expoSensors = mod as ExpoSensorsModule
    } else {
      expoSensors = null
    }
  } catch {
    expoSensors = null
  }

  if (expoSensors === null) {
    warnOnce(
      'expo-sensors',
      'expo-sensors is not installed. Shake-to-report is disabled. Install expo-sensors to enable shake detection.',
    )
  }

  return expoSensors
}

let viewShot: ViewShotModule | null | undefined

/**
 * Load react-native-view-shot if it is installed in the host app.
 * Returns null (with a one-time warning) when the module is missing.
 */
export function loadViewShot(): ViewShotModule | null {
  if (viewShot !== undefined) {
    return viewShot
  }

  try {
    const mod = require('react-native-view-shot') as Partial<ViewShotModule> | undefined
    if (
      typeof mod?.captureRef === 'function' &&
      typeof mod?.captureScreen === 'function'
    ) {
      viewShot = mod as ViewShotModule
    } else {
      viewShot = null
    }
  } catch {
    viewShot = null
  }

  if (viewShot === null) {
    warnOnce(
      'react-native-view-shot',
      'react-native-view-shot is not installed. Bug reports will be submitted without screenshots. Install react-native-view-shot to enable screenshot capture.',
    )
  }

  return viewShot
}

export interface NetInfoStateLike {
  type?: string
  isConnected?: boolean | null
  isInternetReachable?: boolean | null
}

export interface NetInfoModule {
  addEventListener(listener: (state: NetInfoStateLike) => void): () => void
}

let netInfo: NetInfoModule | null | undefined

/**
 * Load @react-native-community/netinfo if it is installed in the host app.
 * Returns null when the module is missing, and stays silent about it.
 */
export function loadNetInfo(): NetInfoModule | null {
  if (netInfo !== undefined) {
    return netInfo
  }

  try {
    const mod = require('@react-native-community/netinfo') as
      | Partial<NetInfoModule>
      | undefined
    netInfo = typeof mod?.addEventListener === 'function' ? (mod as NetInfoModule) : null
  } catch {
    netInfo = null
  }

  return netInfo
}
