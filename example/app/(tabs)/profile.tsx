import { ThemedText } from '@/components/ThemedText'
import { ThemedView } from '@/components/ThemedView'
import { InputWithLabel } from '@/components/ui/InputWithLabel'
import { useThemeColor } from '@/hooks/useThemeColor'
import { useMite } from '@usemite/sdk'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function ProfileScreen() {
  const mite = useMite()
  const insets = useSafeAreaInsets()
  const tintColor = useThemeColor({ light: '#0a7ea4', dark: '#4fc3f7' }, 'tint')
  const cardBg = useThemeColor({ light: '#f5f5f5', dark: '#1e1e1e' }, 'background')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [anonymousId, setAnonymousId] = useState(mite.user.anonymousId)
  const [userIdentifier, setUserIdentifier] = useState(mite.user.id)
  const [optedOut, setOptedOut] = useState(mite.user.isOptedOut)

  const refreshIdentity = useCallback(() => {
    setAnonymousId(mite.user.anonymousId)
    setUserIdentifier(mite.user.id)
    setOptedOut(mite.user.isOptedOut)
  }, [mite])

  useFocusEffect(
    useCallback(() => {
      let active = true
      mite.whenIdentityReady().then(() => {
        if (active) refreshIdentity()
      })
      return () => {
        active = false
      }
    }, [mite, refreshIdentity]),
  )

  const handleIdentify = async () => {
    setSubmitting(true)
    try {
      const identifier =
        userId.trim() || email.trim() || `demo-user-${mite.user.anonymousId.slice(0, 8)}`
      await mite.user.identify(identifier, {
        email: email.trim() || undefined,
        name: name.trim() || undefined,
        traits: { source: 'example-app', fake_identity: true },
      })
      refreshIdentity()
      setName('')
      setEmail('')
      setUserId('')
      Alert.alert('Identified', `Now reporting as ${identifier}.`)
    } catch {
      Alert.alert('Error', 'Failed to identify. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    try {
      await mite.user.reset()
      refreshIdentity()
    } catch {
      Alert.alert('Error', 'Failed to log out. Please try again.')
    }
  }

  const handleOptOutChange = async (value: boolean) => {
    setOptedOut(value)
    try {
      await (value ? mite.user.optOut() : mite.user.optIn())
    } catch {
      Alert.alert('Error', 'Failed to update the identification preference.')
    } finally {
      refreshIdentity()
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <ThemedText type="title" style={styles.pageTitle}>
            Profile
          </ThemedText>
          <ThemedText style={styles.pageSubtitle} lightColor="#666" darkColor="#999">
            The end user identity attached to reports, requests, and votes
          </ThemedText>

          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.stateRow}>
              <ThemedText style={styles.stateLabel} lightColor="#666" darkColor="#999">
                Status
              </ThemedText>
              <ThemedText type="defaultSemiBold">
                {userIdentifier ? 'Identified' : 'Anonymous'}
              </ThemedText>
            </View>
            {userIdentifier ? (
              <View style={styles.stateRow}>
                <ThemedText style={styles.stateLabel} lightColor="#666" darkColor="#999">
                  User
                </ThemedText>
                <ThemedText type="defaultSemiBold" numberOfLines={1}>
                  {userIdentifier}
                </ThemedText>
              </View>
            ) : null}
            <View style={styles.stateRow}>
              <ThemedText style={styles.stateLabel} lightColor="#666" darkColor="#999">
                Anonymous ID
              </ThemedText>
              <ThemedText style={styles.monoValue} numberOfLines={1}>
                {anonymousId}
              </ThemedText>
            </View>
            <View style={styles.stateRow}>
              <ThemedText style={styles.stateLabel} lightColor="#666" darkColor="#999">
                Identification opt-out
              </ThemedText>
              <Switch value={optedOut} onValueChange={handleOptOutChange} />
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Identify this user</ThemedText>
            <ThemedText style={styles.helperText} lightColor="#666" darkColor="#999">
              Links the anonymous ID to an account so activity follows the user.
            </ThemedText>
            <InputWithLabel
              label="Name"
              placeholder="Taylor Doe"
              value={name}
              onChangeText={setName}
            />
            <InputWithLabel
              label="Email"
              placeholder="taylor@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <InputWithLabel
              label="User ID"
              placeholder="user_123 (your app's account id)"
              value={userId}
              onChangeText={setUserId}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: tintColor },
                (submitting || optedOut) && styles.buttonDisabled,
              ]}
              onPress={handleIdentify}
              disabled={submitting || optedOut}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText
                  style={styles.primaryButtonText}
                  lightColor="#fff"
                  darkColor="#fff"
                >
                  {optedOut ? 'Identification opted out' : 'Identify'}
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>

          {userIdentifier ? (
            <View style={styles.section}>
              <ThemedText type="defaultSemiBold">Log out</ThemedText>
              <ThemedText style={styles.helperText} lightColor="#666" darkColor="#999">
                Removes the identified user while keeping the anonymous ID stable.
              </ThemedText>
              <TouchableOpacity
                style={[styles.secondaryButton, { borderColor: tintColor }]}
                onPress={handleLogout}
              >
                <ThemedText style={[styles.secondaryButtonText, { color: tintColor }]}>
                  Log out
                </ThemedText>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  pageTitle: {
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 28,
  },
  stateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  stateLabel: {
    fontSize: 14,
  },
  monoValue: {
    fontSize: 13,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    flexShrink: 1,
  },
  section: {
    marginBottom: 28,
    gap: 4,
  },
  helperText: {
    fontSize: 14,
    marginBottom: 8,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 8,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
