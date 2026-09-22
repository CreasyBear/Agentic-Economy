import { v, type Infer } from 'convex/values'

import {
  callReceiptValue,
  usageValue,
} from '@/modules/capability-execution/convex'
import { purchaseResolutionRecordValidator } from '@/modules/capability-execution/purchase-resolution'
import type {
  AdminCallView,
  AdminQuoteView,
  AdminTimelineEntry,
} from '@/lib/operator/admin-console/views'

import { adminAgentViewValue } from './agent'
import { adminToolVersionViewValue } from './toolVersion'
import { adminWorkspaceViewValue } from './workspace'

export const adminObjectKindValue = v.union(
  v.literal('call'),
  v.literal('quote'),
  v.literal('tool_version'),
  v.literal('workspace'),
  v.literal('agent'),
  v.literal('provider'),
)

export const adminObjectRefValue = v.union(
  v.object({ kind: v.literal('call'), ref: v.string() }),
  v.object({ kind: v.literal('quote'), ref: v.string() }),
  v.object({ kind: v.literal('tool_version'), ref: v.string() }),
  v.object({ kind: v.literal('workspace'), ref: v.string() }),
  v.object({ kind: v.literal('agent'), ref: v.string() }),
  v.object({ kind: v.literal('provider'), ref: v.string() }),
)

export const adminTimelineEntryValue = v.object({
  at: v.number(),
  eventType: v.string(),
  actorRef: v.union(v.string(), v.null()),
  outcome: v.union(v.string(), v.null()),
})

const buyerCallPurchaseStatusValue = v.object({
  kind: v.union(
    v.literal('pending'),
    v.literal('uncertain'),
    v.literal('delivered'),
    v.literal('refunded'),
    v.literal('failed'),
  ),
  label: v.union(
    v.literal('Open — pending'),
    v.literal('Open — outcome uncertain'),
    v.literal('Resolved — delivered'),
    v.literal('Resolved — refunded'),
    v.literal('Resolved — failed'),
  ),
  attention: v.boolean(),
})

const callReceiptStageValue = v.object({
  id: v.union(
    v.literal('authorized'),
    v.literal('reserved'),
    v.literal('submitted'),
    v.literal('settled'),
    v.literal('validated'),
    v.literal('complete'),
  ),
  label: v.string(),
  state: v.union(
    v.literal('complete'),
    v.literal('current'),
    v.literal('pending'),
    v.literal('attention'),
  ),
  detail: v.string(),
})

const callIssueValue = v.object({
  title: v.string(),
  whatHappened: v.string(),
  moneyMovement: v.string(),
  automaticNext: v.string(),
  userNext: v.string(),
  retainedReference: v.string(),
})

const adminCallReceiptViewValue = v.object({
  version: v.literal('ae.public-invocation-receipt:v1'),
  callRef: v.string(),
  toolRef: v.optional(v.string()),
  statusLabel: v.string(),
  statusDetail: v.string(),
  stages: v.array(callReceiptStageValue),
  usage: v.optional(usageValue),
  receipt: v.optional(callReceiptValue),
  resultKind: v.optional(v.union(
    v.literal('completed'),
    v.literal('pending'),
    v.literal('needs_authority'),
    v.literal('reconciliation_required'),
    v.literal('refused'),
  )),
  evidenceHash: v.optional(v.string()),
  issue: v.optional(callIssueValue),
  purchaseResolution: v.optional(purchaseResolutionRecordValidator),
  complete: v.boolean(),
})

export const adminCallViewValue = v.object({
  kind: v.literal('call'),
  ref: v.string(),
  state: v.union(
    v.literal('pending'),
    v.literal('completed'),
    v.literal('refused'),
    v.literal('reconciliation_required'),
    v.literal('cancelled'),
  ),
  purchase: buyerCallPurchaseStatusValue,
  receipt: adminCallReceiptViewValue,
  quoteRef: v.union(v.string(), v.null()),
  toolRef: v.union(v.string(), v.null()),
  workspaceRef: v.union(v.string(), v.null()),
  agentRef: v.union(v.string(), v.null()),
  correlationId: v.union(v.string(), v.null()),
  resolution: v.union(purchaseResolutionRecordValidator, v.null()),
  timeline: v.array(adminTimelineEntryValue),
})

export const adminQuoteViewValue = v.object({
  kind: v.literal('quote'),
  ref: v.string(),
  state: v.union(v.literal('issued'), v.literal('consumed'), v.literal('expired')),
  toolRef: v.union(v.string(), v.null()),
  workspaceRef: v.union(v.string(), v.null()),
  agentRef: v.union(v.string(), v.null()),
  createdAt: v.number(),
  expiresAt: v.union(v.number(), v.null()),
  consumedCallRef: v.union(v.string(), v.null()),
})

export const adminObjectViewValue = v.union(
  adminCallViewValue,
  adminQuoteViewValue,
  adminWorkspaceViewValue,
  adminAgentViewValue,
  adminToolVersionViewValue,
)

type AdminCallWireView = Omit<
  AdminCallView,
  'ref' | 'quoteRef' | 'toolRef' | 'workspaceRef' | 'agentRef'
> & Readonly<{
  ref: string
  quoteRef: string | null
  toolRef: string | null
  workspaceRef: string | null
  agentRef: string | null
}>
type AdminQuoteWireView = Omit<
  AdminQuoteView,
  'ref' | 'toolRef' | 'workspaceRef' | 'agentRef' | 'consumedCallRef'
> & Readonly<{
  ref: string
  toolRef: string | null
  workspaceRef: string | null
  agentRef: string | null
  consumedCallRef: string | null
}>

const assertTimelineEntry = (view: Infer<typeof adminTimelineEntryValue>): AdminTimelineEntry => view
const assertCallView = (view: Infer<typeof adminCallViewValue>): AdminCallWireView => view
const assertQuoteView = (view: Infer<typeof adminQuoteViewValue>): AdminQuoteWireView => view
void [assertTimelineEntry, assertCallView, assertQuoteView]
