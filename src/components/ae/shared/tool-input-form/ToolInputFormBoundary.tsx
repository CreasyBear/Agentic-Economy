// Invariant: Rendering failures preserve an editable JSON fallback, following Market's DirectoryToolPlayground.
import { Component, type ReactNode } from 'react'

export type ToolInputFormBoundaryProps = Readonly<{ children: ReactNode; fallback: ReactNode }>
export class ToolInputFormBoundary extends Component<ToolInputFormBoundaryProps, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  override render() { return this.state.failed ? this.props.fallback : this.props.children }
}
