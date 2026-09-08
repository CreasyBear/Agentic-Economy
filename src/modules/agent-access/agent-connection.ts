import type { ProblemDetails } from '@/lib/errors'

import type { AgentAccessAuthorityMode } from './contract'
import type { AgentAccessEnvironment } from './agent-access'
import type { AgentAccessToolAccess, AgentAccessPolicy } from './policy'

export type AgentConnectionReadback = Readonly<{
  connectionRef: string
  revision: number
  principalRef: string
  agentDisplayName: string
  connectorDisplayName: string
  environment: AgentAccessEnvironment
  state: 'active' | 'expired' | 'revoked'
  authorityMode: AgentAccessAuthorityMode
  toolAccess: AgentAccessToolAccess
  toolRefs: readonly string[]
  spendingPolicy: AgentAccessPolicy
  commercialScopes: readonly string[]
  connectedAt: number
  lastRotatedAt: number
  accessExpiresAt: number
  connectionExpiresAt: number
  revokedAt?: number
  revocationReason?: string
  credentialGeneration: number
}>

export type OwnerConnectionLifecycleResult =
  | Readonly<{
      kind: 'completed' | 'replayed'
      connectionRef: string
      principalRef: string
      revision: number
      providerCleanupPending: boolean
      correlationRef: string
    }>
  | Readonly<{ kind: 'conflict'; code: string; correlationRef: string }>
  | Readonly<{ kind: 'refused'; code: 'authentication_required' | 'source_unavailable'; correlationRef: string }>

export type ConnectionProblemPresentation = Readonly<{
  heading: string
  outcome: string
  nextAction: string
  technicalReference?: string
}>

const PRESENTATIONS: Readonly<Record<string, Omit<ConnectionProblemPresentation, 'technicalReference'>>> = {
  expired_token: {
    heading: 'This connection request expired',
    outcome: 'No connection or authority changed.',
    nextAction: 'Return to your agent client and start the connection again.',
  },
  access_denied: {
    heading: 'Connection not approved',
    outcome: 'No connection or authority changed.',
    nextAction: 'Return to your agent client and continue without this connection.',
  },
  invalid_grant: {
    heading: 'This connection is no longer valid',
    outcome: 'The existing connection cannot be used or refreshed.',
    nextAction: 'Reconnect from your agent client.',
  },
  authentication_required: {
    heading: 'Sign in to continue',
    outcome: 'No connection or authority changed.',
    nextAction: 'Sign in as the Account owner, then repeat this action.',
  },
  connection_revision_conflict: {
    heading: 'Connection changed before this action completed',
    outcome: 'AE did not apply this stale change.',
    nextAction: 'Refresh the connection record and review its current state.',
  },
  source_unavailable: {
    heading: 'Connection status is temporarily unavailable',
    outcome: 'AE could not confirm whether the requested state changed.',
    nextAction: 'Refresh the connection record before trying another action.',
  },
  security_control_unavailable: {
    heading: 'Connection status is temporarily unavailable',
    outcome: 'AE could not confirm whether the requested state changed.',
    nextAction: 'Refresh the connection record before trying another action.',
  },
  provider_cleanup: {
    heading: 'Disconnected in AE; provider cleanup is pending',
    outcome: 'The connection can no longer authorize protected AE actions.',
    nextAction: 'Retry cleanup from this connection record.',
  },
  outcome_unknown: {
    heading: 'Approval outcome is not confirmed',
    outcome: 'Do not assume the connection or authority changed.',
    nextAction: 'Return to the same approval request and check its status.',
  },
  reconnect_required: {
    heading: 'Reconnect this agent',
    outcome: 'The previous connection is expired or revoked and cannot be reused.',
    nextAction: 'Use the reconnect action for the original agent client.',
  },
}

export function presentConnectionProblem(
  problem: Pick<ProblemDetails, 'code' | 'instance'>,
): ConnectionProblemPresentation {
  const presentation = PRESENTATIONS[problem.code] ?? {
    heading: 'Connection needs attention',
    outcome: 'AE could not confirm a safe connection state.',
    nextAction: 'Refresh the connection record before taking another action.',
  }
  return {
    ...presentation,
    ...(problem.instance === undefined ? {} : { technicalReference: problem.instance }),
  }
}
