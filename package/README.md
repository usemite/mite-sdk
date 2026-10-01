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

mite.init() // starts the offline queue and syncs the user

export default function RootLayout() {
  return (
    <MiteProvider client={mite}>
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

## The everyday API

Most apps need three calls. Each area of Mite has its own namespace on the
instance, so `mite.` autocompletes to `feedback`, `features`, `errors`, `user`,
`releases`, `announcements` and `storeReview`.

```tsx
// Anything a user sends: a bug, a question, an idea.
await mite.feedback.send({ message: 'How do I export my data?', type: 'question' })
await mite.feedback.send({
  type: 'bug',
  message: 'Checkout button does nothing',
  screenshot: screenshotUri,
  steps: '1. Add an item 2. Tap checkout', // only allowed when type is 'bug'
})

// A request for the public feature board, where other users vote on it.
await mite.features.request({ title: 'Dark mode', author: { email } })

// An error your code caught. Uncaught errors are sent for you.
mite.errors.capture(error)

// After sign-in and sign-out.
await mite.user.identify(user.id, { email: user.email, isPaying: true })
await mite.user.reset()
```

`type` defaults to `'other'`, and `title` defaults to the message's first line.
`feedback.send` returns `{ ok: false, refusal }` when the account is over its
plan limit instead of throwing, because that is an expected state and not a
fault. Network faults still throw.

In a component, `useFeedback()` wraps the same call with its state:

```tsx
import { useFeedback } from '@usemite/sdk'

const { send, sending, error, refusal } = useFeedback()
```

### Moving from 1.0

The 1.0 methods still work and are marked `@deprecated`, so your editor strikes
them through and names the replacement. They will be removed in 2.0.

| 1.0 | Now |
| --- | --- |
| `submitBug({ title, description })` | `feedback.send({ type: 'bug', message })` |
| `createFeatureRequest({ title, author_email })` | `features.request({ title, author: { email } })` |
| `voteFeatureRequest({ feature_request_id })` | `features.vote(id)` |
| `getFeatureRequests()` / `getFeatureRequestVotes()` | `features.list()` / `features.myVotes()` |
| `recordError(e)` / `captureError(e)` / `flushErrors()` | `errors.capture(e)` / `errors.flush()` |
| `identify({ user_identifier, ... })` | `user.identify(id, { ... })` |
| `logout()` / `setIdentificationOptOut(bool)` | `user.reset()` / `user.optOut()`, `user.optIn()` |
| `anonymousId` / `userIdentifier` / `isIdentificationOptedOut` | `user.anonymousId` / `user.id` / `user.isOptedOut` |
| `getReleases()` / `get`/`setLastSeenReleaseVersion()` | `releases.list()` / `releases.lastSeen()`, `releases.markSeen(v)` |
| `getAnnouncements()` and the seen-id methods | `announcements.list()`, `.markSeen(id)`, `.seenIds()`, `.clearSeen()` |
| `isStoreReviewAvailable()` / `requestStoreReview()` | `storeReview.isAvailable()` / `storeReview.request()` |
| `<MiteProvider miteInstance={mite}>` | `<MiteProvider client={mite}>` |

`feedback.send` posts to `/api/v1/feedback`, which needs a Mite server that
has that route. `submitBug` keeps using `/api/v1/bug-reports`.

### Triage context

Every report carries a flat `environment` record. Mite fills in `current_route`,
`last_error_message`, `last_error_stack`, and `network_state` when it knows them, and
your own `environment` keys always win. Uncaught JS errors are captured by default. Set
`captureUncaughtErrors: false` to turn that off, and call `mite.errors.capture(error)` or
the exported `captureError` to capture one yourself. `network_state` needs the optional
`@react-native-community/netinfo` peer dependency.

### Error tracking

Mite captures uncaught JS errors, unhandled promise rejections (Hermes) and
render errors inside `<MiteErrorBoundary>`, and sends them in batches. Errors
your code catches need one call: `mite.errors.capture(error)`, or `captureError`
where no instance is at hand. Native iOS and Android crashes are not captured yet. Each occurrence joins a group for the same error, and
triage labels the group as a duplicate, recurring, a real issue, a non-issue, or
noise. Real issues become bug reports in your dashboard.

```tsx
import { captureError, MiteErrorBoundary } from '@usemite/sdk'

try {
  await checkout()
} catch (error) {
  captureError(error) // sent as handled; also attached to the next bug report
}

// Catch render errors with their component stack.
<MiteErrorBoundary fallback={({ reset }) => <Retry onPress={reset} />}>
  <App />
</MiteErrorBoundary>
```

Errors that take the app down are kept in `identityStorage` and sent on the next
launch; a synchronous store like MMKV makes that most reliable. Tune it with
`ignoreErrors`, `beforeSendError` (return `null` to drop an event), or turn it off
with `enableErrorTracking: false`. Errors do not count against your report quota.

### Release matching

Reports carry the build they came from, so Mite files each one under the release
the user was running. `app_version` comes from `expo-application` (or
`expo-constants`), and `eas_update_id`, `channel`, and `runtime_version` come from
`expo-updates` when it is installed.

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
