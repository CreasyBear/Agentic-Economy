import type { AgentDirectoryProjection } from './agent-operator-view-model'

/**
 * Operator Agent-access page search and lifecycle command/issue types.
 *
 * `caller` is a canonical Principal id (`prn_` + 32 hex), not a Customer.
 * `resumeTool` is a Tool ref (`operation:v1:` + 64 hex), not a Call.
 */

export type AgentAccessSearch = Readonly<{
  caller?: string
  resumeTool?: string
}>

export type LifecycleCommand =
  | Readonly<{ kind: 'agent'; ref: string }>
  | Readonly<{ kind: 'connection'; ref: string; expectedRevision: number }>

export type LifecycleIssue = Readonly<{
  title: string
  message: string
  correlationRef?: string
  retry?: LifecycleCommand
}>

export type DirectoryPaginationIssue = Readonly<{
  source: AgentDirectoryProjection
  cursor: string
}>
