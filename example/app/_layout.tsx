import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import 'react-native-reanimated'
import { Mite, MiteProvider } from '@mite/mite-sdk'

const mite = new Mite({
  // publicKey: process.env.EXPO_PUBLIC_MITE_KEY!,
  // appId: process.env.EXPO_PUBLIC_MITE_APP_ID!,
  apiKey: process.env.EXPO_PUBLIC_MITE_API_KEY,
})

mite.init()

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
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
    <MiteProvider miteInstance={mite}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
        <Stack.Screen
          name="bug-report"
          options={{
            presentation: 'modal',
          }}
        />
      </Stack>
      <StatusBar style="auto" />
    </MiteProvider>
  )
}
