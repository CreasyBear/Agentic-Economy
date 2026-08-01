import { convertSchemaToJsonSchema } from '@tanstack/ai'

import { describeActionForAgent, resolveActionContract } from '@/modules/common/action'
import { submitInquiryAction } from '@/modules/inquiries/inquiry.actions'

import {
  BUSINESS_TOOL_AGENT_SCOPE,
  businessToolInvokeSchema,
  businessToolPrepareSchema,
  InquirySubmitToolId,
  type BusinessToolDescriptor,
} from '../public'

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
