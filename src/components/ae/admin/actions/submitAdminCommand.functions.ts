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
import { readClerkMfaConsequenceProof, type ClerkMfaConsequenceProofInput } from '@/lib/server/clerk-consequence-proof'
import { readOperatorContextThroughSource } from '@/lib/server/operator-context.functions'
import {
  sourceWriteAdmissionFromContext,
  sourceWriteRequestFromAdmission,
} from '@/lib/server/source-write-admission'
import type { AdminCommandAction, AdminCommandReceipt } from '@/lib/operator/admin-console/contracts'
import type { CallContentReview } from '@/lib/operator/admin-console/call-content-review'
import type {
  SourceWriteAdmission,
  SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'

type AdminWireArgs<A extends AdminCommandAction> = Extract<z.output<typeof adminCommandRequestSchema>, { action: A }> & Readonly<{
  proof?: ClerkMfaConsequenceProofInput
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>

const setBusinessSuppression = sourceMutation<AdminWireArgs<'set_business_suppression'>, AdminCommandReceipt<'set_business_suppression'>>('businesses:setBusinessSuppression')
const closeRemovalDispute = sourceMutation<AdminWireArgs<'close_removal_dispute'>, AdminCommandReceipt<'close_removal_dispute'>>('security:closeRemovalDispute')
const grantAdminMembership = sourceMutation<AdminWireArgs<'grant_admin_membership'>, AdminCommandReceipt<'grant_admin_membership'>>('security:grantAdminMembership')
const revokeAdminMembership = sourceMutation<AdminWireArgs<'revoke_admin_membership'>, AdminCommandReceipt<'revoke_admin_membership'>>('security:revokeAdminMembership')
const verifySourceAuthority = sourceMutation<AdminWireArgs<'verify_capability_source_authority'>, AdminCommandReceipt<'verify_capability_source_authority'>>('capabilitySupply:verifyCapabilitySourceAuthority')
const changeCommercialPolicy = sourceMutation<AdminWireArgs<'change_commercial_policy'>, AdminCommandReceipt<'change_commercial_policy'>>('moneyCommercialPolicy:change')
const issueTrial = sourceMutation<AdminWireArgs<'issue_trial'>, AdminCommandReceipt<'issue_trial'>>('trialAccess:issue')
const grantPromotionalCredit = sourceMutation<AdminWireArgs<'grant_promotional_credit'>, AdminCommandReceipt<'grant_promotional_credit'>>('moneyPromotionalCredit:grant')

const setPaymentsPaused = sourceMutation<AdminWireArgs<'set_payments_paused'>, AdminCommandReceipt<'set_payments_paused'>>('adminTreasuryCommands:setPaymentsPaused')
const changeTreasuryThresholds = sourceMutation<AdminWireArgs<'change_treasury_thresholds'>, AdminCommandReceipt<'change_treasury_thresholds'>>('adminTreasuryCommands:changeThresholds')
const reviewCallContent = sourceMutation<AdminWireArgs<'review_call_content'>, CallContentReview>('adminCallContent:review')

export const submitAdminCommandServer = createServerFn({ method: 'POST' })
  .validator((data) => adminCommandRequestSchema.parse(data))
  .handler(async ({ data, context }): Promise<AdminActionSheetReceipt> => {
    setResponseHeader('cache-control', 'private, no-store')
    try {
      const actor = await readOperatorContextThroughSource()
      if (actor.kind !== 'authorized' || !actor.allowedSurfaces.includes('admin')) {
        return { kind: 'refused', action: data.action, code: 'missing_membership', correlationId: data.correlationId }
      }
      // Convex checks current authority and an exact recorded operation before
      // requiring MFA for a new effect. A lost acknowledgement can therefore
      // be recovered after the original verification has expired.
      const proof = await readClerkMfaConsequenceProof()
      const evidence = proof === undefined ? {} : { proof }
      const command = { ...data, ...evidence }
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
        case 'review_call_content':
          receipt = (await callSourceMutation(reviewCallContent, { ...data, ...evidence, sourceWrite, sourceWriteRequest })).receipt
          break
        case 'set_payments_paused':
          receipt = await callSourceMutation(setPaymentsPaused, { ...data, ...evidence, sourceWrite, sourceWriteRequest })
          break
        case 'change_treasury_thresholds':
          receipt = await callSourceMutation(changeTreasuryThresholds, { ...data, ...evidence, sourceWrite, sourceWriteRequest })
          break
        case 'set_business_suppression':
          receipt = await callSourceMutation(setBusinessSuppression, { ...data, ...evidence, sourceWrite, sourceWriteRequest })
          break
        case 'close_removal_dispute':
          receipt = await callSourceMutation(closeRemovalDispute, { ...data, ...evidence, sourceWrite, sourceWriteRequest })
          break
        case 'grant_admin_membership':
          receipt = await callSourceMutation(grantAdminMembership, { ...data, ...evidence, sourceWrite, sourceWriteRequest })
          break
        case 'revoke_admin_membership':
          receipt = await callSourceMutation(revokeAdminMembership, { ...data, ...evidence, sourceWrite, sourceWriteRequest })
          break
        case 'verify_capability_source_authority':
          receipt = await callSourceMutation(verifySourceAuthority, { ...data, ...evidence, sourceWrite, sourceWriteRequest })
          break
        case 'change_commercial_policy':
          receipt = await callSourceMutation(changeCommercialPolicy, { ...data, ...evidence, sourceWrite, sourceWriteRequest })
          break
        case 'issue_trial':
          receipt = await callSourceMutation(issueTrial, { ...data, ...evidence, sourceWrite, sourceWriteRequest })
          break
        case 'grant_promotional_credit':
          receipt = await callSourceMutation(grantPromotionalCredit, { ...data, ...evidence, sourceWrite, sourceWriteRequest })
          break
      }
      captureAdminCommand(actor.principalRef, receipt)
      return receipt
    } catch (cause) {
      reportAdminInvariant(cause instanceof Error ? cause : new Error('Admin command failed', { cause }))
      throw new Error('admin_command_outcome_unknown', { cause })
    }
  })
