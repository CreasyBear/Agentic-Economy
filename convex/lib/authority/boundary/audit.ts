import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { createAgentAuditEnvelope } from '@/modules/agent-access/public'
import { createPackage3AuditEvent } from '@/modules/observability/public'
import { persistAuditEvent } from '../../security/audit/persistence'

export const LAST_AUTHENTICATED_WRITE_INTERVAL_MS = 15 * 60 * 1_000
const KNOWN_CREDENTIAL_DENIAL_BUCKET_MS = 5 * 60 * 1_000

export async function persistSuccessfulAuthentication(
  ctx: MutationCtx,
  credential: Doc<'credentials'>,
  admission: Doc<'agentAccessPrincipals'>,
  authenticatedAt: number,
): Promise<void> {
  const bucketStart = Math.floor(authenticatedAt / LAST_AUTHENTICATED_WRITE_INTERVAL_MS)
    * LAST_AUTHENTICATED_WRITE_INTERVAL_MS
  const bucketRef = `agent-credential-authenticated:${credential.credentialRef}:${bucketStart}`
  const audit = createPackage3AuditEvent(createAgentAuditEnvelope({
    eventType: 'agent.credential.authenticated',
    actorPrincipalRef: credential.principalRef,
    activeAccountRef: admission.ownerId,
    agentRef: credential.principalRef,
    credentialRef: credential.credentialRef,
    correlationRef: bucketRef,
    idempotencyRef: bucketRef,
    authorityGeneration: admission.grantGeneration,
    occurredAt: authenticatedAt,
    beforeState: 'presented',
    outcome: 'authenticated',
  }))
  if (!audit.valid) throw new Error(`agent_credential_authentication_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
}

export async function persistKnownCredentialDenial(
  ctx: MutationCtx,
  credential: Doc<'credentials'>,
  admission: Doc<'agentAccessPrincipals'>,
  deniedAt: number,
  reasonCode: 'authentication_required' | 'scope_required',
): Promise<void> {
  const bucketStart = Math.floor(deniedAt / KNOWN_CREDENTIAL_DENIAL_BUCKET_MS)
    * KNOWN_CREDENTIAL_DENIAL_BUCKET_MS
  const bucketRef = `agent-credential-denial:${credential.credentialRef}:${bucketStart}`
  const audit = createPackage3AuditEvent(createAgentAuditEnvelope({
    eventType: 'agent.credential.denied',
    actorPrincipalRef: credential.principalRef,
    activeAccountRef: admission.ownerId,
    agentRef: credential.principalRef,
    credentialRef: credential.credentialRef,
    correlationRef: bucketRef,
    idempotencyRef: bucketRef,
    authorityGeneration: admission.grantGeneration,
    occurredAt: deniedAt,
    beforeState: 'presented',
    outcome: 'denied',
    reasonCode,
  }))
  if (!audit.valid) throw new Error(`agent_credential_denial_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)
}
