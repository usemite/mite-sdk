import ParallaxScrollView from '@/components/ParallaxScrollView'
import { BugReport, useMite } from '@mite/mite-sdk'
import { useRouter } from 'expo-router'
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

export default function HomeScreen() {
  const mite = useMite()
  const router = useRouter()
  const triggerTypeError = () => {
    // Trying to call a method on undefined
    const user = undefined
    // @ts-expect-error
    user.getName()
  }

  const triggerReferenceError = () => {
    // Trying to call an undefined function
    // @ts-expect-error
    nonExistentFunction()
  }

  const triggerPromiseError = async () => {
    // Throwing an error in a promise
    new Promise((resolve, reject) => {
      reject(new Error('Async operation failed'))
    })
  }

  const triggerCustomError = () => {
    // Throwing a custom error
    throw new Error('This is a custom error message')
  }

  const triggerRangeError = () => {
    // Creating an array with invalid length
    new Array(-1)
  }

  // This will trigger a native crash that will be caught by our native crash handlers
  const triggerNativeCrash = () => {
    // This creates a segmentation fault in native code
    // WARNING: This will actually crash the app!
    // Access memory address 0, which will cause a segmentation fault
    // const array = new Int32Array(1)
    // @ts-ignore - Intentionally causing a crash
    // array[0xffffffff] = 0
    console.log('called')

    // @ts-expect-error
    test.should?.crash()
  }

  const reportBug = async () => {
    // Capture a bug and send it to the server
    router.navigate('/bug-report')

    // await mite.submitBug({
    //   title: 'Bug Title',
    //   description: 'Bug Description',
    //   steps_to_reproduce: 'Steps to reproduce',
    //   expected_behavior: 'Expected behavior',
    //   actual_behavior: 'Actual behavior',
    // })
  }

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.reactLogo}
        />
      }
    >
      <View style={styles.container}>
        <Text style={styles.title}>Error Testing App</Text>

        <TouchableOpacity style={styles.button} onPress={triggerTypeError}>
          <Text style={styles.buttonText}>Trigger TypeError</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={triggerReferenceError}>
          <Text style={styles.buttonText}>Trigger ReferenceError</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={triggerPromiseError}>
          <Text style={styles.buttonText}>Trigger Promise Rejection</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={triggerCustomError}>
          <Text style={styles.buttonText}>Trigger Custom Error</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={triggerRangeError}>
          <Text style={styles.buttonText}>Trigger RangeError</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: '#FF3B30' }]}
          onPress={triggerNativeCrash}
        >
          <Text style={styles.buttonText}>Trigger Native Crash</Text>
        </TouchableOpacity>

        <Pressable onPress={reportBug}>
          <View style={styles.button}>
            <Text style={styles.buttonText}>Report Bug</Text>
          </View>
        </Pressable>
      </View>
    </ParallaxScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
})
