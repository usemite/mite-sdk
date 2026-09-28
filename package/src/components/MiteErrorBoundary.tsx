import { Component, type ErrorInfo, type ReactNode } from 'react'
import { triageContext } from '../TriageContext'

const COMPONENT_STACK_LIMIT = 2000

export interface MiteErrorBoundaryFallbackProps {
  error: unknown
  /** Clear the error and render the children again. */
  reset: () => void
}

export interface MiteErrorBoundaryProps {
  children?: ReactNode
  /** What to render after a child throws. Renders nothing when omitted. */
  fallback?: ReactNode | ((props: MiteErrorBoundaryFallbackProps) => ReactNode)
  /** Called after the error is sent to Mite. */
  onError?: (error: unknown, info: ErrorInfo) => void
}

interface State {
  error: unknown
  hasError: boolean
}

/**
 * Catches render errors below it, sends them to Mite with the component
 * stack, and shows `fallback` instead of a blank screen.
 */
export class MiteErrorBoundary extends Component<MiteErrorBoundaryProps, State> {
  state: State = { error: null, hasError: false }

  static getDerivedStateFromError(error: unknown): State {
    return { error, hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const componentStack = info.componentStack?.trim()
    triageContext.recordError(error, {
      handled: false,
      context: componentStack
        ? { component_stack: componentStack.slice(0, COMPONENT_STACK_LIMIT) }
        : undefined,
    })
    this.props.onError?.(error, info)
  }

  reset = (): void => {
    this.setState({ error: null, hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    const { fallback } = this.props
    if (typeof fallback === 'function') {
      return fallback({ error: this.state.error, reset: this.reset })
    }
    return fallback ?? null
  }
}
