import { v, type Infer } from 'convex/values'
import { capabilityPublicationBindingValue, capabilityPublicationOfferingValue } from '../../../capabilitySupplyPublish'
import { workloadCronSnapshotValue } from '../../platform/workloadCron/context'

export const SOURCE_EVIDENCE = 'source:facilitator-discovery'
export const BUSINESS_SOURCE_KIND = 'facilitator-discovery-business:v1'

const exactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
export const facilitatorDiscoveryAdmissionValue = v.object({
  offering: capabilityPublicationOfferingValue,
  binding: capabilityPublicationBindingValue,
  execution: v.object({
    endpoint: v.object({ url: v.string() }),
    method: v.union(v.literal('GET'), v.literal('POST')),
    bodyPointer: v.optional(v.literal('/body')),
    queryObjectPointer: v.optional(v.literal('/query')),
    query: v.optional(v.array(v.object({
      inputPointer: v.string(),
      parameter: v.string(),
      required: v.optional(v.boolean()),
    }))),
  }),
  price: v.object({
    provider: exactAmountValue,
    platformFee: exactAmountValue,
    total: exactAmountValue,
    feeBps: v.literal(0),
  }),
  sourceImportJson: v.string(),
  sourceRevision: v.string(),
})
export type FacilitatorDiscoveryAdmissionItem = Infer<typeof facilitatorDiscoveryAdmissionValue>

export const reconcileArgs = v.object({
  items: v.array(facilitatorDiscoveryAdmissionValue),
  complete: v.boolean(),
  seenPublicationRefs: v.optional(v.array(v.string())),
  deadlineAt: v.number(),
  workload: workloadCronSnapshotValue,
})

export const reconcileResult = v.object({
  admitted: v.number(),
  published: v.number(),
  skipped: v.number(),
  withdrawn: v.number(),
  seenPublicationRefs: v.array(v.string()),
  toolRefs: v.array(v.string()),
  deadlineExceeded: v.boolean(),
})
