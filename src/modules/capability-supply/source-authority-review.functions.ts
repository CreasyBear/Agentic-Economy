import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'
import type { AdminCommandArgs, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { requireStrictClerkConsequenceProof } from '@/lib/server/clerk-consequence-proof'

import { callSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import {
  sourceWriteAdmissionFromContext,
  sourceWriteRequestFromAdmission,
} from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { degradeBackend } from '@/lib/observability/degrade-backend'

export const sourceAuthorityReviewInputSchema = z.strictObject({
  publicationRef: z.string().trim().min(1).max(300),
  expectedRevision: z.number().int().positive(),
  expectedSourceDigest: z.string().trim().min(1).max(300),
  evidenceRef: z.string().trim().min(1).max(500),
})

export type SourceAuthorityReviewResult =
  | AdminCommandReceipt<'verify_capability_source_authority'>
  | Readonly<{ kind: 'error'; code: 'source_unavailable' }>

const verifySourceAuthorityMutation = sourceMutation<
  Record<string, unknown>,
  Exclude<SourceAuthorityReviewResult, { kind: 'error' }>
>('capabilitySupply:verifyCapabilitySourceAuthority')

export const reviewSourceAuthorityServer = createServerFn({ method: 'POST' })
  .validator((data) => sourceAuthorityReviewInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<SourceAuthorityReviewResult> => {
    setResponseHeader('cache-control', 'private, no-store')
    const reviewDigest = canonicalDigest({
      publicationRef: data.publicationRef,
      expectedRevision: data.expectedRevision,
      expectedSourceDigest: data.expectedSourceDigest,
      evidenceRef: data.evidenceRef,
    })
    const command: Omit<AdminCommandArgs<'verify_capability_source_authority'>, 'proof'> = {
      action: 'verify_capability_source_authority',
      input: {
        publicationRef: data.publicationRef,
        expectedRevision: data.expectedRevision,
        expectedSourceDigest: data.expectedSourceDigest,
      },
      reasonCode: 'evidence_verified',
      evidenceRefs: [data.evidenceRef],
      approval: { kind: 'execute' },
      operationKey: `source-authority-review:${reviewDigest}`,
      correlationId: `source-authority-review:${reviewDigest}`,
    }
    try {
      const proof = await requireStrictClerkConsequenceProof(canonicalDigest({
        scope: 'admin_operator', action: command.action, input: command.input,
        reasonCode: command.reasonCode, evidenceRefs: command.evidenceRefs,
      }))
      const sourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command: { ...command, proof },
        scope: 'admin_operator',
        operationKey: command.operationKey,
        correlationId: command.correlationId,
      })
      return await callSourceMutation(verifySourceAuthorityMutation, {
        ...command,
        proof,
        sourceWrite,
        sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      })
    } catch (cause) {
      return degradeBackend(cause, { kind: 'error' as const, code: 'source_unavailable' as const }, { site: 'reviewSourceAuthorityServer', reason: 'source_unavailable' })
    }
  })
