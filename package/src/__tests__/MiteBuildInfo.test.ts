import { Mite } from '../Mite'

jest.mock('axios', () => {
  const instance = {
    get: jest.fn(),
    post: jest.fn(),
    interceptors: { response: { use: jest.fn() }, request: { use: jest.fn() } },
    defaults: { headers: { common: {} } },
  }
  return { create: jest.fn(() => instance), __mockInstance: instance }
})

jest.mock('../utils/buildInfo', () => ({
  getBuildInfo: () => ({
    app_version: '2.4.0',
    eas_update_id: 'upd-123',
    channel: 'production',
    runtime_version: '2.4.0',
  }),
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockAxios = require('axios').__mockInstance

describe('Mite build info', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation()
    jest.spyOn(console, 'warn').mockImplementation()
    mockAxios.post.mockResolvedValue({ data: { id: 'bug-1', status: 'NEEDS_TRIAGE' } })
  })

  it('attaches the build to bug reports so they match a release', async () => {
    const mite = new Mite({ apiKey: 'test' })
    await mite.submitBug({ title: 'Bug', description: 'Broke' })

    expect(mockAxios.post).toHaveBeenLastCalledWith(
      '/api/v1/bug-reports',
      expect.objectContaining({
        app_version: '2.4.0',
        eas_update_id: 'upd-123',
        channel: 'production',
        runtime_version: '2.4.0',
      }),
      undefined,
    )
  })

  it('lets the caller override the detected version', async () => {
    const mite = new Mite({ apiKey: 'test' })
    await mite.submitBug({ title: 'Bug', description: 'Broke', app_version: '9.9.9' })

    expect(mockAxios.post.mock.calls.at(-1)?.[1]).toMatchObject({ app_version: '9.9.9' })
  })

  it('keeps the build on reports sent while opted out', async () => {
    const mite = new Mite({ apiKey: 'test', identificationOptOut: true })
    await mite.submitBug({ title: 'Bug', description: 'Broke' })

    expect(mockAxios.post.mock.calls.at(-1)?.[1]).toMatchObject({
      app_version: '2.4.0',
      eas_update_id: 'upd-123',
    })
  })

  it('sends the detected version when identifying', async () => {
    const mite = new Mite({ apiKey: 'test' })
    await mite.identify({ user_identifier: 'ada' })

    expect(mockAxios.post).toHaveBeenLastCalledWith(
      '/api/v1/identify',
      expect.objectContaining({ app_version: '2.4.0' }),
      undefined,
    )
  })
})
