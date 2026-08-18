import { z } from 'zod'

import { defineAction, type Action, type ActionResult } from '@/modules/common/action'

const retiredInputSchema = z.object({}).passthrough()
const retiredOutputSchema = z.object({ kind: z.string() }).passthrough()

function retiredCustomerRequestAction(
  id: string,
  name: string,
  readOnly: boolean,
): Action<Record<string, unknown>, ActionResult> {
  return defineAction({
    id,
    name,
    summary: 'Retired Customer Request surface. Use /api/v1/operations/call for paid market work.',
    boundaries: [
      'This quarantined surface is gone.',
      'Does not plan, confirm, dispatch, or inspect Customer Request state.',
    ],
    schema: retiredInputSchema,
    outputSchema: retiredOutputSchema,
    parameters: [],
    readOnly,
    effect: {
      class: 'observation',
      reversible: true,
      recipientKind: 'none',
      dataClasses: [],
      spendExposure: 'none',
      approval: 'none',
    },
    surfaces: ['http', 'agentJson'],
    invocationContract: {
      version: `${id}:retired`,
      consequenceClass: 'read_only',
      materialInputPaths: [],
      authorityRequirement: 'none',
      retryClass: 'replayable',
      expectedEvidence: [],
      safeContinuations: ['use /api/v1/operations/call'],
      invalidationConditions: ['customer_request_tables_unlisted'],
    },
    run: async () => {
      throw new Error('customer_request_tables_unlisted')
    },
  })
}

export const customerRequestConfirmAction = retiredCustomerRequestAction(
  'customerRequest.confirm',
  'Confirm a Customer Request option',
  false,
)
export const customerRequestRunAction = retiredCustomerRequestAction(
  'customerRequest.run',
  'Run a Customer Request',
  false,
)
export const customerRequestCancelAction = retiredCustomerRequestAction(
  'customerRequest.cancel',
  'Cancel a Customer Request',
  false,
)
export const customerRequestReportProblemAction = retiredCustomerRequestAction(
  'customerRequest.reportProblem',
  'Report a Customer Request problem',
  false,
)
export const customerRequestReplyProblemAction = retiredCustomerRequestAction(
  'customerRequest.replyProblem',
  'Reply to a Customer Request problem',
  false,
)
export const customerRequestInspectEvidenceAction = retiredCustomerRequestAction(
  'customerRequest.inspectEvidence',
  'Inspect Customer Request evidence',
  true,
)
export const customerRequestAllowRepeatPermissionAction = retiredCustomerRequestAction(
  'customerRequest.allowRepeatPermission',
  'Allow a Customer Request repeat permission',
  false,
)
export const customerRequestUseRepeatPermissionAction = retiredCustomerRequestAction(
  'customerRequest.useRepeatPermission',
  'Use a Customer Request repeat permission',
  false,
)
export const customerRequestInspectRepeatPermissionAction = retiredCustomerRequestAction(
  'customerRequest.inspectRepeatPermission',
  'Inspect a Customer Request repeat permission',
  true,
)
export const customerRequestPlanPreviewAction = retiredCustomerRequestAction(
  'customerRequest.planPreview',
  'Preview a Customer Request plan',
  true,
)
export const customerRequestListConnectedAssistantsAction = retiredCustomerRequestAction(
  'customerRequest.listConnectedAssistants',
  'List Customer Request connected assistants',
  true,
)
export const customerRequestWithdrawRepeatPermissionAction = retiredCustomerRequestAction(
  'customerRequest.withdrawRepeatPermission',
  'Withdraw a Customer Request repeat permission',
  false,
)
