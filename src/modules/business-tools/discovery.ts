import type { OfferingRef } from '@/modules/common/ids'
import { convertSchemaToJsonSchema } from '@tanstack/ai'

import { describeActionForAgent, resolveActionContract } from '@/modules/common/action'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import { submitInquiryAction } from '@/modules/inquiries/inquiry.actions'

import {
  BUSINESS_TOOL_AGENT_SCOPE,
  businessToolInvokeSchema,
  businessToolPrepareSchema,
  InquirySubmitToolId,
  type BusinessToolDescriptor,
} from './public'

const prepareJsonSchema = convertSchemaToJsonSchema(businessToolPrepareSchema)
const invokeJsonSchema = convertSchemaToJsonSchema(businessToolInvokeSchema)

export function buildBusinessToolDescriptor(input: Readonly<{
  businessSlug: string
  offeringRef: OfferingRef
  baseUrl: string
}>): BusinessToolDescriptor {
  const contract = resolveActionContract(submitInquiryAction)
  const described = describeActionForAgent(submitInquiryAction)
  const base = `${trimTrailingSlashes(input.baseUrl)}/${encodeURIComponent(input.businessSlug)}/tools/${InquirySubmitToolId}`

  return {
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
    boundTarget: { businessSlug: input.businessSlug, offeringRef: input.offeringRef },
    ...(prepareJsonSchema === undefined ? {} : { prepareInputJsonSchema: prepareJsonSchema }),
    ...(invokeJsonSchema === undefined ? {} : { invokeInputJsonSchema: invokeJsonSchema }),
    ...(described.outputJsonSchema === undefined ? {} : { outputJsonSchema: described.outputJsonSchema }),
  }
}
