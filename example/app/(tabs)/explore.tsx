import { ThemedText } from '@/components/ThemedText'
import { ThemedView } from '@/components/ThemedView'
import { InputWithLabel } from '@/components/ui/InputWithLabel'
import { useThemeColor } from '@/hooks/useThemeColor'
import { type MiteAttachment, useFeedback } from '@usemite/sdk'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Attachment = MiteAttachment

const MAX_ATTACHMENTS = 3

export default function ReportScreen() {
  const insets = useSafeAreaInsets()
  const { send, sending: submitting, lastResponse, reset } = useFeedback()
  const tintColor = useThemeColor({ light: '#0a7ea4', dark: '#4fc3f7' }, 'tint')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [expectedBehavior, setExpectedBehavior] = useState('')
  const [actualBehavior, setActualBehavior] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])

  const clearForm = () => {
    setTitle('')
    setDescription('')
    setStepsToReproduce('')
    setExpectedBehavior('')
    setActualBehavior('')
    setAttachments([])
    reset()
  }

  const pickScreenshots = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_ATTACHMENTS - attachments.length,
        quality: 0.8,
      })

      if (result.canceled) {
        return
      }

      setAttachments(current => {
        const fresh = result.assets
          .filter(asset => !current.some(existing => existing.uri === asset.uri))
          .map(asset => ({
            uri: asset.uri,
            name: asset.fileName ?? undefined,
            type: asset.mimeType ?? 'image/jpeg',
          }))
        return [...current, ...fresh].slice(0, MAX_ATTACHMENTS)
      })
    } catch {
      Alert.alert('Error', 'Could not open the photo library. Please try again.')
    }
  }

  const removeAttachment = (uri: string) => {
    setAttachments(current => current.filter(attachment => attachment.uri !== uri))
  }

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Missing fields', 'Title and description are required.')
      return
    }

    try {
      const result = await send({
        type: 'bug',
        title: title.trim(),
        message: description.trim(),
        steps: stepsToReproduce.trim() || undefined,
        expected: expectedBehavior.trim() || undefined,
        actual: actualBehavior.trim() || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      })

      // The account is over a plan limit. No report exists, and a retry
      // cannot change that, so keep the form as the user left it.
      if (!result.ok) {
        Alert.alert(
          'Report not accepted',
          'This app has reached its report limit. Please try again later.',
        )
        return
      }

      // The report exists, but its files did not fit in the storage quota.
      if (result.droppedAttachments) {
        Alert.alert(
          'Attachments not saved',
          `${result.droppedAttachments.count} file(s) could not be uploaded. The report was sent without them.`,
        )
      }

      Alert.alert('Bug reported!', 'Your report has been submitted.', [
        {
          text: 'OK',
          onPress: clearForm,
        },
      ])
    } catch {
      Alert.alert('Error', 'Failed to submit. Please try again.')
    }
  }

  if (lastResponse) {
    return (
      <ThemedView style={styles.container}>
        <View style={[styles.successContainer, { paddingTop: insets.top + 20 }]}>
          <View style={[styles.successBadge, { backgroundColor: '#34c75920' }]}>
            <ThemedText style={styles.successIcon}>✓</ThemedText>
          </View>
          <ThemedText type="title">Submitted</ThemedText>
          <ThemedText lightColor="#666" darkColor="#999">
            Bug ID: {lastResponse.id}
          </ThemedText>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: tintColor }]}
            onPress={clearForm}
          >
            <ThemedText style={styles.buttonText} lightColor="#fff" darkColor="#fff">
              Report Another
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    )
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
            Report a Bug
          </ThemedText>
          <ThemedText style={styles.pageSubtitle} lightColor="#666" darkColor="#999">
            Help us improve by reporting issues
          </ThemedText>

          <View style={styles.form}>
            <InputWithLabel
              label="Title"
              required
              placeholder="Brief summary of the issue"
              value={title}
              onChangeText={setTitle}
            />

            <InputWithLabel
              label="Description"
              required
              placeholder="What happened?"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              style={styles.textArea}
            />

            <InputWithLabel
              label="Steps to Reproduce"
              placeholder="1. Go to...&#10;2. Tap on...&#10;3. See error"
              value={stepsToReproduce}
              onChangeText={setStepsToReproduce}
              multiline
              numberOfLines={3}
              style={styles.textArea}
            />

            <InputWithLabel
              label="Expected Behavior"
              placeholder="What did you expect to happen?"
              value={expectedBehavior}
              onChangeText={setExpectedBehavior}
              multiline
              numberOfLines={2}
            />

            <InputWithLabel
              label="Actual Behavior"
              placeholder="What actually happened?"
              value={actualBehavior}
              onChangeText={setActualBehavior}
              multiline
              numberOfLines={2}
            />

            <View style={styles.attachmentsSection}>
              <ThemedText style={styles.attachmentsLabel}>Screenshots</ThemedText>
              <View style={styles.attachmentsRow}>
                {attachments.map(attachment => (
                  <TouchableOpacity
                    key={attachment.uri}
                    onPress={() => removeAttachment(attachment.uri)}
                  >
                    <Image
                      source={{ uri: attachment.uri }}
                      style={styles.attachmentThumb}
                    />
                    <View style={styles.attachmentRemoveBadge}>
                      <ThemedText
                        style={styles.attachmentRemoveText}
                        lightColor="#fff"
                        darkColor="#fff"
                      >
                        ×
                      </ThemedText>
                    </View>
                  </TouchableOpacity>
                ))}
                {attachments.length < MAX_ATTACHMENTS && (
                  <TouchableOpacity
                    style={[styles.attachmentAdd, { borderColor: tintColor }]}
                    onPress={pickScreenshots}
                  >
                    <ThemedText style={[styles.attachmentAddText, { color: tintColor }]}>
                      +
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </View>
              <ThemedText
                style={styles.attachmentsHint}
                lightColor="#999"
                darkColor="#666"
              >
                Up to 3 images. Tap a thumbnail to remove it.
              </ThemedText>
            </View>

            <TouchableOpacity
              style={[
                styles.button,
                { backgroundColor: tintColor },
                submitting && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.buttonText} lightColor="#fff" darkColor="#fff">
                  Submit Report
                </ThemedText>
              )}
            </TouchableOpacity>
          </View>
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
  form: {
    gap: 4,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  attachmentsSection: {
    marginBottom: 16,
  },
  attachmentsLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  attachmentsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  attachmentThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  attachmentRemoveBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentRemoveText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '600',
  },
  attachmentAdd: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentAddText: {
    fontSize: 28,
    lineHeight: 32,
  },
  attachmentsHint: {
    fontSize: 13,
    marginTop: 8,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
  },
  successBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successIcon: {
    fontSize: 28,
    color: '#34c759',
    fontWeight: 'bold',
  },
})
