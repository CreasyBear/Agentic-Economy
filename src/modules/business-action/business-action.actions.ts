import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import { createReserveBookingProposalThroughSource } from '@/modules/business-action/business-action.functions'

const schema = z.object({
  businessId: z.string().min(1),
  buyerRef: z.string().min(1).max(200).optional(),
}).strict()

type RequestCapabilityActionResult = Readonly<{ kind: string } & Record<string, unknown>>

const outputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ok'),
    code: z.string(),
    request: z.object({ id: z.string(), status: z.string(), actionSlug: z.string() }).strict().optional(),
  }).strict(),
  z.object({
    kind: z.literal('error'),
    code: z.string(),
    retryable: z.boolean(),
    reason: z.string(),
  }).strict(),
]) as z.ZodType<RequestCapabilityActionResult>

const parameters: readonly ActionParameter[] = [
  {
    name: 'businessId',
    type: 'string',
    description: 'Published business id to propose the booking to.',
    required: true,
  },
  {
    name: 'buyerRef',
    type: 'string',
    description: 'Optional caller reference for attribution.',
    required: false,
  },
]

export const requestCapabilityAction = defineAction({
  id: 'businessAction.requestCapability',
  name: 'Propose a business action',
  summary:
    'Propose a reserve-booking to a published business for owner review. Returns a request record. Owner approval is required; AE does not book, charge, dispatch, or confirm.',
  boundaries: [
    'Proposal only: the owner must approve; AE never books, charges, dispatches, or confirms.',
    'Returns a proposed request; the business still confirms timing and availability.',
    'Refuse to call this if the person wants instant booking, payment, or autonomous execution.',
  ],
  schema,
  outputSchema,
  parameters,
  readOnly: false,
  surfaces: ['agentJson'],
  run: async ({ data, context }) =>
    createReserveBookingProposalThroughSource(
      data.buyerRef === undefined ? { businessId: data.businessId } : { businessId: data.businessId, buyerRef: data.buyerRef },
      context,
    ) as Promise<RequestCapabilityActionResult>,
})
