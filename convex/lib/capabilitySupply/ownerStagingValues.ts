import { v, type Infer } from 'convex/values'

import type { Id } from '../../_generated/dataModel'
import {
  preparedPublicationMaterialValue,
  preparedPublicationResultValue,
} from '../../capabilitySupplyPublish'
import { contextFields } from '../../capabilitySupplyShared'
import { sourceWriteArgs } from '../../sourceWriteAdmission'

export const sellerClaimValue = v.object({
  businessId: v.string(),
  endpointUrl: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  observationDigest: v.string(),
  payTo: v.string(),
  expiresAt: v.number(),
})

export const stageOwnerX402CapabilityArgs = {
  businessId: v.id('businesses'),
  offeringRef: v.string(),
  revision: v.number(),
  sourceHash: v.string(),
  prepared: preparedPublicationMaterialValue,
  sellerClaim: sellerClaimValue,
  ...contextFields,
  ...sourceWriteArgs,
} as const

export const stageOwnerX402CapabilityReturns = preparedPublicationResultValue

export type StageOwnerX402CapabilityResult = Infer<typeof preparedPublicationResultValue>

export type StageOwnerX402CapabilityArgs = {
  businessId: Id<'businesses'>
  offeringRef: string
  revision: number
  sourceHash: string
  prepared: Infer<typeof preparedPublicationMaterialValue>
  sellerClaim: Infer<typeof sellerClaimValue>
  operationKey: string
  correlationId: string
  reasonCode: string
  evidenceRefs: string[]
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}
