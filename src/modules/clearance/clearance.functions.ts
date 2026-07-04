import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'

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

export const registerAgentPrincipalMutation = sourceMutation<
  RegisterAgentPrincipalArgs,
  AgentPrincipalRecord
>('clearance:registerAgentPrincipal')

export type AgentToolWriteAdmissionResult =
  | {
      kind: 'admitted'
      toolId: 'inquiry.submit'
      scope: 'public_inquiry'
      principalId: string
      mandateId?: string | undefined
    }
  | {
      kind: 'refused'
      reason: string
    }

export const readActiveAgentToolMandateQuery = sourceQuery<
  { principalId: string; actionRef: string },
  ClearanceMandate | null
>('clearance:readActiveAgentToolMandate')

export async function resolveAgentToolWriteAdmissionThroughSource(input: {
  identity: AgentIdentity
  toolId: string
  scope: 'public_inquiry'
}): Promise<AgentToolWriteAdmissionResult> {
  if (input.toolId !== 'inquiry.submit' || input.scope !== 'public_inquiry') {
    return { kind: 'refused', reason: 'agent_tool_write_not_declared' }
  }

  const principalId = buildAgentPrincipalId(input.identity)
  if (isLocalPublicInquiryAdmissionEnabled()) {
    return { kind: 'admitted', toolId: 'inquiry.submit', scope: 'public_inquiry', principalId }
  }

  try {
    const mandate = await callPublicSourceQuery(readActiveAgentToolMandateQuery, {
      principalId,
      actionRef: 'inquiry.submit',
    })
    const evaluation = evaluateClearanceMandate({
      mandate: mandate ?? undefined,
      principalId,
      actionClass: 'contact_follow_up',
      actionRef: 'inquiry.submit',
      scope: 'public_inquiry',
      now: Date.now(),
    })

    if (evaluation.kind === 'accepted') {
      return {
        kind: 'admitted',
        toolId: 'inquiry.submit',
        scope: 'public_inquiry',
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

function isLocalPublicInquiryAdmissionEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' &&
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true' &&
    process.env.AE_DEV_AGENT_TOOL_WRITE_ADMISSION === 'public_inquiry'
}
