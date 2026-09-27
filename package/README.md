# Mite SDK

A React Native SDK for bug reporting, release management, and feature requests.

**🌐 Website: [usemite.com](https://usemite.com)** · **📚 Documentation: [docs.usemite.com](https://docs.usemite.com)**

## Installation

```bash
npm install @usemite/sdk
# or
yarn add @usemite/sdk
# or
bun add @usemite/sdk
```

`react`, `react-native`, and `expo-device` are required peer dependencies.
Everything else is optional and only needed for the feature that uses it — see
[Peer dependencies](https://docs.usemite.com/#peer-dependencies).

## Quick start

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage'
// or: import { MMKV } from 'react-native-mmkv'
import { Mite, MiteProvider, ShakeToReport, WhatsNew } from '@usemite/sdk'

const mite = new Mite({
  apiKey: process.env.EXPO_PUBLIC_MITE_API_KEY,
  identityStorage: AsyncStorage, // or: new MMKV()
})

mite.init()

export default function RootLayout() {
  return (
    <MiteProvider miteInstance={mite}>
      {/* Your app */}
      <ShakeToReport />
      <WhatsNew />
    </MiteProvider>
  )
}
```

That gives you shake-to-report bug filing with annotated screenshots, and
release notes shown once per app update. Pass `identityStorage` so the anonymous
user ID survives app restarts.

Submit a report yourself with the hook:

```tsx
import { useBugReport } from '@usemite/sdk'

const { submitBug, submitting, error } = useBugReport()

await submitBug({
  title: 'App crashes on launch',
  description: 'The app shows a white screen and closes immediately.',
})
```

### Triage context

Every report carries a flat `environment` record. Mite fills in `current_route`,
`last_error_message`, `last_error_stack`, and `network_state` when it knows them, and
your own `environment` keys always win. Uncaught JS errors are captured by default. Set
`captureUncaughtErrors: false` to turn that off, and call `mite.recordError(error)` or
the exported `recordError` to capture one yourself. `network_state` needs the optional
`@react-native-community/netinfo` peer dependency.

### Release matching

Reports carry the build they came from, so Mite files each one under the release
the user was running. `app_version` comes from `expo-application` (or
`expo-constants`), and `eas_update_id`, `channel`, and `runtime_version` come from
`expo-updates` when it is installed. Pass any of them to `submitBug` to override.

## Documentation

| Guide | |
| --- | --- |
| [Getting Started](https://docs.usemite.com/) | Installation, setup, and configuration |
| [Identity Management](https://docs.usemite.com/identity) | Anonymous and identified users, privacy opt-out |
| [Bug Reports](https://docs.usemite.com/bug-reports) | Submitting reports with attachments |
| [In-App Bug Reporting](https://docs.usemite.com/shake-to-report) | Shake gesture, screenshot, annotation |
| [Releases](https://docs.usemite.com/releases) | Fetching published releases |
| [What's New](https://docs.usemite.com/whats-new) | Release notes after an update |
| [Feature Requests](https://docs.usemite.com/feature-requests) | Board, voting, and submissions |
| [Store Review Prompt](https://docs.usemite.com/store-review) | Routing happy users to the app store |
| [Navigation Breadcrumbs](https://docs.usemite.com/navigation-breadcrumbs) | Screen trail on bug reports |
| [Offline Queue](https://docs.usemite.com/offline-queue) | Retry behavior for failed reports |

**Reference:** [Mite Instance API](https://docs.usemite.com/mite-instance) ·
[Hooks](https://docs.usemite.com/hooks) ·
[Components](https://docs.usemite.com/components) ·
[Types](https://docs.usemite.com/types)

## License

MIT
