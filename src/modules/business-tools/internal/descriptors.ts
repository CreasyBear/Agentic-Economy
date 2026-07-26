import { convertSchemaToJsonSchema } from '@tanstack/ai'
import { z } from 'zod'

import { describeActionForAgent, resolveActionContract } from '@/modules/common/action'
import { submitInquiryAction } from '@/modules/inquiries/inquiry.actions'

import {
  BUSINESS_TOOL_AGENT_SCOPE,
  type BusinessToolDescriptor,
} from '../public'

export const InquirySubmitToolId = 'inquiry.submit' as const

/**
 * The agent-facing shape is deliberately narrower than the action's own input.
 *
 * `target` is absent because the URL already names the business; letting a
 * caller pass one would create two sources of truth for who is being
 * contacted. `expectedDigest` is absent from prepare because prepare is what
 * produces it.
 */
export const businessToolPrepareSchema = z.strictObject({
  body: z.string().min(1).max(2_000),
  contact: z.strictObject({
    name: z.string().max(200).optional(),
    email: z.string().max(254).optional(),
    phone: z.string().max(32).optional(),
  }),
})

export const businessToolInvokeSchema = businessToolPrepareSchema.extend({
  expectedDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  operationKey: z.string().trim().min(16).max(240).optional(),
})

const prepareJsonSchema = convertSchemaToJsonSchema(businessToolPrepareSchema)
const invokeJsonSchema = convertSchemaToJsonSchema(businessToolInvokeSchema)

export function buildBusinessToolDescriptors(input: Readonly<{
  businessSlug: string
  capabilityKind: string
  baseUrl: string
}>): readonly BusinessToolDescriptor[] {
  const contract = resolveActionContract(submitInquiryAction)
  const described = describeActionForAgent(submitInquiryAction)
  const base = `${input.baseUrl.replace(/\/+$/u, '')}/${encodeURIComponent(input.businessSlug)}/tools/${InquirySubmitToolId}`

  return [{
    toolId: InquirySubmitToolId,
    name: submitInquiryAction.name,
    summary: submitInquiryAction.summary,
    boundaries: submitInquiryAction.boundaries,
    readOnly: submitInquiryAction.readOnly,
    consequenceClass: contract.consequenceClass,
    authorityRequirement: contract.authorityRequirement,
    contractVersion: contract.version,
    invocation: {
      kind: 'prepare_then_commit',
      prepareUrl: `${base}/prepare`,
      invokeUrl: base,
      method: 'POST',
      authentication: 'api_key',
      requiredScope: BUSINESS_TOOL_AGENT_SCOPE,
    },
    boundTarget: { businessSlug: input.businessSlug, capabilityKind: input.capabilityKind },
    ...(prepareJsonSchema === undefined ? {} : { prepareInputJsonSchema: prepareJsonSchema }),
    ...(invokeJsonSchema === undefined ? {} : { invokeInputJsonSchema: invokeJsonSchema }),
    ...(described.outputJsonSchema === undefined ? {} : { outputJsonSchema: described.outputJsonSchema }),
  }]
}
