import ParallaxScrollView from '@/components/ParallaxScrollView'
import { MiteSDK } from '@mite/mite-sdk'
import { Image, Pressable, StyleSheet, Text, View } from 'react-native'

export default function HomeScreen() {
  const triggerTypeError = () => {
    // Trying to call a method on undefined
    const user = undefined
    // user.getName();
  }

  const triggerReferenceError = () => {
    // Trying to call an undefined function
    // nonExistentFunction();
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
        <Text style={styles.title}>{MiteSDK.hello}</Text>
        <Text style={styles.title}>Error Testing App</Text>

        <Pressable style={styles.button} onPress={triggerTypeError}>
          <Text style={styles.buttonText}>Trigger TypeError</Text>
        </Pressable>

        <Pressable style={styles.button} onPress={triggerReferenceError}>
          <Text style={styles.buttonText}>Trigger ReferenceError</Text>
        </Pressable>

        <Pressable style={styles.button} onPress={triggerPromiseError}>
          <Text style={styles.buttonText}>Trigger Promise Rejection</Text>
        </Pressable>

        <Pressable style={styles.button} onPress={triggerCustomError}>
          <Text style={styles.buttonText}>Trigger Custom Error</Text>
        </Pressable>

        <Pressable style={styles.button} onPress={triggerRangeError}>
          <Text style={styles.buttonText}>Trigger RangeError</Text>
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
