import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { degrade } from '@/lib/observability/degrade'
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from './source-write-admission'

export type OwnerAdminBootstrapStatus =
  | { kind: 'eligible' }
  | { kind: 'active'; auditEventRef: string | null }
  | { kind: 'recorded'; auditEventRef: string }
  | { kind: 'ineligible'; reason: string }
  | { kind: 'unavailable' }
type SubmissionResult = Exclude<OwnerAdminBootstrapStatus, { kind: 'eligible' } | { kind: 'unavailable' }>
  | { kind: 'refused'; reason: string } | { kind: 'unknown' }
const reference = z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/u)
const readInput = z.strictObject({ operationKey: reference.optional() })
const commandInput = z.strictObject({
  reasonCode: z.string().trim().min(1).max(200),
  evidenceRefs: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  operationKey: reference, correlationId: reference,
})
export type OwnerAdminBootstrapCommand = z.output<typeof commandInput>
const eligibility = sourceQuery<z.output<typeof readInput>, Exclude<OwnerAdminBootstrapStatus, { kind: 'unavailable' }>>('security:readOwnerAdminBootstrap')
const bootstrap = sourceMutation<OwnerAdminBootstrapCommand & {
  sourceWrite: SourceWriteAdmission; sourceWriteRequest: SourceWriteAdmissionRequest
}, { kind: 'ok' } | { kind: 'error'; reason: string }>('security:bootstrapOwnerAdmin')

export const readOwnerAdminBootstrapServer = createServerFn({ method: 'GET' })
  .validator(input => readInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<OwnerAdminBootstrapStatus> => {
    setResponseHeader('cache-control', 'private, no-store')
    try { return await callSourceQuery(eligibility, data) }
    catch (cause) { return degrade(cause, { kind: 'unavailable' } as const, { site: 'readOwnerAdminBootstrap', reason: 'source_unavailable' }) }
  })

/** The authenticated source transport supplies identity. A readback precedes every
 * attempt; retries retain the exact command. Unknown acknowledgement never retries itself. */
export const bootstrapOwnerAdminServer = createServerFn({ method: 'POST' })
  .validator(input => commandInput.parse(input))
  .handler(async ({ data, context }): Promise<SubmissionResult> => {
    setResponseHeader('cache-control', 'private, no-store')
    let sourceWrite: SourceWriteAdmission
    try {
      sourceWrite = await sourceWriteAdmissionFromContext({ context, command: data,
        scope: 'admin_operator', operationKey: data.operationKey, correlationId: data.correlationId })
      if (sourceWrite.method !== 'POST' || sourceWrite.initiatorOrigin !== sourceWrite.targetOrigin) {
        return { kind: 'refused', reason: 'request_unavailable' }
      }
    } catch (cause) {
      return degrade(cause, { kind: 'refused', reason: 'request_unavailable' } as const, { site: 'bootstrapOwnerAdminAdmission', reason: 'source_unavailable' })
    }
    try {
      const status = await callSourceQuery(eligibility, { operationKey: data.operationKey })
      if (status.kind !== 'eligible') return status
      const result = await callSourceMutation(bootstrap, { ...data, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) })
      if (result.kind !== 'ok') return { kind: 'refused', reason: result.reason }
      try {
        const receipt = await callSourceQuery(eligibility, { operationKey: data.operationKey })
        return receipt.kind === 'eligible' ? { kind: 'active', auditEventRef: null } : receipt
      }
      catch (cause) { return degrade(cause, { kind: 'active', auditEventRef: null } as const, { site: 'bootstrapOwnerAdminReceipt', reason: 'source_unavailable' }) }
    } catch (cause) {
      return degrade(cause, { kind: 'unknown' } as const, { site: 'bootstrapOwnerAdmin', reason: 'source_unavailable' })
    }
  })
