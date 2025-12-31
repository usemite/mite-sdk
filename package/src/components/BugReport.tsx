// import type * as ImagePicker from 'expo-image-picker'
import { type PropsWithChildren, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'

export function BugReport({ children }: PropsWithChildren) {
  const [visible, setVisible] = useState(false)
  // const [, setImages] = useState<Array<ImagePicker.ImagePickerAsset> | null>(null)

  // const pickImages = async () => {
  //   // No permissions request is necessary for launching the image library
  //   const result = await ImagePicker.launchImageLibraryAsync({
  //     mediaTypes: ['images', 'videos'],
  //     allowsEditing: true,
  //     aspect: [4, 3],
  //     quality: 1,
  //   })

  //   console.log(result)

  //   if (!result.canceled) {
  //     setImages(result.assets)
  //   }
  // }

  return (
    <>
      <Pressable onPress={() => setVisible(true)}>{children}</Pressable>
      <Modal
        presentationStyle="pageSheet"
        visible={visible}
        onDismiss={() => setVisible(false)}
        animationType="slide"
      >
        <View style={styles.container}>
          <Text>Report Bug</Text>
          <Pressable onPress={() => setVisible(false)}>
            <Text>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingVertical: 24,
    gap: 12,
  },
  submit: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  submitText: {
    fontWeight: '600',
    fontSize: 16,
  },
})
