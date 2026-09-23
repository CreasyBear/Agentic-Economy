import { isReverificationHint } from '@clerk/shared/authorization-errors'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import type { z } from 'zod'

import { captureAdminCommand } from '@/components/ae/admin/actions/captureAdminCommand.functions'
import {
  adminCommandRequestSchema,
  type AdminActionSheetReceipt,
} from '@/components/ae/admin/actions/actions.contracts'
import { reportAdminInvariant } from '@/lib/observability/admin-event-props'
import { callSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import { requireStrictClerkConsequenceProof, type ClerkConsequenceProofInput } from '@/lib/server/clerk-consequence-proof'
import { readOperatorContextThroughSource } from '@/lib/server/operator-context.functions'
import {
  sourceWriteAdmissionFromContext,
  sourceWriteRequestFromAdmission,
} from '@/lib/server/source-write-admission'
import type { AdminCommandAction, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  SourceWriteAdmission,
  SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'

type AdminWireArgs<A extends AdminCommandAction> = Extract<z.output<typeof adminCommandRequestSchema>, { action: A }> & Readonly<{
  proof: ClerkConsequenceProofInput
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>

const setBusinessSuppression = sourceMutation<AdminWireArgs<'set_business_suppression'>, AdminCommandReceipt<'set_business_suppression'>>('businesses:setBusinessSuppression')
const closeRemovalDispute = sourceMutation<AdminWireArgs<'close_removal_dispute'>, AdminCommandReceipt<'close_removal_dispute'>>('security:closeRemovalDispute')
const grantAdminMembership = sourceMutation<AdminWireArgs<'grant_admin_membership'>, AdminCommandReceipt<'grant_admin_membership'>>('security:grantAdminMembership')
const revokeAdminMembership = sourceMutation<AdminWireArgs<'revoke_admin_membership'>, AdminCommandReceipt<'revoke_admin_membership'>>('security:revokeAdminMembership')
const verifySourceAuthority = sourceMutation<AdminWireArgs<'verify_capability_source_authority'>, AdminCommandReceipt<'verify_capability_source_authority'>>('capabilitySupply:verifyCapabilitySourceAuthority')
const changeCommercialPolicy = sourceMutation<AdminWireArgs<'change_commercial_policy'>, AdminCommandReceipt<'change_commercial_policy'>>('moneyCommercialPolicy:change')

export const submitAdminCommandServer = createServerFn({ method: 'POST' })
  .validator((data) => adminCommandRequestSchema.parse(data))
  .handler(async ({ data, context }): Promise<AdminActionSheetReceipt> => {
    setResponseHeader('cache-control', 'private, no-store')
    try {
      const actor = await readOperatorContextThroughSource()
      if (actor.kind !== 'authorized' || !actor.allowedSurfaces.includes('admin')) {
        return { kind: 'refused', action: data.action, code: 'missing_membership', correlationId: data.correlationId }
      }
      let proof: ClerkConsequenceProofInput
      try {
        proof = await requireStrictClerkConsequenceProof(canonicalDigest({
          scope: 'admin_operator',
          action: data.action,
          input: data.input,
          reasonCode: data.reasonCode,
          evidenceRefs: data.evidenceRefs,
          ...(data.expectedStateDigest === undefined ? {} : { expectedStateDigest: data.expectedStateDigest }),
        }))
      } catch (cause) {
        if (isReverificationHint(cause)
          || (cause instanceof Error && (
            cause.message === 'authentication_required' || cause.message === 'security_evidence_unavailable'
          ))) {
          return { kind: 'refused', action: data.action, code: 'mfa_reverification_required', correlationId: data.correlationId }
        }
        throw cause
      }
      const command = { ...data, proof }
      const sourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command,
        scope: 'admin_operator',
        operationKey: data.operationKey,
        correlationId: data.correlationId,
      })
      const sourceWriteRequest = sourceWriteRequestFromAdmission(sourceWrite)
      let receipt: AdminActionSheetReceipt
      switch (data.action) {
        case 'set_business_suppression':
          receipt = await callSourceMutation(setBusinessSuppression, { ...data, proof, sourceWrite, sourceWriteRequest })
          break
        case 'close_removal_dispute':
          receipt = await callSourceMutation(closeRemovalDispute, { ...data, proof, sourceWrite, sourceWriteRequest })
          break
        case 'grant_admin_membership':
          receipt = await callSourceMutation(grantAdminMembership, { ...data, proof, sourceWrite, sourceWriteRequest })
          break
        case 'revoke_admin_membership':
          receipt = await callSourceMutation(revokeAdminMembership, { ...data, proof, sourceWrite, sourceWriteRequest })
          break
        case 'verify_capability_source_authority':
          receipt = await callSourceMutation(verifySourceAuthority, { ...data, proof, sourceWrite, sourceWriteRequest })
          break
        case 'change_commercial_policy':
          receipt = await callSourceMutation(changeCommercialPolicy, { ...data, proof, sourceWrite, sourceWriteRequest })
          break
      }
      captureAdminCommand(actor.principalRef, receipt)
      return receipt
    } catch (cause) {
      reportAdminInvariant(cause instanceof Error ? cause : new Error('Admin command failed', { cause }))
      throw new Error('admin_command_outcome_unknown', { cause })
    }
  })
