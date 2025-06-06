import { ThemedText } from '@/components/ThemedText'
import { ThemedView } from '@/components/ThemedView'
import { InputWithLabel } from '@/components/ui/InputWithLabel'
import { useThemeColor } from '@/hooks/useThemeColor'
import { useMite } from '@mite/mite-sdk'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

export default function BugReportScreen() {
  const mite = useMite()
  const [loading, setLoading] = useState(false)

  const [formData, setFormData] = useState({
    title: 'My first bug from SDK',
    description: 'I dont know, something is wrong. Figure it out',
    reporterName: '',
    reporterEmail: '',
    stepsToReproduce: '',
    expectedBehavior: '',
    actualBehavior: '',
    priority: 'MEDIUM' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [images, setImages] =
    useState<Array<ImagePicker.ImagePickerAsset> | null>(null)

  const tintColor = useThemeColor({}, 'tint')
  const backgroundColor = useThemeColor({}, 'background')
  const textColor = useThemeColor({}, 'text')

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    })

    if (!result.canceled) {
      setImages(result.assets)
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required'
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required'
    }

    if (
      formData.reporterEmail &&
      !/\S+@\S+\.\S+/.test(formData.reporterEmail)
    ) {
      newErrors.reporterEmail = 'Please enter a valid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      // console.log(formData)

      await mite.submitBug({
        title: formData.title,
        description: formData.description,
        reporter_name: formData.reporterName || undefined,
        reporter_email: formData.reporterEmail || undefined,
        steps_to_reproduce: formData.stepsToReproduce || undefined,
        expected_behavior: formData.expectedBehavior || undefined,
        actual_behavior: formData.actualBehavior || undefined,
        priority: formData.priority,
      })
      // Alert.alert(
      //   'Bug Report Submitted',
      //   'Thank you for reporting this bug. Our team will review it shortly.',
      //   [
      //     {
      //       text: 'OK',
      //       onPress: () => router.back(),
      //     },
      //   ],
      // )
    } catch (error) {
      console.error('[Mite] Failed to submit bug report:', error)
      Alert.alert(
        'Submission Failed',
        'There was an error submitting your bug report. Please try again.',
        [{ text: 'OK' }],
      )
    } finally {
      setLoading(false)
    }
  }

  const updateFormData = (field: keyof typeof formData) => (value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="on-drag"
      >
        <ThemedText style={styles.title}>Report a Bug</ThemedText>
        <ThemedText style={styles.subtitle}>
          Help us improve the app by reporting issues you encounter.
        </ThemedText>

        <View style={styles.form}>
          <InputWithLabel
            label="Bug Title"
            placeholder="Brief description of the issue"
            value={formData.title}
            onChangeText={updateFormData('title')}
            error={errors.title}
            required
          />

          <InputWithLabel
            label="Description"
            placeholder="Detailed description of what happened"
            value={formData.description}
            onChangeText={updateFormData('description')}
            error={errors.description}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            required
            inputStyle={styles.textArea}
          />

          <InputWithLabel
            label="Steps to Reproduce"
            placeholder="1. Go to... 2. Click on... 3. See error"
            value={formData.stepsToReproduce}
            onChangeText={updateFormData('stepsToReproduce')}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            inputStyle={styles.textArea}
          />

          <InputWithLabel
            label="Expected Behavior"
            placeholder="What did you expect to happen?"
            value={formData.expectedBehavior}
            onChangeText={updateFormData('expectedBehavior')}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            inputStyle={styles.textArea}
          />

          <InputWithLabel
            label="Actual Behavior"
            placeholder="What actually happened?"
            value={formData.actualBehavior}
            onChangeText={updateFormData('actualBehavior')}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            inputStyle={styles.textArea}
          />

          <View style={styles.prioritySection}>
            <ThemedText style={styles.priorityLabel}>Priority</ThemedText>
            <View style={styles.priorityButtons}>
              {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map(
                priority => (
                  <Pressable
                    key={priority}
                    style={[
                      styles.priorityButton,
                      formData.priority === priority && {
                        backgroundColor: tintColor,
                      },
                    ]}
                    onPress={() => updateFormData('priority')(priority)}
                  >
                    <Text
                      style={[
                        styles.priorityButtonText,
                        {
                          color:
                            formData.priority === priority ? '#fff' : textColor,
                        },
                      ]}
                    >
                      {priority}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>
              Contact Information (Optional)
            </ThemedText>

            <InputWithLabel
              label="Your Name"
              placeholder="Enter your name"
              value={formData.reporterName}
              onChangeText={updateFormData('reporterName')}
            />

            <InputWithLabel
              label="Email Address"
              placeholder="your.email@example.com"
              value={formData.reporterEmail}
              onChangeText={updateFormData('reporterEmail')}
              error={errors.reporterEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor }]}>
        <Pressable
          style={styles.cancelButton}
          onPress={() => router.back()}
          disabled={loading}
        >
          <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
        </Pressable>

        <Pressable
          style={[
            styles.submitButton,
            { backgroundColor: tintColor },
            loading && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Bug Report</Text>
          )}
        </Pressable>
      </View>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    lineHeight: 34,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 24,
  },
  form: {
    gap: 4,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  prioritySection: {
    marginBottom: 20,
  },
  priorityLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  priorityButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
  },
  priorityButtonText: {
    fontSize: 16,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    flex: 2,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
