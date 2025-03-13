import type { HybridObject } from 'react-native-nitro-modules'

export interface MiteSDK extends HybridObject<{ ios: 'c++'; android: 'c++' }> {
  readonly hello: string
}
