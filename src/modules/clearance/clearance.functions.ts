import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'

import {
  declaredAgentToolWriteScope,
  type AgentToolWriteScope,
  type AgentToolWriteToolId,
} from '@/modules/harness/agent-tool-write-scope'

import {
  evaluateClearanceMandate,
  type ClearanceMandate,
} from './internal/mandate'
import type { AgentIdentity } from './internal/web-bot-auth'
import {
  buildAgentPrincipalId,
  type AgentPrincipalRecord,
} from './principal-contract'

export type RegisterAgentPrincipalArgs = {
  signatureAgent: string
  keyid: string
  verifiedAt: string
  observedAt?: number
  operationKey: string
  correlationId: string
  sourceWrite: SourceWriteAdmission
}

const registerAgentPrincipalMutation = sourceMutation<
  RegisterAgentPrincipalArgs,
  AgentPrincipalRecord
>('clearance:registerAgentPrincipal')

export type AgentToolWriteAdmissionResult =
  | {
      kind: 'admitted'
      toolId: AgentToolWriteToolId
      scope: AgentToolWriteScope
      principalId: string
      mandateId?: string | undefined
    }
  | {
      kind: 'refused'
      reason: string
    }

const readActiveAgentToolMandateQuery = sourceQuery<
  { principalId: string; actionRef: string },
  ClearanceMandate | null
>('clearance:readActiveAgentToolMandate')

export async function resolveAgentToolWriteAdmissionThroughSource(input: {
  identity: AgentIdentity
  toolId: string
  scope: AgentToolWriteScope
}): Promise<AgentToolWriteAdmissionResult> {
  if (declaredAgentToolWriteScope(input.toolId) !== input.scope) {
    return { kind: 'refused', reason: 'agent_tool_write_not_declared' }
  }

  const principalId = buildAgentPrincipalId(input.identity)
  if (isLocalAgentToolWriteAdmissionEnabled(input.scope)) {
    return {
      kind: 'admitted',
      toolId: input.toolId as AgentToolWriteToolId,
      scope: input.scope,
      principalId,
    }
  }

  try {
    const mandate = await callPublicSourceQuery(readActiveAgentToolMandateQuery, {
      principalId,
      actionRef: input.toolId,
    })
    const evaluation = evaluateClearanceMandate({
      mandate: mandate ?? undefined,
      principalId,
      actionClass: 'contact_follow_up',
      actionRef: input.toolId,
      scope: input.scope,
      now: Date.now(),
    })

    if (evaluation.kind === 'accepted') {
      return {
        kind: 'admitted',
        toolId: input.toolId as AgentToolWriteToolId,
        scope: input.scope,
        principalId,
        mandateId: evaluation.mandate.mandateId,
      }
    }

    return { kind: 'refused', reason: evaluation.reason }
  } catch (error) {
    if (error instanceof ConvexSourceError && error.code === 'missing_convex_url') {
      return { kind: 'refused', reason: 'agent_tool_admission_unavailable' }
    }

    return { kind: 'refused', reason: 'agent_tool_admission_unavailable' }
  }
}

export async function recordAgentIdentityThroughSource(
  identity: AgentIdentity,
  request: Request,
): Promise<AgentPrincipalRecord | undefined> {
  const operationKey = buildAgentPrincipalId(identity)
  const correlationId = `${operationKey}:${identity.verifiedAt}`
  const sourceWrite = await sourceWriteAdmissionFromRequest({
    request,
    scope: 'agent_identity',
    operationKey,
    correlationId,
  })
  try {
    return await callPublicSourceMutation(registerAgentPrincipalMutation, {
      signatureAgent: identity.signatureAgent,
      keyid: identity.keyid,
      verifiedAt: identity.verifiedAt,
      observedAt: Date.now(),
      operationKey,
      correlationId,
      sourceWrite,
    })
  } catch (error) {
    if (error instanceof ConvexSourceError && error.code === 'missing_convex_url') {
      return undefined
    }

    throw error
  }
}

function isLocalAgentToolWriteAdmissionEnabled(scope: AgentToolWriteScope): boolean {
  return isLocalE2EAuthBypassEnabled() && process.env.AE_DEV_AGENT_TOOL_WRITE_ADMISSION === scope
}
