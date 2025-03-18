import type { HybridObject } from 'react-native-nitro-modules'

export interface MiteSDK extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  readonly hello: string
  
  /**
   * Installs native signal handlers to catch and report app crashes
   */
  installCrashHandlers(): void
  
  /**
   * Removes previously installed crash handlers
   */
  removeCrashHandlers(): void
}
