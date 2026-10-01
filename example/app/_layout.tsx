import { useFonts } from 'expo-font'
import { Stack, useNavigationContainerRef } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import 'react-native-reanimated'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  AnnouncementPopup,
  Mite,
  MiteProvider,
  ShakeToReport,
  useMiteNavigationTracking,
} from '@usemite/sdk'

const mite = new Mite({
  apiKey: process.env.EXPO_PUBLIC_MITE_API_KEY,
  identityStorage: AsyncStorage,
})

mite.init()

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  useMiteNavigationTracking(useNavigationContainerRef())
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  })

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
    }
  }, [loaded])

  if (!loaded) {
    return null
  }

  return (
    <MiteProvider client={mite}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <ShakeToReport showFloatingButton />
      <AnnouncementPopup />
      <StatusBar style="auto" />
    </MiteProvider>
  )
}
