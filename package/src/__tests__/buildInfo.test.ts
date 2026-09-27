import { getBuildInfo } from '../utils/buildInfo'

jest.mock('expo-application', () => ({ nativeApplicationVersion: '2.4.0' }), {
  virtual: true,
})

const mockUpdates: Record<string, unknown> = {}
jest.mock('expo-updates', () => mockUpdates, { virtual: true })

describe('getBuildInfo', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockUpdates)) delete mockUpdates[key]
  })

  it('reads the app version and the running EAS Update', () => {
    Object.assign(mockUpdates, {
      updateId: 'upd-123',
      channel: 'production',
      runtimeVersion: '2.4.0',
      isEmbeddedLaunch: false,
    })

    expect(getBuildInfo()).toEqual({
      app_version: '2.4.0',
      eas_update_id: 'upd-123',
      channel: 'production',
      runtime_version: '2.4.0',
    })
  })

  it('leaves out the update id of the embedded bundle', () => {
    Object.assign(mockUpdates, {
      updateId: 'embedded',
      channel: 'production',
      isEmbeddedLaunch: true,
    })

    expect(getBuildInfo()).toEqual({ app_version: '2.4.0', channel: 'production' })
  })

  it('skips empty values', () => {
    Object.assign(mockUpdates, { updateId: null, channel: '', runtimeVersion: ' ' })

    expect(getBuildInfo()).toEqual({ app_version: '2.4.0' })
  })
})
