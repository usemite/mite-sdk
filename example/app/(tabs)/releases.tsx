import ParallaxScrollView from '@/components/ParallaxScrollView'
import { type Release, useMite } from '@mite/mite-sdk'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

export default function ReleasesScreen() {
  const mite = useMite()
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchReleases = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const data = await mite.getReleases({ limit: 10 })

      setReleases(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch releases'
      setError(message)
      console.error('[Releases] Error:', err)
    } finally {
      setLoading(false)
    }
  }, [mite])

  useEffect(() => {
    fetchReleases()
  }, [fetchReleases])

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Not released'
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getPlatformLabel = (platform: string) => {
    switch (platform) {
      case 'ios':
        return 'iOS'
      case 'android':
        return 'Android'
      case 'all':
        return 'All Platforms'
      default:
        return platform
    }
  }

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'ios':
        return '#007AFF'
      case 'android':
        return '#3DDC84'
      case 'all':
        return '#8E44AD'
      default:
        return '#666'
    }
  }

  const renderRelease = (release: Release) => (
    <View key={release.id} style={styles.releaseCard}>
      <View style={styles.releaseHeader}>
        <Text style={styles.version}>v{release.version}</Text>
        <View
          style={[
            styles.platformBadge,
            { backgroundColor: getPlatformColor(release.platform) },
          ]}
        >
          <Text style={styles.platformText}>{getPlatformLabel(release.platform)}</Text>
        </View>
      </View>
      {release.notes && <Text style={styles.notes}>{release.notes}</Text>}
      <Text style={styles.date}>
        {release.releasedAt ? `Released: ${formatDate(release.releasedAt)}` : 'Draft'}
      </Text>
    </View>
  )

  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#E8F5E9', dark: '#1B5E20' }}
      headerImage={
        <Image
          source={require('@/assets/images/partial-react-logo.png')}
          style={styles.headerImage}
        />
      }
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Releases</Text>
            <Text style={styles.subtitle}>App version history</Text>
          </View>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={fetchReleases}
            disabled={loading}
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Loading releases...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchReleases}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && !error && releases.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No releases found</Text>
            <Text style={styles.emptySubtext}>
              Check that your API key is configured correctly
            </Text>
          </View>
        )}

        {!loading && releases.map(renderRelease)}
      </View>
    </ParallaxScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  refreshButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  headerImage: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
    opacity: 0.3,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    backgroundColor: '#FFEBEE',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#C62828',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: 'white',
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  releaseCard: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  releaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  version: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  platformBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  platformText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  notes: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    lineHeight: 20,
  },
  date: {
    fontSize: 12,
    color: '#666',
  },
})
